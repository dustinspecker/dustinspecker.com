---
title: "Open Policy Agent: Unit Testing Gatekeeper Policies"
images:
  - images/logos/open-policy-agent-unit-testing-gatekeeper-policies.png
date: 2020-11-22T12:00:00Z
lastmod: 2020-11-29T12:00:00Z
draft: false
categories:
  - development
series:
  - Open Policy Agent & Gatekeeper
tags:
  - gatekeeper
  - open-policy-agent
  - security
  - kubernetes
  - rego
  - testing
---

Previously, in
[Open Policy Agent: Introduction to Gatekeeper]({{< ref "open-policy-agent-introduction-gatekeeper" >}}),
we deployed Gatekeeper in a Kubernetes cluster and created some sample ConstraintTemplates
and constraints to enforce Open Policy Agent (OPA) policies. Now, we'll tackle creating unit
tests for our policies.

## Download opa CLI

Open Policy Agent provides a CLI named `opa`. `opa` is equipped with several features such
as

- formatting code
- checking syntax
- testing
- benchmarking

We'll be using `v0.24.0` of `opa` in this post, which can
be downloaded from [opa's releases](https://github.com/open-policy-agent/opa/releases/tag/v0.24.0),
and choose the binary for your operating system under assets.

## Create rego file

Let's start by creating a project structure like:

```
~/policies
└── image-tag
    └── src.rego
```

The `src.rego` file is empty.

We'll start with the same rego code we used to check if an image uses the `latest`
tag. Unfortunately, `opa` isn't aware of ConstraintTemplates, so we'll create new rego files with
only the policy itself.

Update `src.rego` to have the following code.

```rego
package imagetag

violation[{"msg": msg}] {
  container := input.review.object.spec.containers[_]
  endswith(container.image, ":latest")
  msg := sprintf("container <%v> uses an image tagged with latest <%v>", [container.name, container.image])
}
```

## Validate opa policy syntax

We can immediately take advantage of `opa` by running

```bash
opa check ~/policies
```

This command validates
the syntax of all rego files found. `opa` will print any errors it finds. This alone helps our
feedback loop with Gatekeeper. Before, we wouldn't know
about syntax issues or a built-in function name typo until we applied our ConstraintTemplate to
a Kubernetes cluster and then described the ConstraintTemplate to see errors in its status.

## Test opa policy

Create a new file named `src_test.rego` next to `src.rego` so that the project structure now
looks like:

```
~/policies
└── image-tag
    ├── src.rego
    └── src_test.rego
```

We'll add unit tests in `src_test.rego`, such that it looks like:

```rego
package imagetag

test_latest_tag_is_denied {
  image := "busybox:latest"
  input := {"review": input_review(image)}
  results := violation with input as input
  count(results) == 1
}

test_different_tag_is_allowed {
  image := "busybox:1.32.0"
  input := {"review": input_review(image)}
  results := violation with input as input
  count(results) == 0
}

input_review(image) = output {
  output = {
    "object": {
      "metadata": {
        "name": "busybox"
      },
      "spec": {
        "containers": [
          {
            "name": "busybox",
            "image": image
          }
        ]
      }
    }
  }
}
```

Then we can run:

```bash
opa test ~/policies
```

and see these unit tests pass.

`opa test` looks through rego files to find any rules starting with `test_`. It executes these rules and expects them
to be true.

We've defined two test cases, `test_latest_tag_is_denied` and `test_different_tag_is_allowed`. In both cases, we specify
an image to validate, create an `input` object mirroring what Gatekeeper will pass, get any violation results, and finally
assert if there are any violations.

`opa test` is a convenient way to check our logic before deploying to a real cluster.

## Test parameterized opa policy

In the previous post, we eventually converted our ConstraintTemplate to require a parameter for which tag to reject. We'll
do the same thing again and then update our tests accordingly.

Update `src.rego` to use a parameter:

```rego
package imagetag

violation[{"msg": msg}] {
  container := input.review.object.spec.containers[_]
  endswith(container.image, sprintf(":%s", [input.parameters.tag]))
  msg := sprintf("container <%v> uses an image tagged with %v <%v>", [container.name, input.parameters.tag, container.image])
}
```

and update our tests accordingly:

```rego
package imagetag

test_parameter_tag_is_denied {
  image := "busybox:latest"
  input := {"review": input_review(image), "parameters": input_parameters("latest")}
  results := violation with input as input
  count(results) == 1
}

test_different_tag_is_allowed {
  image := "busybox:1.32.0"
  input := {"review": input_review(image), "parameters": input_parameters("latest")}
  results := violation with input as input
  count(results) == 0
}

input_parameters(tag) = output {
  output = {
    "tag": tag
  }
}

input_review(image) = output {
  output = {
    "object": {
      "metadata": {
        "name": "busybox"
      },
      "spec": {
        "containers": [
          {
            "name": "busybox",
            "image": image
          }
        ]
      }
    }
  }
}
```

The main difference to the test is providing parameters on input as well.

## Handle duplicate rego code

Since opa doesn't support testing directly against Gatekeeper ConstraintTemplates, we must create
simple rego files to test. These simple rego files present duplicate code.

We could have a build process to extract the opa policy from the ConstraintTemplates and
automatically create simple rego files.

Fortunately, there's a tool to achieve code duplication by taking another direction.
[konstraint](https://github.com/plexsystems/konstraint)
takes simple rego files as its input and automatically generates ConstraintTemplates and sometimes
Constraints for us!

The next post will cover using konstraint.

Update: [Open Policy Agent: Konstraint]({{< ref "open-policy-agent-konstraint" >}}) has been posted.

{{< convertkit >}}
