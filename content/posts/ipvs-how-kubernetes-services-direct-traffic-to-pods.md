---
title: "IPVS: How Kubernetes Services Direct Traffic to Pods"
images:
  - images/ipvs-how-kubernetes-services-direct-traffic-to-pods/ipvs-how-kubernetes-services-direct-traffic-to-pods.png
date: 2021-04-06T12:00:00Z
lastmod: 2022-04-11T12:00:00Z
draft: false
categories:
  - development
series:
  - Container Networking
tags:
  - ipvs
  - iptables
  - kubernetes
  - kube-proxy
  - networking
---

Welcome to the fourth part of a series on Docker and Kubernetes networking. Similar to
[iptables: How Kubernetes Services Direct Traffic to Pods]({{< ref "iptables-how-kubernetes-services-direct-traffic-to-pods" >}}),
we'll focus on how kube-proxy uses IPVS (and ipset) in [IPVS mode](https://kubernetes.io/docs/concepts/services-networking/service/#proxy-mode-ipvs).
Like the previous posts, we won't use tools like Docker or Kubernetes
but instead use the underlying technologies to learn how Kubernetes work.

For example, recall that Kubernetes creates a network namespace for each pod. We'll create a similar environment by
manually creating network namespaces and starting Python HTTP servers to act as our "pods."

This post aims to mimic what kube-proxy would do for the following service using IPVS and ipset.

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

By the end of this post, we'll be able to run `curl 10.100.100.100:8080` to have our request directed to an HTTP server in one of
two network namespaces (or "pods").

I recommend reading the previous posts first, especially #3. This post follows the same outline but using IPVS instead of iptables.

1. [How do Kubernetes and Docker create IP Addresses?!]({{< ref "how-do-kubernetes-and-docker-create-ip-addresses" >}})
1. [iptables: How Docker Publishes Ports]({{< ref "iptables-how-docker-publishes-ports" >}})
1. [iptables: How Kubernetes Services Direct Traffic to Pods]({{< ref "iptables-how-kubernetes-services-direct-traffic-to-pods" >}})

> Note: This post only works on Linux. I'm using Ubuntu 20.04, but this should
> work on other Linux distributions.

## Why IPVS over iptables?

This post isn't trying to sway anyone on IPVS or iptables, but only on how kube-proxy uses IPVS.

