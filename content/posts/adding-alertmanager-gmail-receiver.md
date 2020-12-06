---
title: "Adding an AlertManager Gmail Receiver"
images:
  - images/dustinspecker.jpg
date: 2020-04-26T17:01:24Z
lastmod: 2020-12-06T12:00:00Z
draft: false
categories:
  - development
tags:
  - prometheus
  - argo
  - kubernetes
---

In a previous [post]({{< ref "adding-a-prometheus-rule-for-argo.md" >}}), we added a
PrometheusRule for Argo that caused an alert to fire when an Argo Workflow failed.
We were able to see the alert fire in AlertManager. AlertManager is another component
of Prometheus responsible for sending notifications for when an alert is firing.

AlertManager has a number of integrations for sending notifications. AlertManager
calls these integrations receivers and the
[Prometheus documentation on receivers](https://prometheus.io/docs/alerting/configuration/#receiver)
has a lot of great information on the configuration of receivers.

> Update (December 06, 2020)
>
> - Fix `alertmanager-main`'s `alertmanager.yaml` syntax

## Creating a Gmail receiver

One of the receivers AlertManager supports is email, so we'll create an AlertManager
configuration to send an email to a Gmail account when our WorkflowFailures alert we created
previously is firing.

We'll continue from where we left off in
[Adding a Prometheus Rule for Argo]({{< ref "adding-a-prometheus-rule-for-argo.md" >}}).

First, we'll need to update the AlertManager's configuration. Start by making a file located at
`~/alertmanager-main-secret.yaml` with the following content:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: alertmanager-main
  namespace: monitoring
type: Opaque
stringData:
  alertmanager.yaml: |
    receivers:
      - name: none
      - name: gmail
        email_configs:
          - send_resolved: true
            to: GMAIL_USERNAME@gmail.com
            from: GMAIL_USERNAME@gmail.com
            smarthost: smtp.gmail.com:587
            auth_username: GMAIL_USERNAME@gmail.com
            auth_identity: GMAIL_USERNAME@gmail.com
            auth_password: GMAIL_PASSWORD
    route:
      group_by:
        - job
      receiver: none
      routes:
        - match:
            namespace: argo
          receiver: gmail
```

In the above YAML replace `GMAIL_USERNAME` with your actual Gmail username. For the
`GMAIL_PASSWORD`, you can either use your real Gmail password or create an App Password. I
recommend following
[Google's documentation](https://support.google.com/accounts/answer/185833?hl=en) on how
to create an App Password. A nice convenience with App Passwords is the ability to revoke
an App Password without requiring changing the password for all devices/Google logins. Great
for demos like this and great for making throwaway passwords that you don't need to remember.

In the above YAML we are defining two receivers, none and gmail. None is a receiver that does
nothing. gmail is a receiver that will send an email based on the `email_config`. We also
specify `send_resolved` so that we receive an email once a firing alert is no longer firing.
We created the none receiver so we can have a default receiver for all alerts. The `route`
section is used by AlertManager to decide which alerts need to be sent to which receivers. We
define the none receiver as the default receiver. If any route provided in `routes` is matched
then the default receiver will not be used. We define a route that uses a `match`. `match` looks
at the labels on an alert. If the labels are a match then that route is used. In this case
our route matches any alert created with the namespace label matching argo. This route uses
the gmail receiver.

There are other configuration options as described in
[Prometheus' Documentation](https://prometheus.io/docs/alerting/configuration/). Some of
the noteworthy configuration options are `resolve_timeout`, `group_wait`, and
`group_interval`. These all revolve around when to send alerts to receivers. The defaults
suffice for this post.

After creating the above YAML file we can then apply it to the Kubernetes cluster via:

```bash
~/kubectl apply \
  --filename ~/alertmanager-main-secret.yaml
```

Like other changes to the Kubernetes Cluster for Prometheus, this can take a few minutes to
apply. I like to run the following command:

```bash
~/kubectl logs alertmanager-main-0 config-reloader \
  --follow \
  --namespace monitoring
```

and once this output logs that the config map has successfully been reloaded we're good to go.

## Firing an alert

As of now we don't have any alerts firing, but we can reuse our `~/workflow-fail.yaml` from
the [previous post]({{< ref "adding-a-prometheus-rule-for-argo" >}}). We can submit this failing
Argo Workflow by running:

```bash
~/argo submit ~/workflow-fail.yaml \
  --namespace argo \
  --watch
```

Afterwards we'll want to browse AlertManager. Run the following command:

```bash
~/kubectl port-forward service/alertmanager-main 9093 \
  --namespace monitoring
```

and navigate to [http://localhost:9093](http://localhost:9093). On the Alerts page, make sure
the "Filter" tab is selected. Click the "Receiver" label and click "gmail" from the dropdown.
This will then only show alerts being sent to our gmail receiver. In a few minutes your Gmail
account should get an email about this alert.

After receiving an email about the alert we can clean up the failing Argo Workflows by running:

```bash
~/argo delete \
  --all \
  --namespace argo
```

In a few minutes the WorkflowFailure alert should stop firing and the Gmail account should
receive another email stating the WorkflowFailure alert has been resolved.

{{< convertkit >}}
