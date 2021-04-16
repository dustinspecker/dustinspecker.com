---
title: "Deploy Kubernetes Applications with the Carvel Suite"
images:
  - images/deploy-kubernetes-applications-carvel-suite/deploy-kubernetes-applications-carvel-suite.png
date: 2021-04-16T12:00:00Z
lastmod: 2021-04-16T12:00:00Z
draft: false
categories:
  - development
tags:
  - carvel
  - vendir
  - ytt
  - kapp
  - helm
  - kubernetes
---

The [Carvel Suite](https://carvel.dev/) is a set of composable tools to help deploy applications to Kubernetes. While other solutions try to solve
all problems in one package, Carvel provides tools and leaves it up to you to glue the components together. This enables a lot of flexibility!

This post will cover using:

- [vendir](https://carvel.dev/vendir/) to fetch dependencies such as YAML files from a Git repository and Helm charts
- [ytt](https://carvel.dev/ytt/) to patch retrieved YAML files using a [Starlark](https://docs.bazel.build/versions/master/skylark/language.html)-based templating language
- [kapp](https://carvel.dev/kapp/) to deploy to Kubernetes and provide release lifecycle management

We'll use these tools to deploy an [nginx deployment](https://github.com/kubernetes/website/blob/master/content/en/examples/application/deployment.yaml) and the
[Loki-Stack Helm chart](https://github.com/grafana/helm-charts/tree/main/charts/loki-stack).

> Note: This posts' example code can be found at [carvel-suite-example](https://github.com/dustinspecker/carvel-suite-example).

## Install required tools

We'll need a few tools to try out the Carvel suite. Download the following:

- [kind v0.10.0](https://github.com/kubernetes-sigs/kind/releases/tag/v0.10.0)
- [vendir v0.18.0](https://github.com/vmware-tanzu/carvel-vendir/releases/tag/v0.18.0)
- [ytt v0.31.0](https://github.com/vmware-tanzu/carvel-ytt/releases/tag/v0.31.0)
- [kapp v0.36.0](https://github.com/vmware-tanzu/carvel-kapp/releases/tag/v0.36.0)
- [helm v3.5.4](https://github.com/helm/helm/releases/tag/v3.5.4)

Once done, go ahead and create a Kubernetes cluster by running:

```bash
kind create cluster
```

## Use vendir to download raw YAML files from Git repo

Our first goal is to consume [Kubernetes' example nginx deployment](https://github.com/kubernetes/website/blob/master/content/en/examples/application/deployment.yaml).

We can use vendir to fetch this YAML file. Start by creating a file named `vendir.yml` with the following content:

```yaml
apiVersion: vendir.k14s.io/v1alpha1
kind: Config
# require a user to use at least version 0.18.0 of vendir
minimumRequiredVersion: 0.18.0
directories:
  # this path is the top level directory to place retrieved assets
  - path: deploy/synced
    contents:
      # this path will create a new directory within the above path, so
      # `deploy/synced/nginx` will contain what's retrieved
      - path: nginx
        # retrieve from a Git repostiory
        git:
          # the path to a valid Git repository
          url: https://github.com/kubernetes/website
          # ref can be a branch, tag, or commit SHA
          ref: master
        # by default all files are fetched, but we only want the
        # `deployment.yaml` file, so let vendir know
        includePaths:
          - content/en/examples/application/deployment.yaml
        # by default, vendir would download the above included path to
        # `deploy/synced/nginx/content/en/examples/application/deployment.yaml`,
        # but we'd prefer to have `deploy/synced/nginx/deployment.yaml`, which
        # we can have by specifying `newRootPath`
        newRootPath: content/en/examples/application/
```

> Note: Consult [vendir.yml spec](https://carvel.dev/vendir/docs/latest/vendir-spec/) for more info on what can exist in `vendir.yml`.

Navigate to the directory where you created the above `vendir.yml` file and run:

```bash
vendir sync
```

This might take a while as the `kubernetes/website` repository is quite large and leverages Git submodules. Fortunately, vendir handles
Git submodules just fine! Afterward, we'll have a structure that looks like this:

```
.
├── deploy
│   └── synced
│       └── nginx
│           └── deployment.yaml
├── vendir.lock.yml
└── vendir.yml
```

We're using the `deploy/synced` to hold files downloaded by vendir. Later we'll create other directories under `deploy` to patch our retrieved files.

Notice the `vendir.lock.yml` file created. At the time of writing this, mine looks like this:

```yaml
apiVersion: vendir.k14s.io/v1alpha1
directories:
  - contents:
      - git:
          commitTitle: "Merge pull request #27570 from rifelpet/kops-url..."
          sha: a88d09c6abee4e23137251ac40cadc733b1c252d
          tags:
            - 969a3db92-133-ga88d09c6a
        path: nginx
    path: deploy/synced
kind: LockConfig
```

This is excellent news because it allows us to specify a branch name in our `vendir.yml` file, but `vendir` will create a lock file to pin the reference to an exact
commit SHA. Even though the master branch will continue to change, we'll always have the same result because of this lock file.

To instruct vendir to use a lock file, we have to run:

```bash
vendir sync --locked
```

## Use ytt to modify nginx deployment

If we look at the contents of `deploy/synced/nginx/deployment.yaml` we'll see:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
spec:
  selector:
    matchLabels:
      app: nginx
  replicas: 2 # tells deployment to run 2 pods matching the template
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:1.14.2
          ports:
            - containerPort: 80
```

Our next goal is to change the replica count to `3`. We can create a template file for ytt to change the replica count from `2` to `3`.

Create a new YAML file named `deploy/overlays/nginx/nginx-deployment-replica-count.yaml` by running:

```bash
mkdir -p deploy/overlays/nginx
touch deploy/overlays/nginx/nginx-deployment-replica-count.yaml
```

> Note: All of these names are a convention I'm using but not required.

The content of `deploy/overlays/nginx/nginx-deployment-replica-count.yaml` should be:

```yaml
#! this is a ytt comment, while #@ are ytt instructions

#! load ytt's overlay module and name it overlay so we can *overlay* a new replica count later
#@ load("@ytt:overlay", "overlay")

#! We'll specify to ytt to only apply this overlay to a resource named nginx-deployment
#! for a resource kind of Deployment
#@overlay/match by=overlay.subset({"kind": "Deployment", "metadata": {"name": "nginx-deployment"}})
---
spec:
  #! change spec.replicas to 3
  replicas: 3
```

We can then run ytt to see the impact of our overlay by running:

```bash
ytt \
  --file ./deploy/synced/nginx \
  --file ./deploy/overlays/nginx \
  --ignore-unknown-comments
```

> Note: `--ignore-unknown-comments` ignores errors when ytt finds regular YAML comments like `# this is a comment`.
> We could provide `--file-mark synced/nginx/deployment.yaml:type=yaml-plain`,
> to explicitly instruct ytt that this file is a plain YAML file.

ytt will print the modified nginx deployment with `3` replicas to stdout!

## Use kapp to deploy

Now that we can create the raw YAML files with ytt, we can deploy them using kapp.

Run the following command:

```bash
ytt \
  --file ./deploy/synced/nginx \
  --file ./deploy/overlays/nginx \
  --ignore-unknown-comments \
| kapp deploy \
  --app dev-nginx \
  --diff-changes \
  --file - \
  --yes
```

This will pipe the output from ytt to kapp. Kapp will then deploy the resources as an app named dev-nginx. The `--diff-changes` option
will display the difference between the cluster's version of the resource and the provided YAML's version. This is super nifty for making
sure the desired change will be deployed. Finally, we provide `--yes` just to automatically say yes to deploy.

> Note: kapp has pretty reasonable defaults on order to submit resources to Kubernetes, similar to Helm. Kapp also supports changing the order
> and configuring how to wait on different resources. Check out [kapp's documentation](https://carvel.dev/kapp/docs/latest/). We won't tackle
> any of this in this post.

We can get a list of deployed applications in the cluster by running:

```bash
kapp list
```

and we can inspect our dev-nginx application by running:

```bash
kapp inspect --app dev-nginx
```

## Use vendir to download the Loki-Stack Helm chart

We've deployed a relatively simple YAML file. Now let's try deploying something more complex, like the Loki-Stack Helm chart.

First, we'll append a `helmChart` content to our `vendir.yml`. Update `vendir.yml` to match:

```yaml
apiVersion: vendir.k14s.io/v1alpha1
kind: Config
# require a user to use at least version 0.18.0 of vendir
minimumRequiredVersion: 0.18.0
directories:
  # this path is the top level directory to place retrieved assets
  - path: deploy/synced
    contents:
      # this path will create a new directory within the above path, so
      # `deploy/synced/nginx` will contain what's retrieved
      - path: nginx
        # retrieve from a Git repostiory
        git:
          # the path to a valid Git repository
          url: https://github.com/kubernetes/website
          # ref can be a branch, tag, or commit SHA
          ref: master
        # by default all files are fetched, but we only want the
        # `deployment.yaml` file, so let vendir know
        includePaths:
          - content/en/examples/application/deployment.yaml
        # by default, vendir would download the above included path to
        # `deploy/synced/nginx/content/en/examples/application/deployment.yaml`,
        # but we'd prefer to have `deploy/synced/nginx/deployment.yaml`, which
        # we can have by specifying `newRootPath`
        newRootPath: content/en/examples/application/
      # `deploy/synced/loki-stack` will contain retrieved Helm chart
      - path: loki-stack
        helmChart:
          # which Helm repository to find the desired Helm chart
          repository:
            url: https://grafana.github.io/helm-charts
          # the name of the desired Helm chart in the above repository
          name: loki-stack
          # the specific version of the above Helm chart
          version: "2.3.1"
```

Once again, run:

```bash
vendir sync
```

vendir will retrieve our nginx deployment file and the loki-stack Helm chart. It'll also update the lock file. Feel free to browse the `deploy/synced/loki-stack` to notice its template and its
dependencies (loki Helm chart, promtail Helm chart, etc.) are included!

## Use ytt to set the namespace for loki-stack resources

Our ytt workflow will be a bit different this time. ytt isn't aware of Helm templates, so we'll
need to use Helm to convert templates to raw YAML files, and then ytt can handle the rest.

We can run:

```bash
helm template loki-stack ./deploy/synced/loki-stack \
| ytt \
  --file - \
  --ignore-unknown-comments
```

At this point, there isn't anything for ytt to handle.

If you look at the output of the above command, you'll notice no namespace is provided. Let's
create a ytt template, so each resource is made in the `loki` namespace.

Create a new file named `deploy/overlays/loki-stack/all-namespace.yaml` by running:

```bash
mkdir -p deploy/overlays/loki-stack/
touch deploy/overlays/loki-stack/all-namespace.yaml
```

Next, make `deploy/overlays/loki-stack/all-namespace.yaml` look like:

```yaml
#@ load("@ytt:overlay", "overlay")

#! add metadata.namespace to each resource
#! when using overlay.all, we must specify an expects
#! in this case, we expect at least 1 resource to be match
#@overlay/match by=overlay.all, expects="1+"
---
metadata:
  #! prevent errors when a resource doesn't even have a namespace key
  #@overlay/match missing_ok=True
  namespace: loki

#! we'll need to take care of the ClusterRoleBinding's subject's namespace as well
#@overlay/match by=overlay.subset({"kind": "ClusterRoleBinding", "metadata": {"name": "loki-stack-promtail-clusterrolebinding"}})
---
subjects:
  #! we can tell ytt which subject to modify by specifying match by "name" key
  #! there's only one subject, so many solutions to handle this
  #@overlay/match by="name"
  - name: loki-stack-promtail
    namespace: loki
```

In Helm, it's common to provide the `--create-namespace` option for Helm to create the release's
namespace if missing. kapp doesn't have this feature, so we'll need another template to add
a namespace resource. Without doing this, kapp will return an error later saying the `loki`
namespace doesn't exist.

Create a file named `deploy/overlays/loki-stack/loki-namespace.yaml`, that has the following:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: loki
```

We can re-run the following command:

```bash
helm template loki-stack ./deploy/synced/loki-stack \
| ytt \
  --file - \
  --ignore-unknown-comments
```

to see the resources printed to stdout again. This time the namespace is set, and the loki namespace resource exists.

## Use ytt to handle Helm test pods

Another great feature of Helm is the concept of test pods. This isn't something kapp is aware of either. Fortunately, we can do some
slight modifications via ytt to effectively use the same test pod spec to validate that an application is deployed correctly.

Let's create another ytt template file named `deploy/overlays/loki-stack/loki-stack-test-pod.yaml` with the following:

```yaml
#@ load("@ytt:overlay", "overlay")

#@overlay/match by=overlay.subset({"kind": "Pod", "metadata": {"name": "loki-stack-test"}})
---
metadata:
  annotations:
    #! since pod specs are mostly immutable, we can instruct kapp to
    #! to always re-create the test pod on updates via the update-strategy
    #! annotation
    #@overlay/match missing_ok=True
    kapp.k14s.io/update-strategy: always-replace

    #! We want to exercise the test pod everytime we deploy to verify
    #! no breaking changes to the application occurred.
    #! The nonce annotation forces the test pod to always have a change.
    #@overlay/match missing_ok=True
    kapp.k14s.io/nonce: ""
spec:
  #! We'll want the test pod to continuously re-run until it completes successfully,
  #! Otherwise, the pod would start and error because Loki and Promtail weren't ready
  #! We could use kapp's change-groups and ordering to deploy the pod after Loki
  #! and Promtail were ready, but I'm okay with CrashLooping until Promtail and Loki
  #! are ready.
  restartPolicy: OnFailure
```

The above YAML file's comments explain how we can leverage the Loki-Stack's test pod
to validate the Loki-Stack deployment. Effectively, we modify the pod to restart until finally
successful, and we instruct kapp to replace the test pod on deployments to validate that
any changes don't break Loki-Stack.

## Use kapp to deploy our group of applications

When we deployed our dev-nginx application, we used `kapp deploy`. The same command can be used for loki-stack, but kapp has
another command, `kapp app-group deploy`, that is useful for deploying multiple applications at once. We provide a directory,
and kapp deploys each application.

This is where the composability of the Carvel suite really shines. We'll want some glue to manage fetching dependencies,
rendering a Helm template (if needed), applying ytt templates, and lastly, deploying to Kubernetes via kapp. Our glue will
be a Bash script.

Create a script named `deploy.sh` with:

```bash
#!/bin/bash
set -ex

vendir sync --locked

# clean previously rendered files
rm -rf ./deploy/rendered

while IFS= read -r -d '' app_directory ; do
  app_name="$(basename "$app_directory")"

  mkdir "./deploy/rendered/$app_name" \
    --parents

  # render Helm templates if Chart.yaml file is found
  SYNCED_DIR="./deploy/synced/$app_name"
  if [ -f "./deploy/synced/$app_name/Chart.yaml" ]; then
    tmp_helm_rendered="$(mktemp --suffix .yaml)"
    helm template "$app_name" "./deploy/synced/$app_name" > "$tmp_helm_rendered"

    SYNCED_DIR="$tmp_helm_rendered"
  fi

  ytt \
    --file "$SYNCED_DIR" \
    --file "./deploy/overlays/$app_name" \
    --ignore-unknown-comments \
  > "./deploy/rendered/$app_name/deploy.yaml"

done < <(find ./deploy/synced/* -maxdepth 0 -type d -print0)

kapp app-group deploy \
  --directory ./deploy/rendered \
  --group dev \
  --yes
```

There's a bit to take in there. Most of it is similar to what we've done already. The bulk is the while loop. We handle
the case where it's a Helm chart. This is where we could also support kustomize and other packages to consume. We create
a directory for each rendered application under `deploy/rendered/`. Then we can simply instruct kapp to deploy the entire
`deploy/rendered` directory. The `--group` option will prefix each application name, which is the directory name under `deploy/rendered`,
such as `nginx` and `loki-stack`.

If we run:

```bash
bash deploy.sh
```

kapp will detect no changes to dev-nginx, and it'll deploy our loki-stack application.

## Closing thoughts

I'm really excited about the Carvel suite. Having the fully rendered YAML files available opens several avenues for static analysis before even
attempting to deploy to a real cluster, and I'm all about that fast feedback loop.

There's a tradeoff with Carvel compared to other tools, given the amount of glue needed. For me, this composability is what I'm after. We've created a workflow
that handles plain YAML files and Helm charts. It wouldn't be much effort to support kustomize, for example. The flexibility here is empowering.

Are you using Carvel for anything? What's working out for you? Let me know on [Twitter](https://twitter.com/dustinspecker), [LinkedIn](https://linkedin.com/in/dustin-specker/), or
[GitHub](https://github.com/dustinspecker).

{{< convertkit >}}
