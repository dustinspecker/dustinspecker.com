---
title: "Open Policy Agent: Introduction to Gatekeeper"
images:
  - images/opa-gatekeeper/opa-gatekeeper.png
date: 2020-11-15T12:00:00Z
lastmod: 2020-11-22T12:00:00Z
draft: false
categories:
  - development
tags:
  - gatekeeper
  - open-policy-agent
  - kubernetes
  - security
  - rego
---

[Open Policy Agent (OPA)](https://www.openpolicyagent.org/) focuses on creating a single declarative
policy language ([rego](https://www.openpolicyagent.org/docs/latest/policy-language/))
that can enforce compliance and promote security. Different projects focused
on a range of areas can use Open Policy Agent, so users have one familiar language to
use, and projects don't have to invent their policy language. One project using OPA is
[Gatekeeper](https://github.com/open-policy-agent/gatekeeper). Gatekeeper is a Kubernetes-aware
policy enforcer and auditor. It can audit deployed resources in a cluster, while also denying
resources to be deployed at all.

Let's deploy Gatekeeper and experiment with creating a policy to forbid using the `latest`
tag in images.

## How does Gatekeeper work?

Gatekeeper has three components: a controller for creating policies, an auditor, and a validating webhook.

The controller creates Constraint CustomResourceDefinitions for each ConstraintTemplate created
in the cluster. The ConstraintTemplates define policies using OPA's rego language. Constraints
inform Gatekeeper the Kubernetes resources policies should be applied (pods, namespaces, etc.)
to and any required parameters.

The auditor will scan the cluster's resources to find any policy violations. Any violations will
appear in a Constraint's status.

Creating or updating resources in the cluster invokes the validating webhook. If a resource
violates a Constraint, then the resource creation or modification is denied; otherwise, it's allowed.

Constraints can either be enforced to deny or dryrun. Deny means the webhook will reject, while dryrun
will let it pass. Deny is the more secure thing, but dryrun is excellent for testing out new
policies.

Be aware that just because the webhook is enforcing a Constraint, any resources created in the cluster
**before** the validating webhook exists will not be deleted or rejected. The auditor will
report the resource as violating, though.

## Deploy Gatekeeper

Like almost every post around Kubernetes I write, let's create a kind cluster to play with Gatekeeper.

Install [kind](https://kind.sigs.k8s.io/) if not installed. I'm using kind version `v0.8.1`.

Run the following to create a cluster:

```bash
kind create cluster
```

Install [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/) so that we can
deploy Gatekeeper. I'm using kubectl version `v1.18.5`.

Deploy Gatekeeper's components by running:

```bash
kubectl apply \
  --kustomize github.com/open-policy-agent/gatekeeper//config/default?ref=v3.2.1

kubectl wait deployment gatekeeper-audit \
  --for condition=Available \
  --namespace gatekeeper-system \
  --timeout 100s

kubectl wait deployment gatekeeper-controller-manager \
  --for condition=Available \
  --namespace gatekeeper-system \
  --timeout 100s
```

The above commands will deploy Gatekeeper `v3.2.1` and wait for the `gatekeeper-audit` and
`gatekeeper-controller-manager` deployments to be available.

## Create ConstraintTemplate

Now that Gatekeeper is deployed, we can begin creating ConstraintTemplates. Let's make a policy
that enforces images not to use the `latest` tag.

Create a file named `latest-image-constraint-template.yaml` with the following content:

```yaml
apiVersion: templates.gatekeeper.sh/v1beta1
kind: ConstraintTemplate
metadata:
  name: latestimage
spec:
  crd:
    spec:
      names:
        kind: LatestImage
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package latestimage

        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          endswith(container.image, ":latest")
          msg := sprintf("container <%v> uses an image tagged with latest <%v>", [container.name, container.image])
        }
```

A couple of gotchas to be aware of:

- name of ConstraintName **must** be the lowercase name of `spec.crd.spec.names.kind`
- target must be `admission.k8s.gatekeeper.sh`
- targets list may only have one target
- if ConstraintTemplate has invalid rego, the ConstraintTemplate's status shows build errors

The rego code must have a violation block defined. Gatekeeper will execute this rego for every
matching Kubernetes resource. During execution, the `input.review.object` is the Kubernetes resource
under evaluation.
In this case, we're assuming the object under review is a pod. From there, we iterate over each
container in the pod's spec. The `_` is a nice feature of rego that creates a new iterator.
Then for each container found, we check that the image ends with `:latest`. If the image name
ends with`:latest`, we create a message as part of the violation.

A neat thing about rego is the block within `violation` continues processing if the statement is true.
The assignment statements (`:=`) evaulate as true. `endswith` only evaluates as true if
the string does, in fact, end with `:lastest`. If this is false, our violation will be resolved to false and not create a message. It's a different way of thinking than most of
us are used to, but it's a pretty nice approach to policies.

Finally, to submit the ConstraintTemplate run:

```bash
kubectl apply \
  --filename latest-image-constraint-template.yaml
```

Gatekeeper will detect the newly created ConstraintTemplate and create a new CustomResourceDefinition
named `LatestImage`.

At this point, Gatekeeper isn't enforcing this policy. To enforce the policy, we'll need to
create a Constraint.

## Create Constraint

ConstraintTemplates define a policy, while Constraints dictate which Kubernetes resources to apply
the policy to and enforce the policy (dryrun or deny as described previously).

Create a new file named `latest-image-constraint.yaml` with the content:

```yaml
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: LatestImage
metadata:
  name: not-allowed
spec:
  enforcementAction: dryrun
  match:
    kinds:
      - apiGroups: [""]
        kinds: ["Pod"]
```

It's a good practice to provide a match. If a match is missing, then Gatekeeper will apply the Constraint to each resource kind.
Providing a match improves performance.

Now, create the Constraint via:

```bash
kubectl apply \
  --filename latest-image-constraint.yaml
```

We can see current violations in the status of the Constraint by running:

```bash
kubectl describe latestimage not-allowed
```

to see something like:

```
Status:
  ...
  Total Violations: 0
```

To cause a violation, run:

```bash
kubectl run nginx \
  --image nginx:latest
```

Wait about a minute for Gatekeeper to run audits and then describe the constraint again via:

```bash
kubectl describe latestimage not-allowed
```

and now we'll see:

```
Status:
  Total Violations: 1
  Violations:
    Enforcement Action:  dryrun
    Kind:                Pod
    Message:             container <nginx> uses an image tagged with latest <nginx:latest>
    Name:                nginx
    Namespace:           default
```

The offending pod is listed as well as our message from our rego policy.

We now have audit functionality, but this still doesn't prevent someone from doing something
malicious. To stop this completely, we need to leverage Gatekeeper's
[Validating Webhook](https://kubernetes.io/docs/reference/access-authn-authz/extensible-admission-controllers/).

## Enforce Constraint via webhook

Go ahead and delete the nginx pod we just created by running:

```bash
kubectl delete pod nginx
```

For Gatekeeper to enforce a Constraint, a Constraint must specify an `enforcementAction` of `deny`.
So go ahead and change `dryrun` to `deny` in `latest-image-constraint.yaml`.

Then re-apply by running:

```bash
kubectl apply \
  --filename latest-image-constraint.yaml
```

Then let's try creating the nginx pod again.

```bash
kubectl run nginx \
  --image nginx:latest
```

And immediately our request errors with:

> Error from server ([denied by not-allowed] container <nginx> uses an image tagged with latest <nginx:latest>): admission webhook "validation.gatekeeper.sh" denied the request: [denied by not-allowed] container <nginx> uses an image tagged with latest <nginx:latest>

Look at that! Now no one can create a pod using the `latest` tag.

## Add a parameter to the ConstraintTemplate

So far, the value of ConstraintTemplates isn't visible. Why not just combine ConstraintTemplates
and Constraints into a single resource? Imagine after we've created a Constraint to forbid
the `latest` tag, we get asked to ban a `test` tag. This reason is where ConstraintTemplates
start to shine.

Our ConstraintTemplate logic is the same for the `latest` and `test` tag. We need to fix the
hardcoding of `latest`, though. Fortunately, ConstraintTemplates support parameters.

Go ahead and delete our existing ConstraintTemplate and Constraint by running:

```bash
kubectl delete latestimage not-allowed
kubectl delete constrainttemplate latestimage
```

Create a new file named `image-tag-constraint-template.yaml` with the following content:

```yaml
apiVersion: templates.gatekeeper.sh/v1beta1
kind: ConstraintTemplate
metadata:
  name: imagetag
spec:
  crd:
    spec:
      names:
        kind: ImageTag
      validation:
        openAPIV3Schema:
          properties:
            tag:
              type: string
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package imagetag

        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          endswith(container.image, sprintf(":%s", [input.parameters.tag]))
          msg := sprintf("container <%v> uses an image tagged with %v <%v>", [container.name, input.parameters.tag, container.image])
        }
```

Notice we've added a `validation` section, which validates parameters. The hardcoding of `:latest`
has been replaced by `sprintf(":%s", [input.parameters.tag])` to leverage our new parameter named tag.

Create this ConstraintTemplate by running:

```bash
kubectl apply \
  --filename image-tag-constraint-template.yaml
```

Now we need to create a Constraint for `latest` tag. Make a new file named `latest-image-tag-constraint.yaml` with:

```yaml
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: ImageTag
metadata:
  name: latest-not-allowed
spec:
  enforcementAction: deny
  match:
    kinds:
      - apiGroups: [""]
        kinds: ["Pod"]
  parameters:
    tag: latest
```

Notice the addition of the tag parameter and the kind change. Once again, we can deploy this by:

```bash
kubectl apply \
  --filename latest-image-tag-constraint.yaml
```

We've now refactored our ConstraintTemplate and Constraint to match the existing behavior.

To enforce a `test` tag isn't used, we create another file named `test-image-tag-constraint.yaml`:

```yaml
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: ImageTag
metadata:
  name: test-not-allowed
spec:
  enforcementAction: deny
  match:
    kinds:
      - apiGroups: [""]
        kinds: ["Pod"]
  parameters:
    tag: test
```

and submit it by:

```bash
kubectl apply \
  --filename test-image-tag-constraint.yaml
```

And now the following commands will fail:

```bash
kubectl run nginx \
  --image nginx:latest

kubectl run nginx-test \
  --image nginx:test
```

as Gatekeeper's validating webhook will reject both requests.

We could have copied and pasted our original policy to forbid the latest tag and simply change
`latest` to `test`. We'd have to remember we duplicated this code for any bug fixes or enhancements
in the future. Using parameterized ConstraintTemplate enables us to de-duplicate our
ConstraintTemplates.

## Next steps

In the next post, I'll cover how to unit test our policies. This process provides a quicker feedback loop by
not deploying to a cluster first and catches mistakes like syntax issues earlier.

Update: You can read about unit testing policies here:
[Open Policy Agent: Unit Testing Gatekeeper Policies]({{< ref "open-policy-agent-unit-testing-gatekeeper-policies" >}})

{{< convertkit >}}
