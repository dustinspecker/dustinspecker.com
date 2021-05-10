---
title: "Scaling Kubernetes Pods using Prometheus Metrics"
images:
  - images/scaling-kubernetes-pods-prometheus-metrics/scaling-kubernetes-pods-prometheus-metrics.png
date: 2021-05-09T12:00:00Z
lastmod: 2021-05-09T12:00:00Z
draft: false
categories:
  - development
tags:
  - kubernetes
  - Prometheus
  - horizontalpodautoscaler
---

One of Kubernetes many features is auto-scaling workloads. Typically, Horizontal Pod Autoscalers scale pods based on CPU or
memory usage. During other times we could better scale by using custom metrics that Prometheus is already scraping.

Fortunately, Horizontal Pod Autoscalers can support using [custom metrics](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/#support-for-custom-metrics).

I'm a fan of the [kube-prometheus](https://github.com/prometheus-operator/kube-prometheus) project, but it wasn't apparent how
to set up a Horizontal Pod Autoscaler using custom metrics. This post walks through:

1. Deploying kube-prometheus (Prometheus operator, Prometheus adapter, Grafana, and more)
1. Creating a custom metrics APIService
1. Configuring Prometheus adapter to support our custom metrics
1. Deploying a Horizontal Pod Autoscaler for Grafana using a custom metric

## Deploy kube-prometheus

We'll need to deploy a Prometheus instance before we can begin using Prometheus metrics for scaling.

I'll be creating a Kubernetes cluster using [kind v0.10.0](https://github.com/kubernetes-sigs/kind/releases/tag/v0.10.0) by running:

```bash
kind create cluster
```

Then clone [kube-prometheus v0.8.0](https://github.com/prometheus-operator/kube-prometheus) by executing:

```bash
git clone https://github.com/prometheus-operator/kube-prometheus ~/kube-prometheus
cd ~/kube-prometheus
git checkout v0.8.0
```

Then using [kubectl v1.21.0](https://kubernetes.io/docs/tasks/tools/#kubectl), apply the kube-prometheus manifests:

```bash
kubectl create --filename ~/kube-prometheus/manifests/setup/
until kubectl get servicemonitors --all-namespaces ; do sleep 1; done
kubectl create --filename ~/kube-prometheus/manifests/
```

This will set us up with Prometheus, Alert Manager, and Grafana instances. Important to note is a component named `prometheus-adapter`.
This component is responsible for taking Prometheus metrics and translating them to Kubernetes-supported metrics using APIService objects.

## Create custom metrics APIService

The kube-prometheus project includes a [metrics APIService](https://github.com/prometheus-operator/kube-prometheus/blob/v0.8.0/manifests/prometheus-adapter-apiService.yaml),
which supports CPU and memory usage of pods for Horizontal Pod Autoscaler and commands like `kubectl top pods --all-namespaces`.
To leverage other Prometheus metrics for Horizontal Pod Autoscaler, we'll need a custom metrics APIService, which its specification
will look very similar to the metrics APIService.

Create a file named `~/custom-metrics-apiservice.yaml` with the following:

```yaml
apiVersion: apiregistration.k8s.io/v1
kind: APIService
metadata:
  name: v1beta1.custom.metrics.k8s.io
spec:
  group: custom.metrics.k8s.io
  groupPriorityMinimum: 100
  insecureSkipTLSVerify: true
  service:
    name: prometheus-adapter
    namespace: monitoring
    port: 443
  version: v1beta1
  versionPriority: 100
```

and apply it via:

```bash
kubectl apply --filename ~/custom-metrics-apiservice.yaml
```

This will inform Kubernetes that the `prometheus-adapter` service supports the `custom.metrics.k8s.io` interface used by
Horizontal Pod Autoscaler.

To confirm the custom metrics APIService is configured correctly, run:

```bash
kubectl get --raw /apis/custom.metrics.k8s.io/
```

to see output similar to:

```json
{
  "kind": "APIGroup",
  "apiVersion": "v1",
  "name": "custom.metrics.k8s.io",
  "versions": [
    {
      "groupVersion": "custom.metrics.k8s.io/v1beta1",
      "version": "v1beta1"
    }
  ],
  "preferredVersion": {
    "groupVersion": "custom.metrics.k8s.io/v1beta1",
    "version": "v1beta1"
  }
}
```

## Edit prometheus-adapter configmap

We need to configure the Prometheus adapter to create custom metrics before using them for scaling.

For this, we'll modify the `prometheus-adapter`'s Config Map:

```bash
kubectl edit --namespace monitoring configmap adapter-config
```

Take a look at the `config.yaml` value and note that `kube-prometheus` has already configured
`resourceRules` for reporting CPU and memory usage.

At the same level as `resourceRules`, create a key named `rules` looking like:

```yaml
"rules":
  # seriesQuery is a Prometheus query on its own, we'll set up parameters below
  # container_network_receive_bytes_total is a metric provided to us as part of kube-prometheus
  - "seriesQuery": "container_network_receive_bytes_total"
    # resources overrides allows us to define parameters for our query
    "resources":
      "overrides":
        # define a `namespace` parameter, where the value is the namespace of the resource (pods for our HorizonalPodAutoscaler)
        "namespace":
          "resource": "namespace"
        # define a `pod` parameter, where the value is the name of the resource (pods for our HorizonalPodAutoscaler)
        "pod":
          "resource": "pod"
    # We want to scale pods due to a surge in traffic. A metric that is a total isn't great for this, but
    # we can see the rate of change using Prometheus' `rate`, which is a good metric to scale by
    # metricsQuery is Go templating with a few variables defined such as `.Series` being seriesQuery
    # and .LabelMatchers being parameters for our query
    "metricsQuery": 'sum(rate(<<.Series>>{id=~".*docker.*",<<.LabelMatchers>>}[2m])) by (<<.GroupBy>>)'
    # name allows us to modify the metric name given the seriesQuery
    # by default the name would be container_network_receive_bytes_total, which is misleading after our metricsQuery
    # produces a metric where we get bytes received per second
    "name":
      # matches allows to use capture groups to select the part of seriesQuery we want
      # in this case we're capturing everything before `_total` resulting in `container_network_receive_bytes`
      "matches": "^(.*)_total$"
      # as allows us to use our capture groups from `matches` and adjust as desired
      # in this case we're appending `_per_second` to `container_network_receive_bytes` resulting in `container_network_receive_bytes_per_second`
      "as": "${1}_per_second"
```

I've annotated above to explain what's going on in `rules`.

Adding the `rules` list will begin populating the custom metrics once the adapter has loaded this configuration file.

We'll then need to re-create the `prometheus-adapter` pods to take the config changes. We can delete these pods, and then Kubernetes
will re-create them by running:

```bash
kubectl delete pod --namespace monitoring --selector app.kubernetes.io/name=prometheus-adapter
```

To verify the new configuration changes were picked up, run:

```bash
kubectl get --raw /apis/custom.metrics.k8s.io/v1beta1
```

which will output something similar to:

```json
{
  "kind": "APIResourceList",
  "apiVersion": "v1",
  "groupVersion": "custom.metrics.k8s.io/v1beta1",
  "resources": [
    {
      "name": "pods/container_network_receive_bytes_per_second",
      "singularName": "",
      "namespaced": true,
      "kind": "MetricValueList",
      "verbs": ["get"]
    },
    {
      "name": "namespaces/container_network_receive_bytes_per_second",
      "singularName": "",
      "namespaced": false,
      "kind": "MetricValueList",
      "verbs": ["get"]
    }
  ]
}
```

and we can run:

```bash
kubectl get --raw /apis/custom.metrics.k8s.io/v1beta1/namespaces/monitoring/pods/*/container_network_receive_bytes_per_second
```

to see the metrics like:

```json
{
  "kind": "MetricValueList",
  "apiVersion": "custom.metrics.k8s.io/v1beta1",
  "metadata": {
    "selfLink": "/apis/custom.metrics.k8s.io/v1beta1/namespaces/monitoring/pods/%2A/container_network_receive_bytes_per_second"
  },
  "items": [
    {
      "describedObject": {
        "kind": "Pod",
        "namespace": "monitoring",
        "name": "alertmanager-main-0",
        "apiVersion": "/v1"
      },
      "metricName": "container_network_receive_bytes_per_second",
      "timestamp": "2021-05-10T00:17:09Z",
      "value": "610722m",
      "selector": null
    },
    {
      "describedObject": {
        "kind": "Pod",
        "namespace": "monitoring",
        "name": "alertmanager-main-1",
        "apiVersion": "/v1"
      },
      "metricName": "container_network_receive_bytes_per_second",
      "timestamp": "2021-05-10T00:17:09Z",
      "value": "571322m",
      "selector": null
    },
    {
      "describedObject": {
        "kind": "Pod",
        "namespace": "monitoring",
        "name": "alertmanager-main-2",
        "apiVersion": "/v1"
      },
      "metricName": "container_network_receive_bytes_per_second",
      "timestamp": "2021-05-10T00:17:09Z",
      "value": "580533m",
      "selector": null
    },
    {
      "describedObject": {
        "kind": "Pod",
        "namespace": "monitoring",
        "name": "blackbox-exporter-55c457d5fb-xf87r",
        "apiVersion": "/v1"
      },
      "metricName": "container_network_receive_bytes_per_second",
      "timestamp": "2021-05-10T00:17:09Z",
      "value": "151644m",
      "selector": null
    },
    {
      "describedObject": {
        "kind": "Pod",
        "namespace": "monitoring",
        "name": "grafana-9df57cdc4-rlj7s",
        "apiVersion": "/v1"
      },
      "metricName": "container_network_receive_bytes_per_second",
      "timestamp": "2021-05-10T00:17:09Z",
      "value": "100133m",
      "selector": null
    },
    {
      "describedObject": {
        "kind": "Pod",
        "namespace": "monitoring",
        "name": "kube-state-metrics-76f6cb7996-6k6mp",
        "apiVersion": "/v1"
      },
      "metricName": "container_network_receive_bytes_per_second",
      "timestamp": "2021-05-10T00:17:09Z",
      "value": "964900m",
      "selector": null
    },
    {
      "describedObject": {
        "kind": "Pod",
        "namespace": "monitoring",
        "name": "node-exporter-99lgx",
        "apiVersion": "/v1"
      },
      "metricName": "container_network_receive_bytes_per_second",
      "timestamp": "2021-05-10T00:17:09Z",
      "value": "184544m",
      "selector": null
    },
    {
      "describedObject": {
        "kind": "Pod",
        "namespace": "monitoring",
        "name": "prometheus-adapter-59df95d9f5-ftjpp",
        "apiVersion": "/v1"
      },
      "metricName": "container_network_receive_bytes_per_second",
      "timestamp": "2021-05-10T00:17:09Z",
      "value": "4586688m",
      "selector": null
    },
    {
      "describedObject": {
        "kind": "Pod",
        "namespace": "monitoring",
        "name": "prometheus-adapter-59df95d9f5-jhgrf",
        "apiVersion": "/v1"
      },
      "metricName": "container_network_receive_bytes_per_second",
      "timestamp": "2021-05-10T00:17:09Z",
      "value": "502622m",
      "selector": null
    },
    {
      "describedObject": {
        "kind": "Pod",
        "namespace": "monitoring",
        "name": "prometheus-k8s-0",
        "apiVersion": "/v1"
      },
      "metricName": "container_network_receive_bytes_per_second",
      "timestamp": "2021-05-10T00:17:09Z",
      "value": "19520277m",
      "selector": null
    },
    {
      "describedObject": {
        "kind": "Pod",
        "namespace": "monitoring",
        "name": "prometheus-k8s-1",
        "apiVersion": "/v1"
      },
      "metricName": "container_network_receive_bytes_per_second",
      "timestamp": "2021-05-10T00:17:09Z",
      "value": "19049944m",
      "selector": null
    },
    {
      "describedObject": {
        "kind": "Pod",
        "namespace": "monitoring",
        "name": "prometheus-operator-7775c66ccf-hjr5p",
        "apiVersion": "/v1"
      },
      "metricName": "container_network_receive_bytes_per_second",
      "timestamp": "2021-05-10T00:17:09Z",
      "value": "178455m",
      "selector": null
    }
  ]
}
```

Some of the values may seem higher than expected but note these are `milli (m)` units.

## Create Grafana HorizonalPodAutoscaler

Lastly, we'll create a Horizontal Pod Autoscaler for the Grafana Deployment. Create a new file named `~/grafana-hpa.yaml` with
the following YAML:

```yaml
kind: HorizontalPodAutoscaler
apiVersion: autoscaling/v2beta1
metadata:
  name: grafana
  namespace: monitoring
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: grafana
  minReplicas: 1
  maxReplicas: 10
  metrics:
    - type: Pods
      pods:
        metricName: container_network_receive_bytes_per_second
        targetAverageValue: 10000m
```

> Note: The targetAverageValue is pretty low here, simply to show the HorizonalPodAutoscaler scaling quickly soon.

Apply this manifest by running:

```bash
kubectl apply --filename ~/grafana-hpa.yaml
```

Afterward, watch the Grafana pod scale by running:

```bash
kubectl get hpa --namespace monitoring --watch
```

and over time, we'll see the Grafana pods scale up.

```
NAME      REFERENCE            TARGETS      MINPODS   MAXPODS   REPLICAS   AGE
grafana   Deployment/grafana   244211m/10   1         10        1          54s
grafana   Deployment/grafana   244211m/10   1         10        1          62s
grafana   Deployment/grafana   112644m/10   1         10        4          77s
grafana   Deployment/grafana   112644m/10   1         10        8          93s
grafana   Deployment/grafana   102/10       1         10        10         108s
grafana   Deployment/grafana   100533m/10   1         10        10         2m19s
```

---

How else have you been leveraging Prometheus Metrics? Or any tips for supporting Horizontal Pod Autoscalers? Let me know
on [Twitter](https://twitter.com/dustinspecker), [LinkedIn](https://linkedin.com/in/dustin-specker), or [GitHub](https://github.com/dustinspecker).

{{< convertkit >}}
