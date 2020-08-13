---
title: "iptables: How Kubernetes Services Direct Traffic to Pods"
images:
  - images/iptables-how-kubernetes-services-direct-traffic-to-pods/network-diagram.png
date: 2020-08-12T12:00:00Z
lastmod: 2020-08-13T12:00:00Z
draft: false
categories:
  - development
tags:
  - iptables
  - kubernetes
  - kube-proxy
  - networking
---

This is the third part of a series on Docker and Kubernetes networking. We'll be tackling how Kubernetes's kube-proxy component uses
iptables to direct service traffic to pods randomly. We'll focus on the ClusterIP type of Kubernetes services.

The goal of this post is to implement the iptables rules needed for a service like:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: app-service
spec:
  clusterIP: 10.100.100.100
  selector:
    component: app
  ports:
    - protocol: TCP
      port: 8080
      targetPort: 8080
```

The previous posts so far are:

1. [How do Kubernetes and Docker create IP Addresses?!]({{< ref "how-do-kubernetes-and-docker-create-ip-addresses" >}})
1. [iptables: How Docker Publishes Ports]({{< ref "iptables-how-docker-publishes-ports" >}})

Like the first two articles, we won't use Docker or Kubernetes in this post. Instead, we'll learn the
underlying tools used.

Recall that Kubernetes creates a network namespace for each pod.
We'll be manually creating network namespaces with a python HTTP server running, which will be treated as our "pods."

> Note: This post only works on Linux. I'm using Ubuntu 19.10, but this should
> work on other Linux distributions.

## create virtual devices and run HTTP servers in network namespaces

We're going to quickly set up an environment as we did in the previous post.

If a refresher is needed on any of the following, please take a look at
[How do Kubernetes and Docker create IP Addresses?!]({{< ref "how-do-kubernetes-and-docker-create-ip-addresses" >}})
and
[How Docker Publishes Ports]({{< ref "iptables-how-docker-publishes-ports" >}}).

Let's get started. Enable IP forwarding by running:

```bash
sudo sysctl --write net.ipv4.ip_forward=1
```

Now we need to

- create a virtual bridge (named `bridge_home`)
- create two network namespaces (named `netns_dustin` and `netns_leah`)
- configure `8.8.8.8` for DNS in the network namespaces
- create two veth pairs connected to `bridge_home`
- assign `10.0.0.11` to the veth running in `netns_dustin`
- assign `10.0.0.21` to the veth running in `netns_leah`
- setup default routing in our network namespaces

```bash
sudo ip link add dev bridge_home type bridge
sudo ip address add 10.0.0.1/24 dev bridge_home

sudo ip netns add netns_dustin
sudo mkdir -p /etc/netns/netns_dustin
echo "nameserver 8.8.8.8" | sudo tee -a /etc/netns/netns_dustin/resolv.conf
sudo ip netns exec netns_dustin ip link set dev lo up
sudo ip link add dev veth_dustin type veth peer name veth_ns_dustin
sudo ip link set dev veth_dustin master bridge_home
sudo ip link set dev veth_dustin up
sudo ip link set dev veth_ns_dustin netns netns_dustin
sudo ip netns exec netns_dustin ip link set dev veth_ns_dustin up
sudo ip netns exec netns_dustin ip address add 10.0.0.11/24 dev veth_ns_dustin

sudo ip netns add netns_leah
sudo mkdir -p /etc/netns/netns_leah
echo "nameserver 8.8.8.8" | sudo tee -a /etc/netns/netns_leah/resolv.conf
sudo ip netns exec netns_leah ip link set dev lo up
sudo ip link add dev veth_leah type veth peer name veth_ns_leah
sudo ip link set dev veth_leah master bridge_home
sudo ip link set dev veth_leah up
sudo ip link set dev veth_ns_leah netns netns_leah
sudo ip netns exec netns_leah ip link set dev veth_ns_leah up
sudo ip netns exec netns_leah ip address add 10.0.0.21/24 dev veth_ns_leah

