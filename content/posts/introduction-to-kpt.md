---
title: "Introduction to kpt"
date: 2020-05-04T17:04:22Z
lastmod: 2020-05-04T17:04:22Z
draft: false
categories:
  - development
tags:
  - kpt
  - kustomize
  - kubernetes
  - gitops
  - helm
---

[kpt](https://googlecontainertools.github.io/kpt/) is one of the newest tools focused on packaging
Kubernetes resources and leveraging GitOps to manage Kubernetes clusters. kpt tries to leverage
the strengths of the existing [Helm](https://helm.sh/) and [kustomize](https://kustomize.io/)
communities, while enabling better management around upgrading Kubernetes resource documents retrieved
from external sources using Git. In addition, kpt enables organizations to introduce validations to
their Kubernetes documents and makes it easier to migrate from one pattern to another via the use of
[kpt Functions](https://googlecontainertools.github.io/kpt/guides/producer/functions/).

A reminder kpt is pretty new and there are some rough edges here and there.

> I've created a repository containing what this post goes through for reference at
> [github.com/dustinspecker/kpt-demo](https://github.com/dustinspecker/kpt-demo).

# Why I'm trying kpt

My first goal with kpt was to improve how I use [ingress-nginx](https://kubernetes.github.io/ingress-nginx/)
on my home server. My home server is a single node Kubernetes instance that I use to mostly host media. I've
been using ingress-nginx to provide an ingress solution. To be precise I use the
[baremetal configuration](https://github.com/kubernetes/ingress-nginx/blob/controller-0.31.1/deploy/static/provider/baremetal/deploy.yaml).
While deploying this configuration I use the directions for
[Via the host network](https://kubernetes.github.io/ingress-nginx/deploy/baremetal/#via-the-host-network).
This requires me to enable `hostNetwork: true` on the pods created by the ingress-nginx-controller deployment.
In addition I remove the ingress-nginx service. The directions above describe using a DaemonSet instead of a
Deployment for the ingress-nginx-controller, but since I have a single node I don't worry about it.

Adding the `hostNetwork: true` is relatively easy with kustomize by creating a patch. I'll demonstrate this
later on and show that kpt doesn't interfere with existing workflows using kustomize.

Deleting the ingress-nginx service is where it gets tricky from a kustomize perspective. To my knowledge
kustomize tries very hard to stay out of the business of removing/deleting anything and doesn't support it.
Fortunately for us, kpt supports [creating functions](https://googlecontainertools.github.io/kpt/guides/producer/functions/).
These functions can be any container that fulfills the kpt function interface as described in
[kpt's container runtime documentation](https://googlecontainertools.github.io/kpt/guides/producer/functions/container/).
kpt also has alpha support for using [Starlark](https://googlecontainertools.github.io/kpt/guides/producer/functions/starlark/).
With this being said we can use a function in a container to delete a Kubernetes resource.

# installing kpt

At the time of writing this `v0.24.0` is the latest release of kpt. You may download a tar containing this
version of kpt from the following links:

| OS      | Link                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------ |
| Linux   | https://storage.googleapis.com/kpt-dev/releases/v0.24.0/linux_amd64/kpt_linux_amd64-v0.24.0.tar.gz     |
| macOS   | https://storage.googleapis.com/kpt-dev/releases/v0.24.0/darwin_amd64/kpt_darwin_amd64-v0.24.0.tar.gz   |
| Windows | https://storage.googleapis.com/kpt-dev/releases/v0.24.0/windows_amd64/kpt_windows_amd64-v0.24.0.tar.gz |

Once downloaded, you'll need to extract the kpt executable out of the tar.

On Linux, run the following to install the kpt executable to `~/kpt`.

```bash
cd ~
curl https://storage.googleapis.com/kpt-dev/releases/v0.24.0/linux_amd64/kpt_linux_amd64-v0.24.0.tar.gz |
tar --extract --gzip --file -
~/kpt version
```

The above should end up outputting `v0.24.0`.

# creating a new kpt package

To create a new package we need to first create a new directory. We'll name it `kpt-demo`. This can be done
by running:

```bash
mkdir ~/kpt-demo
```

Afterwards we'll create a new kpt package by running:

```bash
kpt pkg init ~/kpt-demo
```

Then navigate to `~/kpt-demo`. This will create two files, `~/kpt-demo/Kptfile` and
`~/kpt-demo/README.md`. The `README.md` includes some steps on how to use `kubectl` to apply any
Kubernetes documents. At this point we have none. The `Kptfile` has some metadata including the
package name and a short description.

At this point you could create some Kubernetes documents like normal and go on your way, but that's super
boring and isn't flexing kpt. Where kpt shines is using remote resources and modifying those to fit your
needs. Helm takes the path of having Helm charts where the chart is only as configurable as the Helm chart's
maintainers have made it via its `values.yaml` file. Kustomize allows using remote resources and patching to
your heart's content, but Kustomize does not handle remote resources that are lacking a `kustomization.yaml`
file. This is a nice gap that kpt fills. kpt doesn't require a remote resource to have a `Kptfile` or a
`kustomization.yaml` or anything.

We'll start by adding the ingress-nginx's
[deploy.yaml](https://github.com/kubernetes/ingress-nginx/blob/controller-0.31.1/deploy/static/provider/baremetal/deploy.yaml)
to our kpt package as a dependency. This can be done by running the following:

```bash
kpt pkg sync set https://github.com/kubernetes/ingress-nginx.git/deploy/static/provider/baremetal@controller-0.31.1 ingress-nginx
```

The format of a dependency is `GIT_REPO/DIRECTORY_PATH@GIT_REF`. It's not required to add `.git` to the `GIT_REPO`, but it's considered a
good practice. In this case we're telling kpt we have a dependency in a Git repository located at
`https://github.com/kubernetes/ingress-nginx.git`. The directory we want is located at `deploy/static/provider/baremetal` within the repo.
We are not able to specify an individual file; kpt requires a directory. And finally our `GIT_REF` is `controller-0.31.1`, which is a
tag in this case.

Afterwards take a look at the Kptfile. The above command added a dependency to our kpt package named ingress-nginx. So far kpt has
not actually retrieved the ingress-nginx dependency. To retrieve it run:

```bash
kpt pkg sync .
```

This command will go and fetch our ingress-nginx dependency. After kpt has completed fetching, we'll have a new directory named
ingress-nginx. It'll have two files, `deploy.yaml` and `Kptfile`. The `deploy.yaml` file is the only file in the directory we
specified in our dependency and the `Kptfile` includes some metadata around what was fetched including the exact commit hash
of the commit used for our desired `controller-0.31.1` ref.

# creating a patch using kustomize

Now that we have ingress-nginx fetched the first objective is to add `hostNetwork: true` to the ingress-nginx-controller
deployment. Kustomize works great for patching, so let's use it. We'll start by creating a `kustomization.yaml` file in
`~/kpt-demo` with the following content:

```yaml
resources:
  - ingress-nginx/deploy.yaml
patchesStrategicMerge:
  - patches/patch-deployment.yaml
```

We'll also need to create a `patches` directory, which can be done by running:

```bash
mkdir ~/kpt-demo/patches
```

Now we'll create a `patch-deployment.yaml` file in the `~/kpt-demo/patches` directory with the following content:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ingress-nginx-controller
  namespace: ingress-nginx
spec:
  template:
    spec:
      hostNetwork: true
```

To validate everything is wired up properly, from the `~/kpt-demo` directory, we can run:

```bash
kubectl apply \
  --dry-run \
  --kustomize . \
  --output yaml
```

or we can run:

```bash
kustomize build .
```

Whichever you prefer. Either way, we should see YAML printed to our terminal. If you look through the
output you'll see `hostNetwork: true` was added to our ingress-nginx-controller deployment.

Theoretically, to deploy what we currently have we could run:

```bash
kubectl apply \
  --kustomize .
```

And at this point the advantage of kpt is keeping track of our dependencies.

# using container functions

Now we want to tackle deleting the ingress-nginx-controller service. This is something kustomize doesn't
support. This is a great excuse to learn about using kpt functions. I've created a kpt container function
at [github.com/dustinspecker/kpt-remove-resource](https://github.com/dustinspecker/kpt-remove-resource).
This function requires passing a `kind`, `name`, and a `namespace`. Any found Kubernetes resource matching
all three will be removed.

Starting off this function may be used via the kpt CLI by navigating to `~/kpt-demo` directory and running
the following command:

```bash
kpt fn run . --image dustinspecker/kpt-remove-resource:latest -- kind=Service name=ingress-nginx-controller namespace=ingress-nginx
```

This command instructs kpt to execute the `dustinspecker/kpt-remove-resource:latest` image. kpt will provide
the list of resources via `stdin` to the container. kpt will also create a `functionConfig` (`ConfigMap`)
from the additional provided information for the container to get its configuration. The container will
execute and this container will print to `stdout` all resources that do not match all three provided
criteria.

Using the CLI is a great way to quickly verify if a kpt function will do the trick, but kpt provides
a declarative solution as well so that we don't have to keep track of all of these commands. We can
create a YAML file in our `~/kpt-demo` directory named `remove-ingress-nginx-controller-service.yaml`
with the following content:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  annotations:
    config.kubernetes.io/function: |
      container:
        image: dustinspecker/kpt-remove-resource:latest
data:
  kind: Service
  name: ingress-nginx-controller
  namespace: ingress-nginx
```

So instead of having to run the CLI with all of the provided information we can simply run:

```bash
kpt fn run .
```

in our `~/kpt-demo` directory and kpt will execute every function config it finds. This makes
it easy to commit a repeatable procedure for running kpt functions.

So now we have an automated process for patching the deployment with `hostNetwork: true` and
for removing the ingress-nginx-controller service. At this point we're able to deploy our
resources by running the following:

```bash
kubectl apply \
  --kustomize .
```

This will process our patch using kustomize and then deploy the resources to our Kubernetes
cluster.

# updating ingress-nginx

One of the kpt features I'm excited about is updating dependencies. We can attempt to update
our ingress-nginx dependency by running:

```bash
kpt pkg update ingress-nginx@controller-0.32.0
```

This tells kpt to update our ingress-nginx dependency to the `controller-0.32.0` ref of the
same repository originally used to fetch ingress-nginx.

The above command will fail saying local packages have beeen modified, specifically
our `deploy.yaml`. By default, kpt tries to use a `fast-forward` strategy. This means kpt is
expecting zero changes to our local version since we fetched and kpt plans to simply update
our resources to their newer version. Unfortunately, we have modified our local version.
Fortunately, kpt has several strategies to handle updating dependencies.

We can instead run the following command:

```bash
kpt pkg update ingress-nginx@controller-0.32.0 \
  --strategy resource-merge
```

This command should succeed. This tells kpt to look at our local resources, find the matches
with the upstream changes, and attempt to merge the upstream changes to our local version.

kpt also has support for another strategy called `force-delete-replace` which will delete the
local version and fetch the new version. You'll then have to run your kpt functions again.
Finally, kpt has a strategy in alpha named `alpha-git-patch`. This one will create a patch
including the upstream changes and apply it to the local version using Git's `am` command.

The default strategy used may be changed in the `Kptfile` as well.

In my little use with kpt I've been using resource-merge the most, but I'm considering using
`force-delete-replace` and re-running kpt functions. This will make sure I don't miss out on
new resources added to upstream dependencies. It should be possible to have a Continuous
Integration process to also validate that `kpt fn run .` has been ran to make sure that's
never missed by a developer updating dependencies.

And to deploy our updated dependencies to our cluster we can once again run:

```bash
kubectl apply \
  --kustomize .
```

This will update any changed resources in our cluster due to our dependency update.

# other kpt functionality to explore in the future

kpt also features a live command that will apply resources to a Kubernetes cluster. I've
only used this a little bit, but it seems pretty similar to Helm v3. kpt uses ConfigMaps
to keep track of what it has deployed in a cluster. The live command also has a neat
diff and preview subcommand that display the differences between the cluster and local version
and what would happen to the cluster if the local version was applied.

I'm interested to see what workflows kpt enables. I think there's going to be a lot of improvements
for most of our workflows by leveraging kpt functions.