I recommended reading [IPVS-Based In-Cluster Load Balancing Deep Dive](https://kubernetes.io/blog/2018/07/09/ipvs-based-in-cluster-load-balancing-deep-dive/)
to overview the performance benefits of ipsets and IPVS and the advanced scheduling options IPVS supports.

## Create virtual devices and start HTTP servers in network namespaces

We're going to create an environment as we did in
[iptables: How Kubernetes Services Direct Traffic to Pods]({{< ref "iptables-how-kubernetes-services-direct-traffic-to-pods" >}}#create-virtual-devices-and-run-http-servers-in-network-namespaces).
I'm not going to explain this time, but please refer to the previous post for more information.

```bash
sudo sysctl --write net.ipv4.ip_forward=1

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

sudo iptables --table filter --append FORWARD --in-interface bridge_home --jump ACCEPT
sudo iptables --table filter --append FORWARD --out-interface bridge_home --jump ACCEPT

sudo iptables --table nat --append POSTROUTING --source 10.0.0.0/24 --jump MASQUERADE
```

In another terminal run:

```bash
sudo ip netns exec netns_dustin python3 -m http.server 8080
```

Open another terminal and run:

```bash
sudo ip netns exec netns_leah python3 -m http.server 8080
```

Verify the following commands all succeed:

```bash
curl 10.0.0.11:8080
curl 10.0.0.21:8080
sudo ip netns exec netns_dustin curl 10.0.0.21:8080
sudo ip netns exec netns_leah curl 10.0.0.11:8080
```

Our environment once again looks like this:

![diagram showing virtual ethernet devices, physical ethernet device, and network namespaces](/images/iptables-how-kubernetes-services-direct-traffic-to-pods/network-diagram.png)

## Install required tools

To use IPVS and, later, ipset, we'll need to install two tools, ipvsadm and ipset.

On Ubuntu, we can install these by running:

```bash
sudo apt install ipset ipvsadm --yes
```

> Note: at the time of writing this, I'm using `ipset 7.5-1~exp1` and ipvsadm `1:1.31-1`.

Now, we're ready to start learning the new parts!

## Create a virtual service via IPVS

We'll start using IPVS by first creating a virtual service:

```bash
sudo ipvsadm \
  --add-service \
  --tcp-service 10.100.100.100:8080 \
  --scheduler rr
```

> Note: I recommend running `sudo ipvsadm --list --numeric` after running `ipvsadm` commands to
> see the impact.

Notice that we specify a `tcp-service` since the TCP protocol is desired based on the
introduction's service YAML.

A neat bonus for IPVS is the ease of selecting a scheduler. In this case, `rr` for round-robin is chosen,
which is the default scheduler kube-proxy uses.

> Note: kube-proxy as of today only allows picking a single scheduler type to use for every service.
> kube-proxy will support each service specifying its scheduler someday,
> as mentioned in [IPVS-Based In-Cluster Load Balancing Deep Dive](https://kubernetes.io/blog/2018/07/09/ipvs-based-in-cluster-load-balancing-deep-dive/#ipvs-based-kube-proxy)!

We now need to give our virtual service a destination. We'll start by sending traffic to the HTTP server running in the
`netns_dustin` network namespace.

```bash
sudo ipvsadm \
  --add-server \
  --tcp-service 10.100.100.100:8080 \
  --real-server 10.0.0.11:8080 \
  --masquerading
```

This command instructs IPVS to direct TCP requests for `10.100.100.100:8080` to `10.0.0.11:8080`. It's
important to specify `--masquerading` here, as this effectively handles `NAT` for us as we previously
did in [iptables: How Kubernetes Services Direct Traffic to Pods]({{< ref "iptables-how-kubernetes-services-direct-traffic-to-pods" >}}#add-a-virtual-ip-in-iptables). By not specifying `--masquerading`,
IPVS attempts to use routing to direct the traffic, which will fail.

Now, run the following:

```bash
curl 10.100.100.100:8080
```

We successfully used IPVS!

## Enable a network namespace to communicate with the virtual service

Try running the following:

```bash
sudo ip netns exec netns_leah curl 10.100.100.100:8080
```

and unfortunately, this doesn't work.

To get this to work, we can assign the `10.100.100.100` IP address to a virtual device.

> I do not understand _why_ the IP address needs to be assigned. If you know, please let me know!
> I only know that this works, and it's what Kubernetes does today.
>
> I initially assumed having this
> IP address as a virtual service would have been enough. In
> [iptables: How Kubernetes Services Direct Traffic to Pods]({{< ref "iptables-how-kubernetes-services-direct-traffic-to-pods" >}}),
> we instruct bridges to call iptables, and iptables has a rule for `10.100.100.100`. I'm speculating
> the gap is that bridges don't call IPVS, but assigning the IP address to a virtual device
> allows enabling routing via IPVS to work correctly.

We don't need to attach the IP address to any device in particular, so we'll do what Kubernetes does. Kubernetes
creates a virtual device that is a dummy type.

```bash
sudo ip link add dev dustin-ipvs0 type dummy
```

So now we've used `veth`, `bridge`, and `dummy` types.

Attach the IP address to our `dustin-ipvs0` device by running:

```bash
sudo ip addr add 10.100.100.100/32 dev dustin-ipvs0
```

> Note: we can `ping 10.100.100.100`. Not sure how this is useful, but it didn't work
> with the iptables solution.

Finally, we'll need to enable forwarding traffic from one device to another, so like we did in the previous post, run:

```bash
sudo modprobe br_netfilter
sudo sysctl --write net.bridge.bridge-nf-call-iptables=1
```

And check that the following works:

```bash
sudo ip netns exec netns_leah curl 10.100.100.100:8080
```

Making progress!

## Enable hairpin connections

Let's try running:

```bash
sudo ip netns exec netns_dustin curl 10.100.100.100:8080
```

This command will fail. No worries, we learned about hairpin and promiscuous mode
[iptables: How Kubernetes Services Direct Traffic to Pods]({{< ref "iptables-how-kubernetes-services-direct-traffic-to-pods" >}}#enable-hairpin-mode-and-promiscuous-mode),
so we can fix this!

Enable promiscuous mode by running:

```bash
sudo ip link set bridge_home promisc on
```

And let's try running

```bash
sudo ip netns exec netns_dustin curl 10.100.100.100:8080
```

and this fails, much to my surprise. Learning IPVS wasn't too bad, and then I spent an afternoon trying
to figure out why enabling promiscuous mode didn't solve this problem.

It turns out hairpin/masquerade doesn't work for IPVS without enabling the following setting:

```bash
sudo sysctl --write net.ipv4.vs.conntrack=1
```

We can then run:

```bash
sudo ip netns exec netns_dustin curl 10.100.100.100:8080
```

Success! I don't quite understand how enabling conntrack fixes the issue, but it sounds like this setting also handles
supporting masquerade traffic for IPVS.

## Improve masquerade usage

So during our environment setup and the previous posts, we had run:

```bash
sudo iptables \
  --table nat \
  --append POSTROUTING \
  --source 10.0.0.0/24 \
  --jump MASQUERADE
```

This rule masquerades all traffic coming from `10.0.0.0/24`. Kubernetes does _not_ do this by default.
Kubernetes tries to be precise about which traffic it needs masquerade for performance reasons.

We can start by deleting the rule via:

```bash
sudo iptables \
  --table nat \
  --delete POSTROUTING \
  --source 10.0.0.0/24 \
  --jump MASQUERADE
```

We can then be precise and add the following rule for the `netns_dustin` network namespaces:

```bash
sudo iptables \
  --table nat \
  --append POSTROUTING \
  --source 10.0.0.11/32 \
  --jump MASQUERADE
```

This rule works, and the previous `curl` commands continue to work too. We'll have to add a similar rule for each network
namespace, such as `netns_leah`. But wait, one of the main advantages of IPVS was to prevent
having a lot of iptables rules. With all of these masquerade rules, we're going to balloon up iptables again.

Fortunately, there's another tool we can use, ipset. kube-proxy also leverages ipset when in IPVS mode.

Let's start by cleaning up the iptables rule we just created:

```bash
sudo iptables \
  --table nat \
  --delete POSTROUTING \
  --source 10.0.0.11/32 \
  --jump MASQUERADE
```

To begin using ipset, we'll first create a set.

```bash
sudo ipset create DUSTIN-LOOP-BACK hash:ip,port,ip
```

> Note: I recommend running `sudo ipset list` to see the changes after running ipset commands.

This command creates a set named `DUSTIN-LOOP-BACK` that is a hashmap that stores destination IP, destination port, and source IP.

We'll create an entry for the `netns_dustin` network namespace:

```bash
sudo ipset add DUSTIN-LOOP-BACK 10.0.0.11,tcp:8080,10.0.0.11
```

This entry matches the behavior when we make a hairpin connection (a request from `netns_dustin` to `10.100.100.100:8080` is sent back to `10.0.0.11:8080` [`netns_dustin`]).

Now, we'll add a single rule to iptables to masquerade traffic when the request matches this ipset:

```bash
sudo iptables \
  --table nat \
  --append POSTROUTING \
  --match set \
  --match-set DUSTIN-LOOP-BACK dst,dst,src \
  --jump MASQUERADE
```

Once again, the following `curl` commands all work:

```bash
curl 10.100.100.100:8080
sudo ip netns exec netns_leah curl 10.100.100.100:8080
sudo ip netns exec netns_dustin curl 10.100.100.100:8080
```

ipset is not specific to IPVS. We can leverage ipset with just iptables and some CNI plugins like Calico do!

## Add another server to the virtual service

Now let's add the `netns_leah` network namespace as a destination for our virtual service:

```bash
sudo ipvsadm \
  --add-server \
  --tcp-service 10.100.100.100:8080 \
  --real-server 10.0.0.21:8080 \
  --masquerading
```

And add `10.0.0.21` as an entry to `DUSTIN-LOOP-BACK` ipset so that the hairpin connection works for the `netns_leah` network namespace.

```bash
sudo ipset add DUSTIN-LOOP-BACK 10.0.0.21,tcp:8080,10.0.0.21
```

Remember how many chains we had to account for when using iptables? And we had to take caution of the order of rules and the probability of each.

Try running the following command a few times to see the round-robin scheduler in effect:

```bash
curl 10.100.100.100:8080
```

## Future research

After exploring IPVS, I can understand the desire to use IPVS even in smaller clusters for the scheduler settings alone. ipsets is also super cool
and by itself helps with kube-proxy performance issues found in massive clusters.

In the future, I'd like to learn more about

- conntrack
- how some CNIs use virtual tunnels instead of host routing
- how some CNIs use BGP peering
  - I talk about using BGP and BIRD to do this in [Kubernetes Networking from Scratch: Using BGP and BIRD to Advertise Pod Routes]({{< ref "kubernetes-networking-from-scratch-bgp-bird-advertise-pod-routes" >}}).

Have any info on these topics or any questions/comments on this post? Please feel free to connect on [Twitter](https://twitter.com/dustinspecker),
[LinkedIn](https://www.linkedin.com/in/dustin-specker/), or [GitHub](https://github.com/dustinspecker).

And if you enjoyed this post, consider signing up for my newsletter to know when I publish new posts.

{{< convertkit >}}