sudo ip link set bridge_home up
sudo ip netns exec netns_dustin ip route add default via 10.0.0.1
sudo ip netns exec netns_leah ip route add default via 10.0.0.1
```

Next, create iptables rules to allow traffic in and out of the `bridge_home` device:

```bash
sudo iptables --table filter --append FORWARD --in-interface bridge_home --jump ACCEPT
sudo iptables --table filter --append FORWARD --out-interface bridge_home --jump ACCEPT
```

Then, create another iptables rule to masquerade requests from our network namespaces:

```bash
sudo iptables --table nat --append POSTROUTING --source 10.0.0.0/24 --jump MASQUERADE
```

Moving on, start an HTTP server in the `netns_dustin` network namespace:

```bash
sudo ip netns exec netns_dustin python3 -m http.server 8080
```

Finally, open another terminal and start an HTTP server in the `netns_leah` network namespace:

```bash
sudo ip netns exec netns_leah python3 -m http.server 8080
```

At this point, our environment will look like:

![diagram showing virtual ethernet devices, physical ethernet device, and network namespaces](/images/iptables-how-kubernetes-services-direct-traffic-to-pods/network-diagram.png)

> Note: Your IP address may differ from the `192.168.0.100` and the interface may have a different name than `enp4s0`.

For a sanity check, the following commands should work:

```bash
curl 10.0.0.11:8080
curl 10.0.0.21:8080
sudo ip netns exec netns_dustin curl 10.0.0.21:8080
sudo ip netns exec netns_leah curl 10.0.0.11:8080
```

## add a virtual IP in iptables

When a [Kubernetes Service](https://kubernetes.io/docs/concepts/services-networking/service/) is
created a ClusterIP is assigned for that new service. Conceptually, a ClusterIP is a virtual IP.
kube-proxy in iptables-mode is responsible for creating iptables rules to handle these virtual IP
addresses as described in
[Virtual IPs and service proxies](https://kubernetes.io/docs/concepts/services-networking/service/#virtual-ips-and-service-proxies).

Let's make a simple iptables rule to see what it takes to handle a virtual IP address.
Later we'll refactor to align our rules with how kube-proxy creates rules.

> Note: I'm going to assume some familiarity with iptables. Check out
> [How Docker Publishes Ports]({{< ref "iptables-how-docker-publishes-ports" >}}) if you're not
> comfortable with the following sections.

Create a new chain named `DUSTIN-SERVICES` in the nat table by running:

```bash
sudo iptables --table nat --new DUSTIN-SERVICES
```

Next, we'll want the `PREROUTING` and `OUTPUT` chains to look through the
`DUSTIN-SERVICES` chain via:

```bash
sudo iptables \
  --table nat \
  --append PREROUTING \
  --jump DUSTIN-SERVICES

sudo iptables \
  --table nat \
  --append OUTPUT \
  --jump DUSTIN-SERVICES
```

At this point, we can then create a rule in the `DUSTIN-SERVICES` chain to handle a virtual IP.
Our virtual IP will be `10.100.100.100`. Let's create a rule that directs traffic for
`10.100.100.100:8080` to `10.0.0.11:8080`. Recall, that `10.0.0.11:8080` is the python HTTP
server running in the `netns_dustin` namespace.

```bash
sudo iptables \
  --table nat \
  --append DUSTIN-SERVICES \
  --destination 10.100.100.100 \
  --protocol tcp \
  --match tcp \
  --dport 8080 \
  --jump DNAT \
  --to-destination 10.0.0.11:8080
