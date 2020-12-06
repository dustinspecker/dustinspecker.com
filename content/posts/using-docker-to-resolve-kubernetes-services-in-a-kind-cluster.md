---
title: "Using Docker to Resolve Kubernetes Services in a kind Cluster"
images:
  - images/dustinspecker.jpg
date: 2020-06-28T12:00:00Z
lastmod: 2020-12-06T12:00:00Z
draft: false
categories:
  - development
tags:
  - kubernetes
  - kind
  - networking
  - docker
---

This is a follow-up to
[Resolving Kubernetes Services from Host when using kind]({{< ref "resolving-kubernetes-services-from-host-when-using-kind" >}}).
In the previous post we modified the host's DNS configuration (`/etc/resolv.conf`) and the host's
IP routes to communicate to the [kind](https://kind.sigs.k8s.io/) cluster from our host.
There are scenarios where modifying the host environment isn't ideal,
such as running integration tests on a local development laptop. Also, this method isn't limited
to Linux.

Fortunately, we can run a Docker container configured to communicate with the kubernetes services running in a kind cluster with a few steps.

By the end of this post we'll run a Docker container that can make requests to `http://hello.default.svc.cluster.local` successfully.

> Update (December 06, 2020)
>
> - Use kind v0.9.0 instead of v0.8.1
> - Use kubectl v1.19.4 instead of v1.18.5

## create a kind cluster with hello service

To get caught up with where the previous post left off, run the following commands:

```bash
kind create cluster \
  --wait 300s

kubectl run hello \
  --expose \
  --image nginxdemos/hello:plain-text \
  --port 80
```

This will create a kubernetes cluster using kind (v0.9.0) running a hello pod and service.

## run a Docker container

First let's spin up a Docker container by running:

```bash
docker run \
  --cap-add NET_ADMIN \
  --detach \
  --dns 10.96.0.10 \
  --dns-search svc.cluster.local \
  --dns-search cluster.local \
  --interactive \
  --name docker-kind-demo \
  --net kind \
  --rm \
  --tty \
  curlimages/curl:7.71.0 cat
```

This will create a container named `docker-kind-demo` using the `curlimages/curl:7.71.0` image. A
few notable arguments:

- `--cap-add NET_ADMIN` - enables modifying the IP routes within the running container (which we'll do soon)
- `--dns 10.96.0.10` - adds `10.96.0.10` (IP Address of `kube-dns` service in the cluster) to the container's `/etc/resolv.conf`
- `--dns-search svc.cluster.cluster.local` and `--dns-search cluster.local` - enables querying requests such as `http://hello.default` and `http://hello.default.svc`
- `--net kind` - connects this container to the same Docker network as the kind cluster's Docker container

We're using `cat`, so that the container doesn't immediately terminate.

## modify the Docker container's IP routes

We'll need to instruct our Docker container to direct traffic to our kind cluster. Let's
get the IP Address of the Docker container running the kind cluster by running:

```bash
docker container inspect kind-control-plane \
  --format '{{ .NetworkSettings.Networks.kind.IPAddress }}'
```

For me the output is `172.18.0.2`, but yours may be different. Please note what the output is
and use that instead of `172.18.0.2` in the next command:

```bash
docker exec \
  --interactive \
  --tty \
  --user 0 \
  docker-kind-demo ip route add 10.96.0.0/12 via 172.18.0.2
```

This will instruct our container to direct traffic destined for a kubernetes service (`10.96.0.0/12`)
to be directed through `172.18.0.2`.

> Note: the `ip route add` command requires running as root, so we set `--user 0` on this command only.
> We could have created the container with the root user, but then all commands by default in the container
> would have been ran as root.

## request a kubernetes service running in the kind cluster

Finally we can successfully run:

```bash
docker exec \
  --interactive \
  --tty \
  docker-kind-demo curl http://hello.default.svc.cluster.local
```

Now we have a Docker container capable of communicating with Kubernetes services in a kind cluster without messing
with the host.

## summary

We've created a Kubernetes cluster via kind running a hello service. We then ran a Docker container configured to
successfully communicate with services running in the kind cluster.

I'm a huge fan of using kind for development. Do you have any recommended tools for Kubernetes development? Feel free to
reach out on [Twitter](https://twitter.com/dustinspecker).

{{< convertkit >}}
