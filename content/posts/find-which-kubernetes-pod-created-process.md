---
title: "How to Find Which Kubernetes Pod Created a Process"
images:
  - images/logos/find-which-kubernetes-pod-created-process.png
date: 2020-09-08T12:00:00Z
lastmod: 2020-09-08T12:00:00Z
draft: false
categories:
  - development
tags:
  - kubernetes
  - docker
  - linux
  - nsenter
---

You're debugging in production again. You find a process in the output of `ps aux`, but you need to know which pod created that process.

First, find the process id (PID). The PID is in the second column in the output of `ps aux`. We'll call this `$PID`.

Then execute:

```bash
nsenter -t $PID -u hostname
```

> Note: this is the same as `nsenter --target $PID --uts hostname`.

> Note: Make sure to run `nsenter` on the same node as `ps aux`.

[`nsenter`](https://man7.org/linux/man-pages/man1/nsenter.1.html) is a utility for interacting
with Linux namespaces. We're specifying `$PID` as the process we want to target. For the
provided target process id, we want to enter the process' UTS (UNIX Time-Sharing) namespace. The [UTS
namespace](https://man7.org/linux/man-pages/man7/uts_namespaces.7.html) is responsible for the
hostname and domain name. Fortunately, Kubernetes sets a hostname when creating a pod, where the
hostname is the pod's name.

Finally, we execute the `hostname` command in the process' UTS namespace.

And we see the Kubernetes pod name printed.

Know an easier way? Let me know on [LinkedIn](https://linkedin.com/in/dustin-specker)!

{{< convertkit >}}