```

This looks very familiar to a rule we created in
[How Docker Publishes Ports]({{< ref "iptables-how-docker-publishes-ports" >}})! This time we're
specifying a destination of `10.100.100.100` instead of a local address type.

Let's request our virtual IP by executing:

```bash
curl 10.100.100.100:8080
```

Nice! We've just handled traffic for a virtual IP!

Now for some bad news. Let's try requesting the virtual IP address from `netns_dustin`.

```bash
sudo ip netns exec netns_dustin curl 10.100.100.100.8080
```

This command may succeed for some and will fail for others. What gives?!

## enable hairpin mode (and promiscuous mode)

If the last command failed for you, I'm going to bet you have Docker running. That was the case
for me at least. So why is Docker interfering? Well, it technically isn't, but Docker
enables a little setting called `net.bridge.bridge-nf-call-iptables`. This configures bridges
to consider iptables when handling traffic. This also causes issues with a request leaving
a device that is destined for the same device, which is exactly the scenario we hit in the last
command!

To be super clear, we have a request leaving `veth_dustin` which has a source IP address of `10.0.0.11`.
The request is destined for `10.100.100.100`. Our iptables rule then performs a `DNAT` on
`10.100.100.100` to `10.0.0.11`. This is where the problem happens. The request needs to be
directed to where the request came from!

Let's get everyone's environment configured the same way. This means that if the last command
worked for you, we're going to break it here pretty soon. Fun stuff.

First, check if `net.bridge.bridge-nf-call-iptable` is enabled.

```bash
sysctl net.bridge.bridge-nf-call-iptables
```

If you get the following error:

```
sysctl: cannot stat /proc/sys/net/bridge/bridge-nf-call-iptables: No such file or directory
```

then run the following command:

```bash
sudo modprobe br_netfilter
```

This will load the `br_netfilter` module. After run `sysctl net.bridge.bridge-nf-call-iptables`
again.

I think everyone should be seeing `net.bridge.bridge-nf-call-iptables` is enabled (`1` output).
If for some reason it's disabled (`0`) then run the following:

```bash
sudo sysctl --write net.bridge.bridge-nf-call-iptables=1
```

Now everyone _should_ see the following command fail:

```bash
sudo ip netns exec netns_dustin curl 10.100.100.100.8080
```

Now for the fix! We need to enable hairpin mode on `veth_dustin` connected to `bridge_home`.
Hairpin mode enables a request leaving a device to be received by the same device.

> Fun fact: `veth_dustin` is called a port on `bridge_home`. Similar to having a physical
> ethernet cable plugged into a port on a physical bridge and the other end is plugged into
> a physical computer.

To enable hairpin mode on `veth_dustin`, run:

```bash
sudo brctl hairpin bridge_home veth_dustin on
```

Try the following command again:

```bash
sudo ip netns exec netns_dustin curl 10.100.100.100.8080
```

It's a success!

Since we'll want our network namespaces to be able to talk to themselves via our virtual IPs
we'll need hairpin mode enabled on each port of the bridge device. Fortunately, there's a way
to configure this on the bridge device instead of each port.

Start by undoing what we did earlier and disable hairpin mode:

```bash
sudo brctl hairpin bridge_home veth_dustin off
```

> Note: This previous step isn't technically required, but it'll help to demonstrate the next step works.

Bridges can be in promiscuous mode, which will treat all attached ports (veths in
our case) as if they all had hairpin mode enabled. We can enable promiscuous mode on `bridge_home`
by running:

```bash
sudo ip link set bridge_home promisc on
```

I don't know why promiscuous is shortened to promisc. I do know I've spelled promiscuous wrong
so many times while researching. Maybe that's why?

Run the following beloved command again:

```bash
sudo ip netns exec netns_dustin curl 10.100.100.100.8080
```

Success again! With promiscuous mode enabled on `bridge_home`, we won't have to worry about
enabling hairpin mode on each veth, such as `veth_leah`, in the future!

## align iptables rules with kube-proxy

So far we've created a single iptables rule to handle one service (`10.100.100.100`) with one backend (`10.0.0.11`).
We created this rule in a chain named `DUSTIN-SERVICES`, which is named similarly to kube-proxy's `KUBERNETES-SERVICES`.
kube-proxy creates a chain per service and has `KUBERNETES-SERVICES` jump to the respective service chain based on the
destination.

Let's start by creating a new chain for our service. We're going to name our service HTTP. kube-proxy uses hashes in its chain names, but
we'll stick with HTTP to help with understanding. Create a new chain by running:

```bash
sudo iptables \
  --table nat \
  --new DUSTIN-SVC-HTTP
```

Let's add a rule to our `DUSTIN-SVC-HTTP` chain that will direct traffic to our backend (`10.0.0.11`).

```bash
sudo iptables \
  --table nat \
  --append DUSTIN-SVC-HTTP \
  --protocol tcp \
  --match tcp \
  --jump DNAT \
  --to-destination 10.0.0.11:8080
```

Finally, we'll want `DUSTIN-SERVICES` to use the `DUSTIN-SVC-HTTP` chain. Delete the previous rule we created in `DUSTIN-SERVICES` via:

```bash
sudo iptables \
  --table nat \
  --delete DUSTIN-SERVICES \
  --destination 10.100.100.100 \
  --protocol tcp \
  --match tcp \
  --dport 8080 \
  --jump DNAT \
  --to-destination 10.0.0.11:8080
```

and add a rule in `DUSTIN-SERVICES` to jump to `DUSTIN-SVC-HTTP` on matching destination via:

```bash
sudo iptables \
  --table nat \
  --append DUSTIN-SERVICES \
  --destination 10.100.100.100 \
  --protocol tcp \
  --match tcp \
  --dport 8080 \
  --jump DUSTIN-SVC-HTTP
```

At this point, the following commands will remain successful:

```bash
curl 10.100.100.100:8080
sudo ip netns exec netns_dustin curl 10.100.100.100:8080
```

In the future, adding a new service consists of:

- create a new chain for the service, such `DUSTIN-SVC-HTTP`
- create a rule in the service chain to direct traffic to a backend, such as `10.0.0.11`
- add a rule to `DUSTIN-SERVICES` to jump to the service chain, such as `DUSTIN-SVC-HTTP`

## refactor service chain to support multiple backends

We just refactored our `DUSTIN-SERVICES` chain to jump to individual service chains. Now, we want to refactor
our service chain (`DUSTIN-SVC-HTTP`) to jump to other chains for directing traffic to backends.

> Note: I've been using the word backend here, but these are also referred to as endpoints in Kubernetes. Typically, the
> endpoints are IP addresses of pods.

Let's create a new chain for our `10.0.0.11` endpoint. kube-proxy also uses a hash for these chain names, but we'll create a chain named
`DUSTIN-SEP-HTTP1` representing the first service endpoint (SEP) for HTTP. Create the new chain via:

```bash
sudo iptables \
  --table nat \
  --new DUSTIN-SEP-HTTP1
