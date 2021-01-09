---
title: "3 Git Tips for Rebasing Quicker"
images:
  - images/three-git-tips-rebasing-quicker/three-git-tips-rebasing-quicker.png
date: 2021-01-09T12:00:00Z
lastmod: 2021-01-09T12:00:00Z
draft: false
categories:
  - development
tags:
  - git
  - rebase
---

Interactive rebase is the core of my Git process for creating a _neat history_ to aid code-reviews
and my future self with bisecting through history. I rebase so much that some aspects of Git become
tedious, but fortunately, Git has a few features and configuration options to help rebase quicker.

## 1. Create fixup commits

Rebase is excellent for combining small "fixup" commits with already created commits. Notice a typo
in a previous commit? Make a small commit that only fixes the typo. Then start an interactive rebase.
At this point, we have to adjust our commit list and change `pick` to `fixup` manually. This process can
be error-prone because we forget which commit a fixup commit applies to.

Fortunately, Git has a feature to make it clear which commit a fixup commit is for.

When we create our new fixup commit, instead of creating a commit like normal, do:

```bash
git commit --fixup REF_OF_COMMIT_WE_WANT_TO_FIXUP_TO
```

This command will create a commit like normal, but Git will create a commit message automatically. The
message will look something like this:

```
fixup! fix(routing): handle HEAD requests
```

Git takes the message of the targeted commit and prefixes it with `fixup!`.

Also, Git has similar support for squashing instead of fixup by using:

```bash
git commit --squash REF_OF_COMMIT_WE_WANT_TO_SQUASH_INTO
```

This command will do the same thing, but use a prefix of `squash!`.

This tip saves us a bit of thinking about a commit message for a fixup commit and helps remind us
which commit a fixup commit applies.

## 2. Enable autosquash

So we just learned about `git commit --fixup REF`, and we start using it. During interactive rebases,
it's clear to us which commits we need to apply fixup commits to.

When we run `git rebase --interactive`, we see a list like this:

```
pick a06d62e feat(archetype): set date/lastmod to noon
pick 7e6c747 feat: add 3 git tips for rebasing quicker post
pick 011c102 fixup! feat(archetype): set date/lastmod to noon
```

It becomes a little too manual
rearranging the commit list and changing `pick` to `fixup`. Once again, Git has a feature named autosquash that automatically
reorders a commit list for interactive rebase.

We can enable autosquash by running:

```bash
git config --global rebase.autosquash true
```

Now when we start an interactive rebase, Git orders our commit list and marks fixup commits as `fixup` instead of `pick`.
For example, when starting an interactive rebase, we'll be presented with:

```
pick a06d62e feat(archetype): set date/lastmod to noon
fixup 011c102 fixup! feat(archetype): set date/lastmod to noon
pick 7e6c747 feat: add 3 git tips for rebasing quicker post
```

Often I'm able to save the commit list as-is at this point to apply fixup commits.

The same happens with squash commits, except those actions are `squash`.

## 3. Enable autostash

I like fixing up previous commits while I'm thinking about it. Sometimes I'm in the middle of
other work, such as adding a new feature or fixing a bug, and I'm not ready to commit that work just yet.

If I start by creating a fixup commit to address a typo and perform a rebase to take care of it,
I'll get an error message stating:

```
error: cannot rebase: You have unstaged changes.
error: Please commit or stash them.
```

Now I'm thrown off my train of thought. My rebase process needs to be stash if I have any
unstaged tracked changes, then rebase, then apply the stash if I stashed anything.

Git has another trick, and it can automate this process, too, so we don't have to think about it.
We can enable autostashing by running:

```bash
git config --global rebase.autostash true
```

Now when I go to rebase while having unstaged changes, we'll see Git print the following:

```
Created autostash: f0394e2
Applied autostash.
Successfully rebased and updated refs/heads/main.
```

Git handles stashing before rebasing and applying the stash after rebasing!

---

Know any other Git tips for quickly rebasing? Let me know on [Twitter](https://twitter.com/dustinspecker)
or [LinkedIn](https://www.linkedin.com/in/dustin-specker/).

{{< convertkit >}}
