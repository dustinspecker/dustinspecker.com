---
title: "Viewing Argo's Prometheus metrics in a kind cluster"
date: 2020-04-18T13:58:53Z
lastmod: 2020-04-19T13:58:53Z
draft: false
categories:
  - development
tags:
  - prometheus
  - argo
  - kubernetes
  - kind
---

[Argo](https://argoproj.github.io/) is a workflow manager for
[Kubernetes](https://kubernetes.io/). [Prometheus](https://prometheus.io/)
is a monitoring tool for collecting metrics. Argo may be configured to expose
an endpoint for Prometheus to collect metrics. [kind](https://kind.sigs.k8s.io/)
is a tool to run a Kubernetes cluster within a docker container. kind is great
for local development and testing.

When I first started playing with Argo and its Prometheus metrics, there wasn't
a quick resource to figure it out. On top of that, using kind can sometimes make it
more challenging since the cluster is running within a docker container.

## Install kind

For this we'll be using kind v0.7.0, which can be installed from its
[GitHub Release](https://github.com/kubernetes-sigs/kind/releases/tag/v0.7.0).

For 64bit Linux, this can be done via:

```bash
curl https://github.com/kubernetes-sigs/kind/releases/download/v0.7.0/kind-linux-amd64 \
  --location \
  --output ~/kind

chmod +x ~/kind

~/kind version
```

## Create kind cluster

Creating a Kubernetes cluster is relatively easy with kind. First make sure Docker
is running. Then create a cluster via:

```bash
~/kind create cluster
```

This will create a v1.17.0 Kubernetes cluster.

## Install kubectl

kubectl will help with deploying new resources to our cluster. We'll be using kubectl
v1.17.4. The [Kubernetes docs](https://v1-17.docs.kubernetes.io/docs/tasks/tools/install-kubectl/#before-you-begin)
have instructions for multiple operating systems.

For 64bit Linux, the instructions are:

```bash
curl https://storage.googleapis.com/kubernetes-release/release/v1.17.0/bin/linux/amd64/kubectl \
  --location \
  --output ~/kubectl

chmod +x ~/kubectl

~/kubectl version
```

## Deploy Argo

Argo's Workflow Controller is responsible for detecting new Workflows and executing
Workflows. This controller may be configured to observe all namespaces in a Kubernetes
cluster or a single namespace. We'll use a namespace-scoped Argo installation.

A namespace-scoped Argo may be installed to the argo namespace via:

```bash
~/kubectl create namespace argo

~/kubectl create \
  --filename https://raw.githubusercontent.com/argoproj/argo/v2.7.2/manifests/namespace-install.yaml \
  --namespace argo

~/kubectl wait deployment workflow-controller \
  --for condition=Available \
  --namespace argo
```

By default, Argo will use the default service account in the namespace where a Workflow runs.
Usually, the default service account doesn't have enough rights to do observe resources
created by a Workflow. We can bind the argo namespace's default service account to the
cluster-admin role for the sake of this tutorial. In a production environment, you'd want
to create a new service account and configure Argo to use that instead of running as
cluster-admin.

```bash
~/kubectl create rolebinding default-admin \
  --clusterrole cluster-admin \
  --namespace argo \
  --serviceaccount=argo:default
```

## Configure Argo to work in kind

kind's cluster does not use Docker, which is the default container runtime used by
Argo's Workflow controller. Instead Kind uses containerd. Fortunately, Argo's Workflow
Controller may be configured. Argo documents the configuration pretty well in their
[workflow-controller-configmap docs](https://github.com/argoproj/argo/blob/v2.7.2/docs/workflow-controller-configmap.yaml#L88).

We'll set this configuration in the Workflow Controller's configmap by:

```bash
~/kubectl patch configmap workflow-controller-configmap \
  --namespace argo \
  --patch '{"data": {"containerRuntimeExecutor": "pns"}}' \
  --type merge
```

## Patch Argo to work with Prometheus

Argo's workflow-controller by default does not expose Prometheus metrics, so we'll need
to configure the workflow-controller:

```bash
~/kubectl patch configmap workflow-controller-configmap \
  --namespace argo \
  --patch '{"data": {"metricsConfig": "enabled: true\npath: /metrics\nport: 9090"}}' \
  --type merge
```

As of Argo v2.7.2, the workflow-controller pod will not start the metrics server automatically
when the configmap changes. But if the workflow-controller pod is deleted then the newly created
workflow-controller pod will start the metrics server. The current workflow-controller pod
can be deleted by:

```bash
~/kubectl delete pods \
  --namespace argo \
  --selector app=workflow-controller
```

The Argo installation also deploys a workflow-controller-metrics service. This service points
at the workflow-controller's metrics port. This service port is lacking a name, which Prometheus
requires so that Prometheus may discover this service. Fortunately, we can patch the service:

```bash
~/kubectl patch service workflow-controller-metrics \
  --namespace argo \
  --patch '[{"op": "add", "path": "/spec/ports/0/name", "value": "metrics"}]' \
  --type json
```

This will name the service's port as metrics.

## Install Argo CLI

Argo has a CLI that aids with submitting Argo Workflows. We'll be using v2.7.2, which can
also be installed from its
[GitHub Release](https://github.com/argoproj/argo/releases/tag/v2.7.2).

For 64bit Linux, this can be done via:

```bash
curl https://github.com/argoproj/argo/releases/download/v2.7.2/argo-linux-amd64 \
  --location \
  --output ~/argo

chmod +x ~/argo

~/argo version
```

## Run hello-world Argo Workflow

We'll want to execute an Argo Workflow so that there is data for Prometheus metrics.
Argo has several [examples](https://github.com/argoproj/argo/tree/v2.7.2/examples).
We'll use the
[hello-world example](https://github.com/argoproj/argo/blob/v2.7.2/examples/hello-world.yaml)
to keep this simple.

The hello-world Workflow may be executed by running:

```bash
~/argo submit https://raw.githubusercontent.com/argoproj/argo/v2.7.2/examples/hello-world.yaml \
  --namespace=argo \
  --watch
```

## Deploy Prometheus

The CoreOS organization has created a project called
[kube-prometheus](https://github.com/coreos/kube-prometheus), which can be used
to deploy Prometheus within a Kubernetes cluster.

We'll use v0.3.0 of kube-prometheus which can be deployed via:

```bash
git clone https://github.com/coreos/kube-prometheus.git ~/kube-prometheus

cd ~/kube-prometheus

git checkout v0.3.0

~/kubectl create --filename ~/kube-prometheus/manifests/setup/
until ~/kubectl get servicemonitors --all-namespaces ; do sleep 1; done
~/kubectl create --filename ~/kube-prometheus/manifests/
```

## Configure Prometheus RBAC

The kube-prometheus installation sets up
[RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/) for
Prometheus so that Prometheus may access resources in the default, kube-system,
and monitoring namespaces. Our Argo installation is in the argo namespace, so
we'll need to add additional RBAC permissions for Prometheus to access the
argo resources.

First, we'll create a prometheus-k8s role in the argo namespace:

```bash
~/kubectl create role prometheus-k8s \
  --namespace argo \
  --resource services,endpoints,pods \
  --verb get,list,watch
```

Next we'll need to bind this role to Prometheus' service account:

```bash
~/kubectl create rolebinding prometheus-k8s \
  --namespace argo \
  --role prometheus-k8s \
  --serviceaccount monitoring:prometheus-k8s
```

## Create workflow-controller-metrics ServiceMonitor

We'll need to create a ServiceMonitor so that Prometheus knows to scrape the
workflow-controller-metrics service. The easiest way is to create a YAML file
with the following contents:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: workflow-controller-metrics
  namespace: argo
spec:
  endpoints:
    - port: metrics
  namespaceSelector:
    matchNames:
      - argo
  selector:
    matchNames:
      - workflow-controller-metrics
```

We'll assume this YAML file is created at `~/workflow-controller-metrics-servicemonitor.yaml`.
We can then create the ServiceMonitor via:

```bash
~/kubectl create \
  --filename ~/workflow-controller-metrics-servicemonitor.yaml
```

It can take up to 5 minutes for Prometheus/Kubernetes to detect a new ServiceMonitor.
Fortunately we can watch the logs of Prometheus' config reloader container to see when
it gets a new configuration.

```bash
~/kubectl logs prometheus-k8s-0 prometheus-config-reloader \
  --follow \
  --namespace monitoring
```

After a few minutes you should see a log message indicating the configuration reload
has been triggered.

## View Argo metrics on Prometheus dashboard

First, we'll want to expose the Prometheus dashboard on a local port so that we can
view the dashboard while it's running in the Kubernetes cluster created by kind.

```bash
~/kubectl port-forward service/prometheus-k8s 9090 \
  --namespace monitoring
```

Now navigate to [http://localhost:9090](http://localhost:9090) in your browser.
Click the "Status" dropdown and then click on "Service Discovery." You should see
a `argo/workflow-controller-metrics/0` entry. If you expand this entry you'll
notice the workflow-controller-metrics target labels being picked up, while the
argo-service's labels are all dropped.

If you then click the "Status" dropdown and then click on "Targets," you'll see
`argo/workflow-controller-metrics/0` at the top. From there we can see the
workflow--controller-metrics is up and running. This will have status about
how long ago Prometheus has scraped the workflow-controller's metrics.

Back on the "Graph" page, you can enter an expression like: `argo_workflow_info{}` and
see status about any Argo workflows like the hello-world Workflow we ran earlier.

From here, you're able to use Prometheus' dashboard to explore metrics created by Argo's
workflow-controller.