```

And we'll add a familiar-looking rule to the new `DUSTIN-SEP-HTTP1` chain:

```bash
sudo iptables \
  --table nat \
  --append DUSTIN-SEP-HTTP1 \
  --protocol tcp \
  --match tcp \
  --jump DNAT \
  --to-destination 10.0.0.11:8080
```

We'll then delete the rule we added to `DUSTIN-SVC-HTTP` and add a rule in `DUSTIN-SVC-HTTP` to jump to `DUSTIN-SEP-HTTP1`.

```bash
sudo iptables \
  --table nat \
  --delete DUSTIN-SVC-HTTP \
  --protocol tcp \
  --match tcp \
  --jump DNAT \
  --to-destination 10.0.0.11:8080

sudo iptables \
  --table nat \
  --append DUSTIN-SVC-HTTP \
  --jump DUSTIN-SEP-HTTP1
```

The following commands should still work:

```bash
curl 10.100.100.100:8080
sudo ip netns exec netns_dustin curl 10.100.100.100:8080
```

Now we're ready to start adding additional backends.

## use iptables to serve random backends for virtual IPs

As mentioned in the Kubernetes documentation,
[kube-proxy directs traffic to backends randomly](https://kubernetes.io/docs/concepts/services-networking/service/#proxy-mode-iptables).
How does it do that? iptables of course!

iptables support directing traffic to a backend based on probability. This is a super cool concept to me because I previously thought iptables
was very deterministic!

Let's start by adding a new chain and rule for our second HTTP backend (`10.0.0.21`) running in the `netns_leah` network namespace.

```bash
sudo iptables \
  --table nat \
  --new DUSTIN-SEP-HTTP2

sudo iptables \
  --table nat \
  --append DUSTIN-SEP-HTTP2 \
  --protocol tcp \
  --match tcp \
  --jump DNAT \
  --to-destination 10.0.0.21:8080
```

We'll then need to add another rule to the `DUSTIN-SVC-HTTP` chain to randomly jump to the `DUSTIN-SEP-HTTP2` chain we just created. We can
add this rule by running:

```bash
sudo iptables \
  --table nat \
  --insert DUSTIN-SVC-HTTP 1 \
  --match statistic \
  --mode random \
  --probability 0.5 \
  --jump DUSTIN-SEP-HTTP2
```

It's very important to notice that we are inserting this rule to be first in the `DUSTIN-SVC-HTTP` chain. iptables goes down the list of rules in order.
So by having this rule first, we'll have a 50% chance of jumping to this chain. If it's a hit, iptables will jump to `DUSTIN-SEP-HTTP2`. If it's a miss, then
iptables will go to the next rule, which will always jump to `DUSTIN-SEP-HTTP1`.

A common misconception is that each rule should have a probability of 50%, but this will cause problems in the following scenario:

1. iptables looks at the first rule (the jump to `DUSTIN-SEP-HTTP2`) and let's say it's a miss on the 50%
1. iptables looks at the next rule (the jump to `DUSTIN-SEP-HTTP1`) and let's say it's also a miss on the 50%

Now our virtual IP wouldn't direct to any backend! So the probability is based on the number of remaining backends to choose from.
If we were to insert a third backend, that rule would have a probability of 33%.

Anyways, if we then run the following command:

```bash
curl 10.100.100.100:8080
```

We'll see requests being made randomly to our python HTTP servers running in `netns_leah` and `netns_dustin` network namespaces. This is load balancing via iptables!

## closing thoughts

After these three posts on container and pod networking, I've learned more about networking than I ever thought I would. The remaining
topics I'd like to learn are:

- how does kube-proxy work in IPVS mode?
- conntrack and how it's used in iptables rules by kube-proxy
- how are virtual tunnels and BGP optionally used in multi-node Kubernetes clusters?

Have any knowledge to share about the above topics? Or any other additional questions?
Then please feel free to reach out and let me know on [Twitter](https://twitter.com/dustinspecker),
[LinkedIn](https://www.linkedin.com/in/dustin-specker/), or [GitHub](https://github.com/dustinspecker).

{{< convertkit >}}
