---
title: "Making Smaller Git Commits"
images:
  - images/dustinspecker.jpg
date: 2020-04-21T23:27:42Z
lastmod: 2020-04-21T23:27:42Z
draft: false
categories:
  - development
tags:
  - git
---

There are lots of great articles on the benefits of making smaller Git commits
such as being easier to review, identify sources of bugs later with `git bisect`,
and resolve merge conflicts. These articles seem to skim over on the _how_ to
make smaller commits.

When first learning Git a lot of folks start with using `git add .` to add all
files for their commit. Some continue to learn about `git add . -u` (or
`git add . --update`) and how to add individual files with `git add FILE_NAME`.
These commands _can_ be used to create small commits, but require a lot of
discipline or a lot of manual work in an editor to fine-tune what's committed.

## stage and working directory

Before understanding how to make smaller commits it helps to have an understanding
of Git's stage and working directory.

Let's create a new repository via:

```bash
mkdir ~/cool-project
cd ~/cool-project
git init
```

Now we have a brand new Git repository in the `~/cool-project` directory. Let's
make this interesting and create a new file named `readme.md` with the following
content:

```markdown
# cool project

here's how to use the cool project

here's some awesome info about how cool the cool project is

some cool companies that use this cool project

1. cool project users
2. we use cool projects
3. cool projects only
```

At this point if we run `git status` we'll see output similar to:

```
On branch master

No commits yet

Untracked files:
  (use "git add <file>..." to include in what will be committed)
        readme.md

nothing added to commit but untracked files present (use "git add" to track)
```

Currently we have the `readme.md` file in our working directory and it's untracked.
Untracked means Git has no prior record of this file. It's aware this file exists
in our working directory, but that's it.

If we then run `git add readme.md` and then again run `git status`, we'll see
output like:

```
On branch master

No commits yet

Changes to be committed:
  (use "git rm --cached <file>..." to unstage)
        new file:   readme.md
```

Files under the "Changes to be committed:" header are now staged. Anything
in the stage would be part of a commit if we were to run `git commit`. Speaking of stage,
sometimes you'll see Git's stage referred to as its index. Stage and index are the
same thing.

Let's go ahead and commit the `readme.md` file by running:

```bash
git commit --message 'add readme.md'
```

Running `git status` again will show us the following output:

```
On branch master
nothing to commit, working tree clean
```

Looking at this, Git is informing us there are no pending changes. Let's make a
change to the `readme.md` by adding "the" to our title. So now the `readme.md`
looks like:

```markdown
# the cool project

here's how to use the cool project

here's some awesome info about how cool the cool project is

some cool companies that use this cool project

1. cool project users
2. we use cool projects
3. cool projects only
```

Let's run `git status` again and we'll see the following output:

```
On branch master
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
        modified:   readme.md

no changes added to commit (use "git add" and/or "git commit -a")
```

Git is now informing us it has detected changes to our `readme.md` file. This
time it knows we're modifying `readme.md` because it has history about
`readme.md` and Git is tracking `readme.me`.

We'll go ahead and add this change and commit via:

```bash
git add readme.md
git commit --message 'specify THE cool project'
```

So to summarize, Git's stage is anything added via `git add`, while everything
else is the working directory.

While `git add FILE` is great for committing entire file changes, sometimes
we want to only commit some changes to a file.

## git add \-\-patch

Fortunately, Git's add command has a really helpful argument named `--patch` or
`-p` for short. Using this argument causes `git add` to walk you through
unstaged changes interactively enabling adding changes line by line (really hunk
by hunk) in files!

Let's make a couple of changes to the readme.md. Running `git diff readme.md` shows:

