---
title: "Splitting an Existing Git Commit"
date: 2020-04-22T12:15:13Z
lastmod: 2020-04-22T12:15:13Z
draft: false
categories:
  - development
tags:
  - git
---
In a previous post we went through how to
[make smaller git commits]({{< ref "making-smaller-git-commits" >}}).
Sometimes during code review or development we find a commit that would
be easier to understand if it was split into multiple commits. We can use
what was discussed in the previous post combined with Git's `reset` command
to split an existing commit.

## intro to git reset
For this post we'll be using reset like `git reset HEAD^`. This command means reset
history until `HEAD^`, which means remove the `HEAD` commit. The `reset` command
takes optional arguments on *how* to reset the commit. There are three main
strategies of reset to focus on. Assuming these are done with `git reset HEAD^`
the strategies of reset and what they do are as follows:

- soft - remove the `HEAD` commit from our current history and move this commit's
changes to the stage
- mixed - remove the `HEAD` commit from our current history and move this commit's
changes to the working directory
- hard - remove the `HEAD` commit from our current history and discard the commit's
changes entirely

The default strategy of reset is `mixed`.

## using git reset

Let's start with a Git repository similar to what we used in the
[making smaller git commits]({{< ref "making-smaller-git-commits" >}}) by
by running the following commands:

```bash
git clone https://github.com/dustinspecker/git-reset-demo.git ~/git-reset-demo
cd ~/git-reset-demo
```

We can get a quick glance of this repository by looking at its Git logs with:

```bash
git log --oneline
```

and we'll see:

```
d1836f1 (HEAD -> master, origin/master) add section
602d1dc specify THE cool project
c7b88e3 add readme.md
```

If we run `git diff HEAD^!` we'll see the changes from the HEAD commit with the
following output:

```diff
index 944f6ba..4c20a58 100644
--- a/readme.md
+++ b/readme.md
@@ -1,10 +1,12 @@
 # the cool project

+why use this cool project
+
 here's how to use the cool project

 here's some awesome info about how cool the cool project is

 some cool companies that use this cool project
-1. cool project users
-2. we use cool projects
-3. cool projects only
+- cool project users
+- we use cool projects
+- cool projects only
```

These are the same changes we created into two commits in the previous post, but
this time they are in the same commit! Now we want to split this commit into
two.

First let's get `HEAD`'s changes into our working directory by running:

```bash
git reset HEAD^
```

Let's look at the output of `git status`:

```
On branch master
Your branch is behind 'origin/master' by 1 commit, and can be fast-forwarded.
  (use "git pull" to update your local branch)

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
        modified:   readme.md

no changes added to commit (use "git add" and/or "git commit -a")
```

As informed by Git we now have changes to our working directory as the mixed
strategy was used by default for our `git reset HEAD^` command above.

If you'd like you may run `git diff` and see it's the same diff as above. If
we look at the Git logs again with:

```bash
git log --oneline
```

we'll then see the following output:

```
602d1dc (HEAD -> master) specify THE cool project
c7b88e3 add readme.md
```

Our commit with the message of "add section" is now gone from our local history,
but its changes are in our working directory according to `git status`.

Now we can use what we learned previously to add these hunks interactively. Run

```bash
git add --patch
```

Select the split option by entering s. Accept the first hunk with y, and skip
the second hunk with n. Afterwards run

```bash
git diff --staged
```

and the output should look like:

```diff
diff --git a/readme.md b/readme.md
index 944f6ba..2f8b7dc 100644
--- a/readme.md
+++ b/readme.md
@@ -1,5 +1,7 @@
 # the cool project

+why use this cool project
+
 here's how to use the cool project

 here's some awesome info about how cool the cool project is
```

At this point we're ready to commit like we did in the past post. We could run
`git commit` like normal and enter a commit message, but we already had a
perfectly good commit message in the commit we removed. Fortunately, Git updates
a reference named `ORIG_HEAD` whenever `git reset` is ran.

This `ORIG_HEAD` points to the commit where we were checked out when we ran
`git reset`. You might be thinking `git reset` deleted the commit, but it
really just removed it from the local history of where we're working. The
commit still exists in the Git repository.

Back to committing. We can use this `ORIG_HEAD` reference to avoid retyping our
perfect commit message. We can run the following:

```bash
git commit --reedit-message ORIG_HEAD
# -c can also be used instead of --reedit-message
```

Git will open our editor with our previous commit message! At this point we are
welcome to modify the commit message or keep it as is. Once we've closed our
editor a new commit will be created.

Above we used `git commit --reedit-message ORIG_HEAD`. This is great when
you want to review or modify the original commit message. If you already
know you want to use the original commit message as is Git has another
argument to help out:

```bash
git commit --reuse-message ORIG_HEAD
# -C can also be used instead of --reuse-message
```

This time Git will not open your editor, but instead immediately create a new
commit using the exact message from `ORIG_HEAD`.

After creating this first commit, we can then create the second commit by
running `git add --patch` again. Accept the only remaining hunk. Now
a new commit may be created like normal with `git commit -m 'change list to
numbered'`.

## gotcha with splitting commits

Splitting commits "rewrites" history, so this should be used with caution. If
developing on a branch that has previously been pushed then `git push` will fail.
Git will detect that the branch history doesn't align and is not a simple matter of
adding new commits to the remote branch. Instead we'll need to run
`git push --force`. This is something to be cautious of when working on a
branch that is shared with other developers. You'll usually only want to
split commits from a development branch and never a branch like `master` or
`release`.
