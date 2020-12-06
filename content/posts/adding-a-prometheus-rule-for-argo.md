---
title: "Adding a Prometheus Rule for Argo"
images:
  - images/dustinspecker.jpg
date: 2020-04-19T21:12:15Z
lastmod: 2020-12-06T12:00:00Z
draft: false
categories:
  - development
tags:
  - prometheus
  - argo
  - kubernetes
---

This post builds on top of
[Viewing Argo's Prometheus metrics]({{< ref "viewing-argo-prometheus-metrics-using-kind.md" >}})
and assumes you have a Kubernetes cluster running Argo and Prometheus.

In the previous post a ServiceMonitor was created to instruct Prometheus on how to pull
metrics from Argo's workflow-controller-metrics service. Now, we'll add a PrometheusRule to fire
off an alert when any Argo Workflow fails.

> Updated (December 06, 2020):
>
> - Use Argo v2.11.8 instead of v2.7.2

## Patch k8s Prometheus to find all rules

As part of using [kube-prometheus](https://github.com/coreos/kube-prometheus/tree/v0.3.0), a
Prometheus Custom Resource named k8s is created in the monitoring namespace. This k8s
Prometheus is configured to only look for PrometheusRule Custom Resources within the same
namespace as the k8s Prometheus is deployed in. Since we've created out ServiceMonitor in the
argo namespace it's nice to add other resources to the argo namespace as well. Fortunately we can
patch the k8s Prometheus object to use PrometheusRules from all namespaces.

```bash
~/kubectl patch prometheus k8s \
  --namespace monitoring \
  --patch '{"spec": {"ruleNamespaceSelector": {}}}' \
  --type merge
```

Before the k8s Prometheus resource omitted `ruleNamespaceSelector` entirely. When this field is
omitted the Prometheus resource will only use rules found in the same namespace as the
Prometheus resource is deployed. When `ruleNamespaceSelector` is defined as an empty
map (`{}`) then rules found in any namespace are used.

## Peek at Argo's metrics

Argo has a number of metrics, but we want to focus on the `argo_workflows_count` metric.
Before getting started take a look at this metric on the Prometheus dashboard.

Run:

```bash
~/kubectl port-forward service/prometheus-k8s 9090 \
  --namespace monitoring
```

and then navigate to [http://localhost:9090](http://localhost:9090). On the main page or "Graph"
page enter an "Expression" of `argo_workflows_count{}`. This expression will return
results similar to:

| Element                                                                                                                                                                                                                   | Value |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| argo_workflows_count{endpoint="metrics",instance="10.244.0.5:9090",job="workflow-controller-metrics",namespace="argo",pod="workflow-controller-6fc987d8d-52gmh",service="workflow-controller-metrics",status="Error"}     | 0     |
| argo_workflows_count{endpoint="metrics",instance="10.244.0.5:9090",job="workflow-controller-metrics",namespace="argo",pod="workflow-controller-6fc987d8d-52gmh",service="workflow-controller-metrics",status="Failed"}    | 0     |
| argo_workflows_count{endpoint="metrics",instance="10.244.0.5:9090",job="workflow-controller-metrics",namespace="argo",pod="workflow-controller-6fc987d8d-52gmh",service="workflow-controller-metrics",status="Pending"}   | 0     |
| argo_workflows_count{endpoint="metrics",instance="10.244.0.5:9090",job="workflow-controller-metrics",namespace="argo",pod="workflow-controller-6fc987d8d-52gmh",service="workflow-controller-metrics",status="Running"}   | 0     |
| argo_workflows_count{endpoint="metrics",instance="10.244.0.5:9090",job="workflow-controller-metrics",namespace="argo",pod="workflow-controller-6fc987d8d-52gmh",service="workflow-controller-metrics",status="Skipped"}   | 0     |
| argo_workflows_count{endpoint="metrics",instance="10.244.0.5:9090",job="workflow-controller-metrics",namespace="argo",pod="workflow-controller-6fc987d8d-52gmh",service="workflow-controller-metrics",status="Succeeded"} | 1     |

Looking at these results the metrics inform us that one Argo Workflow has succeeded and zero
workflows failed. This is good, but required us manually validating this. What we really want to do
is know when any Workflow has failed. That's where PrometheusRules come into play.

## Create a PrometheusRule to alert when a Workflow fails

Let's start by creating a PrometheusRule and the easiest way is to create a YAML file with
the following content:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: workflow-controller-rules
  namespace: argo
  labels:
    prometheus: k8s
    role: alert-rules
spec:
  groups:
    - name: argo-workflows
      rules:
        - expr: argo_workflows_count{status = "Failed"} > 0
          alert: WorkflowFailures
```

This PrometheusRule will create an alert named `WorkflfowFailures`. When
the the expression is true then the alert will be fired.

The labels on the PrometheusRule are crucial as the k8s Prometheus resource
has a `ruleSelector` to match on those labels. This can be seen in the output of:

```bash
~/kubectl get prometheus k8s \
  --namespace monitoring \
  --output yaml
```

Assuming the YAML file for the above PrometheusRule is located at
`~/workflow-controller-rules.yaml`, we can create this PrometheusRule by running:

```bash
~/kubectl create \
  --filename ~/workflow-controller-rules.yaml
```

## View Prometheus Rule and Alert on Prometheus Dashboard

Once again forward the port for Prometheus if not already and then navigate to
[http://localhost:9090](http://localhost:9090). Click on the "Status" dropdown and
select "Rules." "argo-workflows" should be at the top and you'll see the same expression and
alert as we defined above. It may take a couple of minutes for the "argo-workflow" rule to appear
in Prometheus.

Now navigate to the "Alerts" page. Once again at the top, a "WorkflowFailures" alert should
appear. It should be in green and state 0 active. This means the alert is not currently firing,
which is expected as none of the Argo Workflow have failed.

## Create a failing Argo Workflow to fire the Prometheus alert

It's boring to see everything working normally, so let's cause some trouble.

Create another YAML file for an Argo Workflow that will fail with the following content:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: fail-
spec:
  entrypoint: fail
  templates:
    - name: fail
      container:
        image: busybox:latest
        command: [false]
```

Assuming this YAML file is created at `~/workflow-fail.yaml`, we can submit this Workflow
via:

```bash
~/argo submit ~/workflow-fail.yaml \
  --namespace argo \
  --watch
```

This Workflow should then fail pretty quickly (the `false` returns a non-zero exit code).

Navigate back to the Prometheus dashboard and go to the "Alerts" page. The "WorkflowFailures"
alert should be in red and state 1 active. This alert is now firing. If you expand the
"WorkflowFailures" alert you'll see some helpful information such as the name of the Workflow
that failed.

To make this alert green for this scenario, we can delete any completed workflows via:

```bash
~/argo delete \
  --completed \
  --namespace argo
```

Looking back at the Prometheus dashboard's "Alerts" page should show the "WorkflowFailures"
alert back in green with 0 active.

{{< convertkit >}}
