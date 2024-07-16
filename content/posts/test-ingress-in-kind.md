---
title: "How to Test Ingress in a kind cluster"
images:
  - images/logos/test-ingress-in-kind.png
date: 2020-09-01T12:00:00Z
lastmod: 2020-09-01T12:00:00Z
draft: false
categories:
  - development
series:
  - Using kind
tags:
  - kind
  - ingress
  - kubernetes
---

[Kind](https://kind.sigs.k8s.io/) is one of my favorite Kubernetes development tools.
I've written a couple of articles on talking to internal services and pods from outside of the
kind cluster:

- [Resolving Kubernetes Services from Host when using kind]({{< ref "resolving-kubernetes-services-from-host-when-using-kind" >}})
- [Using Docker to Resolve Kubernetes Services in a kind Cluster]({{< ref "using-docker-to-resolve-kubernetes-services-in-a-kind-cluster" >}})

This article tackles communication through an ingress controller running in a kind cluster.

Back in my minikube days, I used to add an A test record on my public DNS (AWS' Route 53) to resolve
my private IP address to test my Ingress changes... Please learn from my mistakes! This is easier.

> Note: This article uses kind `v0.9.0`.

> Update (December 06, 2020)
>
> - use kind v0.9.0 instead of v0.8.1
> - use kubectl v1.19.4 instead of v1.18.5
> - update ingress apiVersion to networking.k8s.io/v1 from networking.k8s.io/v1beta1

## create a kind cluster with ingress support

First, we'll need a kind cluster with an ingress controller running. We can follow the
[kind ingress documentation](https://kind.sigs.k8s.io/docs/user/ingress/) for achieving this.

Start by creating a `kind.config` file as described in
[Create Cluster](https://kind.sigs.k8s.io/docs/user/ingress/#create-cluster):

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    kubeadmConfigPatches:
      - |
        kind: InitConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-labels: "ingress-ready=true"
    extraPortMappings:
      - containerPort: 80
        hostPort: 80
        protocol: TCP
      - containerPort: 443
        hostPort: 443
        protocol: TCP
```

This configuration will expose port 80 and 443 on the host. It'll also add a node label so that
the nginx-controller may use a node selector to target only this node. If a kind configuration has
multiple nodes, it's essential to only bind ports 80 and 443 on the host for one node because port
collision will occur otherwise.

Then create a kind cluster using this config file via:

```bash
kind create cluster --config kind.config
```

Deploy the nginx-ingress controller and wait for it to be ready by running:

```bash
kubectl apply --filename https://raw.githubusercontent.com/kubernetes/ingress-nginx/master/deploy/static/provider/kind/deploy.yaml

kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s
```

## create a kubernetes service and ingress

We'll create a simple service that responds with a plaintext response by running:

```bash
kubectl run hello \
  --expose \
  --image nginxdemos/hello:plain-text \
  --port 80
```

The above command will create a pod and service for us.

Then create an Ingress resource that directs traffic for `hello.dustinspecker.com` to the hello
service by creating a file named `ingress.yaml` with the following content:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: hello
spec:
  rules:
    - host: hello.dustinspecker.com
      http:
        paths:
          - pathType: ImplementationSpecific
            backend:
              service:
                name: hello
                port:
                  number: 80
```

Deploy the Ingress resource by running:

```bash
kubectl create --filename ingress.yaml
```

## request ingress endpoint from host

We can modify `/etc/hosts` on the host to direct traffic to the kind cluster's ingress controller.
This approach works on Linux. The next section will cover how to use a Docker container,
which will work on Mac and Windows.

We'll need to get the IP address of our kind node's Docker container first by running:

```bash
docker container inspect kind-control-plane \
  --format '{{ .NetworkSettings.Networks.kind.IPAddress }}'
```

Then add an entry to `/etc/hosts` with the IP address found that looks like:

```
172.18.0.2 hello.dustinspecker.com
```

Finally, we can `curl` `hello.dustinspecker.com`:

```bash
curl hello.dustinspecker.com
```

Modifying `/etc/hosts` is way simpler than adding an A record to a public DNS!

## request ingress endpoint from Docker container

The previous steps work, but require mucking with the host system and are limited to Linux.
We can instead create a Docker container. We can leverage `docker run`'s `--add-host` argument to
add an entry to the container's `/etc/hosts` file.

```bash
docker run \
  --add-host hello.dustinspecker.com:172.18.0.2 \
  --net kind \
  --rm \
  curlimages/curl:7.71.0 hello.dustinspecker.com
```

And we'll get another successful response!

> Note: `--net kind` connects this docker container to the same Docker network that the kind
> cluster is on.

{{< convertkit >}}