```diff
diff --git a/readme.md b/readme.md
index eb479cf..8f04cb2 100644
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

We've added a new section on why to use this cool project and we've changed our
numbered list to a bulleted list. We could use `git add readme.me`, commit, and
call it a day. But we've really done two standalone changes, so this could be
two commits to help folks review it easier.

Let's work on creating the first commit with the new section added to the
`readme.me`. Run `git add --patch` or `git add -p`.

```diff
diff --git a/readme.md b/readme.md
index eb479cf..8f04cb2 100644
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
Stage this hunk [y,n,q,a,d,s,e,?]?
```

You'll see output matching the above output of `git diff readme.md` with a
prompt at the end asking what we want to do. This is a hunk. This is currently
a single hunk, but if our file was larger there could be multiple hunks. And if
we had multiple files with changes then each of these file changes have hunks. `git add --patch` will walk us through each tracked file with changes.

The prompt gives us a lot of control over what to do next. The prompt asks "Stage
this hunk?" and we can do the following:

- y - add the entire hunk to our stage and move on to the next hunk
- n - skip adding this hunk to our stage and move on to the next hunk
- q - don't add this hunk and skip any remaining hunks to examine
- a - add this hunk as well as any other hunk in this file and then move on to
  the next file with hunks to examine
- d - skip adding this hunk and skip all other hunks in this file and then move on
  to the next file with hunks to examine
- s - split this hunk
- e - edit this hunk in an editor
- ? - prints help output explaining all of these prompt options

In this case we want to enter s for split since our hunk has two standalone
changes. After selecting split we'll get updated output looking like:

```diff
Split into 2 hunks.
@@ -1,7 +1,9 @@
 # the cool project

+why use this cool project
+
 here's how to use the cool project

 here's some awesome info about how cool the cool project is

 some cool companies that use this cool project
Stage this hunk [y,n,q,a,d,j,J,g,/,e,?]?
```

Git tells us it has split our hunk into 2. This hunk only has our new additional
section. Our prompt also has some new options. These additional options appear
whenever there is more than one hunk to examine in the file. We originally had one,
but then we split that hunk into two. These new options do the following:

- j - leave this hunk undecided and go to the next undecided hunk
- J - leave this hunk undecided and go the the next hunk
- g - displays a numbered list of hunks and selecting a number skips to that hunk
- / - use regex to search for a hunk and go to the first matching hunk

In my experience these are less used options. `g` and `/` come in handy for when
you have a large file with lots of changes and you know content of a single
hunk you want to stage. `j` and `J` are subtly different. `j` says skip this hunk
(but come back to it at the end) and move on the the next undecided (non-skipped)
hunk. `J` also says skip this hunk (but come back to it at the end). `J` then
goes to the next hunk even if that hunk was previously marked allowing you to
redecide.

Anyways, after selecting split enter yes. The output displayed will then be:

```diff
@@ -3,8 +5,8 @@
 here's how to use the cool project

 here's some awesome info about how cool the cool project is

 some cool companies that use this cool project
-1. cool project users
-2. we use cool projects
-3. cool projects only
+- cool project users
+- we use cool projects
+- cool projects only
Stage this hunk [y,n,q,a,d,K,g,/,e,?]?
```

Notice the prompt options went back to the original list as there is now only one
hunk left. We'll select no this time. `git add --patch` will then exit and
bring you back to your terminal.

Now if we run `git status` we'll see output similar to:

```
On branch master
Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
        modified:   readme.md

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
        modified:   readme.md
```

Git shows `readme.md` in both the stage and working directory. This is because
we've staged a part of `readme.md`, while leaving the rest in the working directory.

`git diff` is great for reviewing what's changed in our working directory. If
you run `git diff` now you'll see the following:

```diff
diff --git a/readme.md b/readme.md
index 236cd77..8f04cb2 100644
--- a/readme.md
+++ b/readme.md
@@ -7,6 +7,6 @@ here's how to use the cool project
 here's some awesome info about how cool the cool project is

 some cool companies that use this cool project
-1. cool project users
-2. we use cool projects
-3. cool projects only
+- cool project users
+- we use cool projects
+- cool projects only
```

`git diff` only shows us changes to the working directory. `git diff` doesn't
show changes that are staged. To view those changes we can use `git diff --staged`
and see the following output:

```diff
diff --git a/readme.md b/readme.md
index eb479cf..236cd77 100644
--- a/readme.md
+++ b/readme.md
@@ -1,5 +1,7 @@
 # the cool project

+why use this cool project
+
 here's how to use the cool project

 here's some awesome info about how cool the cool project is
```

Let's go ahead and commit what we've staged via:

```bash
git commit --message "add why use this project section"
```

A new commit will be created. If we once again run `git status`, the output will
look like:

```
On branch master
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
        modified:   readme.md

no changes added to commit (use "git add" and/or "git commit -a")
```

At this point we can use `git add --patch` and add the remaining hunk or
simply use `git add readme.me`. I tend to recommend always using `git add --patch`
because it lets me review what I'm going to stage before doing so. Afterwards
run `git commit` and make a new commit.

We've now made two small, standalone commits.

{{< convertkit >}}
