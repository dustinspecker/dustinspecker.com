---
title: "Resolving Kubernetes Services from Host when using kind"
date: 2020-05-09T16:10:52Z
lastmod: 2020-05-09T16:10:52Z
draft: false
categories:
  - development
tags:
  - kubernetes
  - kind
  - networking
---

[kind](https://kind.sigs.k8s.io/) is one of my favorite tools for local development and testing
of Kubernetes. While there are plenty of advantages to kind such as every node is a Docker
container making it easy to setup and tear down clusters, there are some bumps to get over.
Running an entire kubernetes cluster within Docker containers presents some issues that
wouldn't normally be experienced when using something like
[minikube](https://minikube.sigs.k8s.io/docs/).

One of the first bumps a lot of us run into is Kubernetes services are no longer resolvable
from the host. Fortunately, it's possible to configure the host's DNS configuration and routing
to resolve this issue.

> This post uses kind `v0.8.1` and kubectl `v1.17.0` running on Ubuntu 19.10. This post will
> not work on macOS or Windows.

## verify host DNS configuration

Before we create our Kubernetes cluster, let's make sure the host's DNS is configured properly.

Run the following:

```bash
systemd-resolve --status | grep 'DNS Servers' --after 5
```

It should output something similar to:

```
DNS Servers: 10.96.0.10
             192.168.0.1
DNS Domain: svc.cluster.local
            cluster.local
```

It's very important that the `10.96.0.10` DNS server be listed and be listed first.
If it's not listed first you'll need to configure your Host DNS. If using netplan,
you can probably use what I have in my netplan configuration located in the `/etc/netplan`
directory:

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    enp4s0:
      dhcp4: true
      nameservers:
        search: ["svc.cluster.local", "cluster.local"]
        addresses: ["192.168.0.1", "10.96.0.10"]
```

The search nameservers are not required, but they can be convenient. It enables resolving
SERVICE_NAME.NAMESPACE requests. `enp4s0` is the name of my interface found by running:

```bash
ip addr
```

Once the `10.96.0.10` DNS server is being returned in `systemd-resolves` output, then we're
good to move on.

> The `10.96.0.10` is the IP address of the kube-dns service that will be created in our
> cluster. It's important to be listed first otherwise requests to
> SERVICE_NAME.NAMESPACE.svc.cluster.local will fail.

## create a kubernetes cluster using kind

We'll start by creating a Kubernetes cluster using kind. To create a cluster run:

```bash
kind create cluster
```

After this command finishes we'll have a single node Kubernetes cluster running inside of
a Docker container.

## deploy hello world service

Now that we have a Kubernetes cluster running let's deploy an application so that we have
a service to make an HTTP request to later. Thankfully, there are some
[NGINX demos](https://github.com/nginxinc/NGINX-Demos) that will be convenient to use. We'll
use a demo that simply returns some plain text.

We can create a deployment and service in our cluster by running:

```bash
kubectl run hello \
  --expose \
  --image nginxdemos/hello:plain-text \
  --port 80
```

This will create a deployment running a container using the `nginxdemos/hello:plain-text` image
and create a service pointing at port 80 of the running container.

## add route to direct traffic for pods to the cluster

Let's start by getting the IP of the hello pod running. This can be found by running:

```bash
kubectl get pods \
  --namespace default \
  --output wide
```

One of the columns will be the pod IP address. My pod's IP address is `10.244.0.5`, so I'll
be using that through out this post, but please remember to replace it with the IP you found.

Let's verify we get a response from this pod by running:

```bash
docker exec kind-control-plane curl 10.244.0.5
```

The above command will execute curl within the kind-control-plane container. The output should
contain something similar to:

```
Server address: 10.244.0.5:80
Server name: hello-5ccfd6b56f-ch7hv
Date: 09/May/2020:21:36:58 +0000
URI: /
Request ID: b9004e01688d3d2659c2169851a85a9c
```

From our host, if we run:

```bash
curl 10.244.0.5
```

then we will not get a response. In fact, you'll probably want to hit CTRL+c to kill the curl
process. With a little know-how we can fix this.

First, we'll need to get the IP address of the running Docker container. We can get this
by running:

```bash
docker container inspect kind-control-plane \
  --format '{{ .NetworkSettings.Networks.kind.IPAddress }}'
```

Remember this IP. For example, mine is `172.18.0.2`. With this IP and the above pod IP we can
instruct the host system on how to direct a request to the pod IP.

Before we do that, run:

```bash
ip route
```

This is the current list of routes the host knows about. Then run

```bash
sudo ip route add 10.244.0.5 via 172.18.0.2
```

Be sure to replace `10.244.0.5` with the pod IP you found and replace `172.18.0.2` with the
IP of the container you found.

If we run `ip route` again, we'll see this route has been added to the list.

At this point, we can successfully make a request to the pod IP from the host by running:

```bash
curl 10.244.0.5
```

This is a great start, but this will quickly become tedious having to add a route for every
pod IP. Fortunately, we can provide a range when adding a route.

Let's clean up the above route by running:

```bash
sudo ip route delete 10.244.0.5
```

If you run `ip route` the route should be gone again.

To get the range of IPs possible for a pod IP run:

```bash
kubectl get node kind-control-plane \
  --output jsonpath='{@.spec.podCIDR}'
```

The output will most likely be `10.244.0.0/24`. We can use this CIDR by running:

```bash
sudo ip route add 10.244.0.0/24 via 172.18.0.2
```

Once again be sure to replace the above IPs if yours are different.

Now we can run:

```bash
curl 10.244.0.5
```

and the request is successful again from the host. This ip route will enable us to make a request
to any pod IP on this particular node from our host.

> If your cluster has multiple nodes, you can repeat the above steps for each node (container)
> IP address and their respective pod CIDR.

## add route to direct traffic for services to the cluster

Routing traffic to services is going to be pretty similar to routing traffic to pods.

Let's start by getting the IP of the hello service. Run:

```bash
kubectl get service hello \
  --namespace default
```

Once again, one of the columns will have the IP of the service. The IP returned for me is
`10.109.139.197`.

Using this, we can add another route to support services. By default, the service CIDR for
a kubernetes cluster created using kubeadm is `10.96.0.0/12`, which is true for our cluster.
To add the route run:

```bash
sudo ip route add 10.96.0.0/12 via 172.18.0.2
```

After adding the above route we can then run:

```bash
curl 10.109.139.197
```

and get a successful request. Be sure to replace the above IPs with the ones you found.

With all of this setup we can also run:

```bash
curl hello.default.svc.cluster.local
```

successfully from our host.

## cleanup host environment

It's a good idea to clean up these routes after using them to prevent any confusion later. We
can remove these routes by running:

```bash
sudo ip route delete 10.96.0.0/12
sudo ip route delete 10.244.0.0/24
```

Finally we can delete our Kubernetes cluster created by kind by running:

```bash
kind delete cluster
```

{{< convertkit >}}
