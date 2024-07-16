---
title: "{{ replace .Name "-" " " | title }}"
images:
  - images/logos/{{ .Name }}.png
date: {{ dateFormat "2006-01-02" .Date }}T12:00:00Z
lastmod: {{ dateFormat "2006-01-02" .Date }}T12:00:00Z
draft: true
categories:
  - development
tags:
---

{{< convertkit >}}
