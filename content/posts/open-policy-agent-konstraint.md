---
title: "Open Policy Agent: Konstraint"
images:
  - images/logos/open-policy-agent-konstraint.png
date: 2020-11-29T12:00:00Z
lastmod: 2020-11-29T12:00:00Z
draft: false
categories:
  - development
series:
  - Open Policy Agent & Gatekeeper
tags:
  - konstraint
  - gatekeeper
  - open-policy-agent
  - security
  - kubernetes
  - rego
---

[Konstraint](https://github.com/plexsystems/konstraint) is a tool for converting Open Policy
Agent policies written in rego into ConstraintTemplates and Constraints for Gatekeeper. In
[Open Policy Agent: Introduction to Gatekeeper]({{< ref "open-policy-agent-introduction-gatekeeper" >}}),
we learned how to deploy Gatekeeper and create ConstraintTemplates and Constraints. Then in
[Open Policy Agent: Unit Testing Gatekeeper Policies]({{< ref "open-policy-agent-unit-testing-gatekeeper-policies" >}}),
we copied rego from ConstraintTemplates to validate syntax and unit test policies.

This process
left us with duplication of rego because it existed in the ConstraintTemplate and rego files.
Konstraint is the missing piece. Konstraint can be used in a build process to convert rego into
ConstraintTemplates and Constraints preventing us from having to duplicate code.

## Download konstraint

`konstraint` can be downloaded from [Konstraint's releases page](https://github.com/plexsystems/konstraint/releases). I'll be using version `v0.9.2`.

To install on Linux, for example, run:

```bash
curl https://github.com/plexsystems/konstraint/releases/download/v0.9.2/konstraint-linux-amd64 \
  --location \
  --output ~/konstraint
chmod +x ~/konstraint
sudo mv ~/konstraint /usr/local/bin
```

To verify `konstraint` is installed correctly, run:

```bash
konstraint --version
```

and the output should be:

```
konsstraint version v0.9.2
```

## Project setup

We'll use the existing structure from the previous post. Our project structure will look like:

```
~/policies
└── image-tag
    ├── src.rego
    └── src_test.rego
```

For this post, we'll ignore the contents of `src_test.rego` as Konstraint ignores files that end
with `_test.rego`.

We'll start with the rego code that did not have a parameter, so `src.rego` is:

```rego
package imagetag

violation[{"msg": msg}] {
  container := input.review.object.spec.containers[_]
  endswith(container.image, ":latest")
  msg := sprintf("container <%v> uses an image tagged with latest <%v>", [container.name, container.image])
}
```

## Use Konstraint to create ConstraintTemplates and Constraints

With our project setup, now we can run:

```bash
konstraint create ~/policies
```

Our project structure will then look like:

```
policies
└── image-tag
    ├── constraint.yaml
    ├── src.rego
    ├── src_test.rego
    └── template.yaml
```

Konstraint created two files, `constraint.yaml` and `template.yaml`.

`template.yaml` looks like:

```yaml
apiVersion: templates.gatekeeper.sh/v1beta1
kind: ConstraintTemplate
metadata:
  creationTimestamp: null
  name: imagetag
spec:
  crd:
    spec:
      names:
        kind: ImageTag
  targets:
    - rego: |-
        package imagetag

        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          endswith(container.image, ":latest")
          msg := sprintf("container <%v> uses an image tagged with latest <%v>", [container.name, container.image])
        }
      target: admission.k8s.gatekeeper.sh
status: {}
```

Looks like what we created in
[Open Policy Agent: Introduction to Gatekeeper]({{< ref "open-policy-agent-introduction-gatekeeper" >}})!

And `constraint.yaml` looks like:

```yaml
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: ImageTag
metadata:
  name: imagetag
```

This Constraint works as-is but is different than what we did before. `enforcementAction` is omitted,
meaning the default of `deny` is in effect. The `match` is also missing for this Constraint, so
Gatekeeper will execute this policy against all resources.

Fortunately, Konstraint has a solution for this. We can add comments to our rego to set these options.
Update `src.rego` to look like:

```rego
# @enforcement dryrun
# @kinds core/Pod
package imagetag

violation[{"msg": msg}] {
  container := input.review.object.spec.containers[_]
  endswith(container.image, ":latest")
  msg := sprintf("container <%v> uses an image tagged with latest <%v>", [container.name, container.image])
}
```

Re-run:

```bash
konstraint create ~/policies
```

and `constraint.yaml` will now look like:

```yaml
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: ImageTag
metadata:
  name: imagetag
spec:
  enforcementAction: dryrun
  match:
    kinds:
      - apiGroups:
          - ""
        kinds:
          - Pod
```

Perfect. Now we're able to only write rego code in one place, `src.rego`, and generate
ConstraintTemplates and Constraints using Konstraint.

## Use Konstraint to create parameterized ConstraintTemplates

Now, let's update our `src.rego` to use a parameter.

```rego
# @enforcement dryrun
# @kinds core/Pod
# @parameter tag string
package imagetag

violation[{"msg": msg}] {
  container := input.review.object.spec.containers[_]
  endswith(container.image, sprintf(":%s", [input.parameters.tag]))
  msg := sprintf("container <%v> uses an image tagged with %v <%v>", [container.name, input.parameters.tag, container.image])
}
```

Go ahead and delete the `template.yaml` and `constraint.yaml` files. Then re-run:

```bash
konstraint create ~/policies
```

> Note: `konstraint create` will verify each parameter referenced in rego is described with a
> `@parameter` comment and vice versa.

Notice now that only `template.yaml` is created, which looks like:

```yaml
apiVersion: templates.gatekeeper.sh/v1beta1
kind: ConstraintTemplate
metadata:
  creationTimestamp: null
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
    - rego: |-
        package imagetag

        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          endswith(container.image, sprintf(":%s", [input.parameters.tag]))
          msg := sprintf("container <%v> uses an image tagged with %v <%v>", [container.name, input.parameters.tag, container.image])
        }
      target: admission.k8s.gatekeeper.sh
status: {}
```

When Konstraint detects a parameterized rego, Konstraint will skip creating a `constraint.yaml` file.
It is up to the user to manually create a `constraint.yaml` file as Konstraint doesn't know the
parameters.

A bit of a bummer, but we still get the incredible benefit of the automatic creation of ConstraintTemplates.

> Note: `@enforcement` and `@kinds` comments are both ignored by Konstraint when the policy
> is parameterized, so no need to specify them.

## Use Konstraint to build documentation

On top of creating ConstraintTemplate and Constraints (in some cases), Konstraint can generate
policy documentation.

Once again, update `src.rego` to be:

```rego
# @title imagetag
#
# imagetag validates if any pods' containers are using an invalid image tag.
#
# @enforcement dryrun
# @kinds core/Pod
# @parameter tag string
package imagetag

violation[{"msg": msg}] {
  container := input.review.object.spec.containers[_]
  endswith(container.image, sprintf(":%s", [input.parameters.tag]))
  msg := sprintf("container <%v> uses an image tagged with %v <%v>", [container.name, input.parameters.tag, container.image])
}
```

and then run:

```bash
konstraint doc ~/policies --output ~/policies.md
```

Konstraint will create a file at `~/policies.md` with the policy's title, description, the
rego code itself, enforcement kind, and any kinds/parameters specified.

## More opa tools?

We've now tackled Gatekeeper, opa, and Konstraint. Konstraint is relatively new, but I look forward to
future features it adds. Know any more tools to help with writing policies? Or better ways to use these
tools? Please let me know on [Twitter](https://twitter.com/dustinspecker) or
[LinkedIn](https://www.linkedin.com/in/dustin-specker/).

{{< convertkit >}}
