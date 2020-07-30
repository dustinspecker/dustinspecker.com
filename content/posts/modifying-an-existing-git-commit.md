---
title: "Modifying an Existing Git Commit"
images:
  - images/dustinspecker.jpg
date: 2020-05-16T12:43:18Z
lastmod: 2020-05-16T12:43:18Z
draft: false
categories:
  - development
tags:
  - git
---

In previous posts we covered
[creating smaller commits]({{< ref "making-smaller-git-commits" >}}) and
[splitting an existing commit]({{< ref "splitting-existing-git-commit" >}}). In
practice there are cases where it is helpful to modify an existing commit.
This can range from wanting to improve a commit message to adding additional
code changes like fixes or tests. This typically happens while working on a branch
implementing a new feature.

We'll cover four common scenarios where we'd like to modify the:

1. commit message of the most recent commit (`HEAD`)
1. commit changes of the most recent commit (`HEAD`)
1. commit message of a commit further back in our history than the `HEAD` commit
1. commit changes of a commit further back in our history than the `HEAD` commit

## setup

To follow along, clone a Git repository I've created for this by running:

```bash
git clone https://github.com/dustinspecker/git-reset-demo.git ~/git-reset-demo
cd ~/git-reset-demo
```

This is the same repository that was used in
[Splitting an Existing Git Commit]({{< ref "splitting-existing-git-commit" >}}),
and it will work for this post as well.

## modifying HEAD commit

There have been several times where I've created a new commit and immediately
realized I forgot to add a new file or I found a typo in the commit message.
Fortunately Git has our back.

Before changing anything, we can view the current `HEAD` commit message by running:

```bash
git log HEAD \
  --max-count 1
```

which will output the following text:

```
commit d1836f1d837c3b55ee7a5e33ea082fcd1eb39c1e (HEAD -> master, origin/master, origin/HEAD)
Author: Dustin Specker <DustinSpecker@DustinSpecker.com>
Date:   Wed Apr 22 07:11:00 2020 -0500

    add section
```

If we only need to modify the commit message of the `HEAD` commit we can run:

```bash
git commit --amend
```

Git will then open an editor with the current commit message of the `HEAD` commit. At
this point you're free to make any changes to the commit message. Once you've
closed the editor the `HEAD`'s commit message will then be updated with the new
changes.

Another nice feature of using the `--amend` flag is that Git will add anything
currently in the stage to the commit being amended. So if you want to add another
file with `git add FILE_NAME` or add some changes with `git add --patch` you can do
so and then execute `git commit --amend`. You'll have the opportunity to edit the
commit message, but more importantly changes from the stage will be amended to the
`HEAD` commit after saving the commit message.

Sometimes we know we only want to add a file or add a change, so we don't need
to change the commit message at all. In those cases we can run:

```bash
git commit --amend --no-edit
```

When running this all of the same behavior described above will happen, except Git
will not open an editor to adjust the commit message. The commit message will
automatically be taken as it was.

After modifying the `HEAD` commit re-run:

```bash
git log HEAD \
  --max-count 1
```

Take note of the differences with this output and the previous output we got above.
Our commit message is different (if it was changed), the date changed, and more importantly
the commit's SHA has changed. This is important to note as our previous commit with the SHA
of `d1836f1d837c3b55ee7a5e33ea082fcd1eb39c1e` is no longer in our history of where we're
checked out. But the commit with this SHA still exists in our Git repository. If you're happy
with this change you would need to run `git push --force` to update the remote branch.

If a mistake is made and you'd like to go back to the previous commit, you may run:

```bash
git reset --hard d1836f1d837c3b55ee7a5e33ea082fcd1eb39c1e
```

Since we're doing all of our work on the `master` branch, our local `master` branch will
now be back to its previous state as if we didn't change anything.

> Be careful with `git reset --hard`. This command will delete any non-committed changes
> to tracked files.

## rewording an older commit message

Rewording an older commit isn't too bad. We'll use `git rebase --interactive` to
accomplish this.

If following along with the [git-reset-demo](https://github.com/dustinspecker/git-reset-demo)
repository, please run the following to clean up any changes:

```bash
git reset --hard origin/master
```

This will result in our local `master` branch matching the history of `origin/master`.
Before continuing, let's take a quick look at what we're working with by running:

```bash
git log --oneline
```

which will output:

```
d1836f1 (HEAD -> master, origin/master, origin/HEAD) add section
602d1dc specify THE cool project
c7b88e3 add readme.md
```

The top commit in this list is the most recent commit, while the bottom commit is the
oldest commit. We're going to modify the commit message of the `602d1dc` commit. Start
by running:

```bash
git rebase --interactive 602d1dc^
```

> Note: this is telling Git to rebase the current history up to AND including the
> `602d1dc` commit.

which will open an editor with the following content:

```
pick 602d1dc specify THE cool project
pick d1836f1 add section
```

> Note: the order of commits listed is the opposite as displayed by `git log`.

By default interactive rebase assumes we want to pick (keep) all of these commits as they
are. In this case we want to reword a single commit's message. So we can change the
"pick" action of the `602d1dc` commit to "reword" or "r" for short like:

```
reword 602d1dc specify THE cool project
pick d1836f1 add section
```

After changing the action and saving the list, Git will open an editor with the
existing commit message of the `602d1dc` commit. At this time we are able to adjust
the commit message to our liking. We'll change it to `specify the cool project`. After saving
and exiting the editor Git will continue rebasing the remaining commits (only `d1836f1` in this
case).

If we run:

```bash
git log --oneline
```

we'll then see some output similar to:

```
9eb2bc0 (HEAD -> master) add section
acbe11a specify the cool project
c7b88e3 add readme.md
```

Notice how the SHAs of our top two commits have changed. Also, our local `master` branch
and `origin/master` branch are no longer referencing the same commit. We would need to
execute `git push --force` to update `origin/master` with our changes.

## modifying an older commmit

Modifying a commit older than the `HEAD` commit is a bit trickier. My preferred way
of doing this is creating a new commit with the changes I want to combine with an older
commit. Then use `git rebase --interactive` to combine this new commit with
the commit I want to modify.

If following along with the [git-reset-demo](https://github.com/dustinspecker/git-reset-demo)
repository, please run the following to clean up any changes:

```bash
git reset --hard origin/master
```

This will reset your local `master` branch to match the `origin/master` branch. Run

```bash
git log --oneline
```

to get a quick overview again. We'll get the following output:

```
d1836f1 (HEAD -> master, origin/master, origin/HEAD) add section
602d1dc specify THE cool project
c7b88e3 add readme.md
```

Now for this scenario we want add more content to the `602d1dc` commit. If we look at
that commit's diff by running:

```bash
git diff 602d1dc^!
```

we'll see the diff of the `602d1dc` commit:

```diff
diff --git a/readme.md b/readme.md
index eb479cf..944f6ba 100644
--- a/readme.md
+++ b/readme.md
@@ -1,4 +1,4 @@
-# cool project
+# the cool project

 here's how to use the cool project
```

In that commit we added the word `the`. But now on second thought we've decided `the`
needs more emphasis, so we want to bold `the`. So, let's make a new commit adding emphasis to `the`.
Afterwards we'll combine the two commits.

In the `readme.md` file change `the` to `*the*`. Then run the following to create a new commit:

```bash
git add readme.md
git commit --message 'add emphasis to the'
```

Run `git log --oneline` again to see the following output:

```
957e1c3 (HEAD -> master) add emphasis to the
d1836f1 (origin/master, origin/HEAD) add section
602d1dc specify THE cool project
c7b88e3 add readme.md
```

The top commit's SHA will be different for you, but the rest will be the same. Now we want to
combine the top commit (`957e1c3` in my case) with the `602d1dc` commit. Just like with rewording
an old commit, we can use `git rebase` to combine commits. Execute:

```
git rebase --interactive 602d1dc^
```

and Git will open an editor with content similar to:

```
pick 602d1dc specify THE cool project
pick d1836f1 add section
pick 957e1c3 add emphasis to the
```

As a reminder, in this list the top is the "oldest" commit in the history and the bottom commit
is the "newest" commit in our history. We'll want to take the bottom commit (our
newly created commit) and move it to be under the `602d1dc` commit. So the list will
look like:

```
pick 602d1dc specify THE cool project
pick 957e1c3 add emphasis to the
pick d1836f1 add section
```

By default interactive rebase assumes we want to only pick all of these commits
as is. So far we've changed the order in which to pick the commits. If we
were to save this list and close our editor Git would rearrange the commits
in our history. This is close, but what we want is to combine our new commit
with the `602d1dc` commit.

We have two choices on how to combine commits,
squash and fixup. These are similar to using `git commit`'s `--no-edit` flag. Squash
will have Git combine the two commits and open an editor to modify the commit
message. Git will display both commits' messages and will leave it up to the
user to create a single message for the amended commit. Alternatively, fixup will
combine the two commits and use the top ("older") commit's commit message automatically
for the amended commit.

So decide on which to use and change the "pick" to "squash" or
"fixup". I'm going to choose "fixup," so my list looks like:

```
pick 602d1dc specify THE cool project
fixup 957e1c3 add emphasis to the
pick d1836f1 add section
```

Afterwards save and exit the editor. If you chose squash, then
you'll be prompted to create a commit message. Afterwards Git will bring us back
to our terminal. If you view the Git history (`git log --oneline`) you'll see that
our commit we created is now gone. My Git history now looks like:

```
3200347 (HEAD -> master) add section
d9ec4e8 specify THE cool project
c7b88e3 add readme.md
```

And if we look at the diff of the second commit by running:

```
git diff d9ec4e8^!
```

> Note: your commit SHA will be different

then we'll see the following diff:

```diff
diff --git a/readme.md b/readme.md
index eb479cf..b0b8aad 100644
--- a/readme.md
+++ b/readme.md
@@ -1,4 +1,4 @@
-# cool project
+# *the* cool project

 here's how to use the cool project
```

So now we've updated an existing commit by combining two commits to create an
entirely new commit.

## quality of life improvements

Before we were creating a new commit, having to remember which commit it amended,
modify the action from pick to squash or fixup, and reorder the rebase list all
manually. This is such a common operation that Git has some nice quality of life
features to automate a lot of this.

For starters, when we are creating our new commit before running `git rebase --interactive` we can use `git commit --fixup COMMIT_REF_TO_AMEND` or `git commit --squash COMMIT_REF_TO_AMEND`. These commands will take what is currently staged and create a
commit with a commit message prefixed with `fixup!` or `squash!`, respectively.
After this prefix will be the rest of the `COMMIT_REF_TO_AMEND`'s commit message.
This makes it easier to remember which commit we want to fixup or squash to.

So earlier when we could have ran:

```bash
git add readme.md
git commit --fixup 602d1dc
```

And running `git log --oneline` will show:

```
a1235ff (HEAD -> master) fixup! specify THE cool project
d1836f1 (origin/master, origin/HEAD) add section
602d1dc specify THE cool project
c7b88e3 add readme.md
```

Now when we run `git rebase --interactive` we'll see the commits with the `fixup!` or
`squash!` prefix. We'll still manually have to reorder the rebase list and change
the action to be squash or fixup, but once again Git enables automating reordering
this list and updating the action. This can be enabled by running:

```bash
git config --global rebase.autosquash true
```

Now, if we use `git commit --fixup REF` or `git commit --squash REF` and then
run `git rebase --interactive`, we'll automatically be presented with a list
in our editor like:

```
pick 602d1dc specify THE cool project
fixup a1235ff fixup! specify THE cool project
pick d1836f1 add section
```

# amending multiple commits at once

Throughout this post we've only amended a single commit, but performing a fixup
or squash through `git rebase --interactive` can handle more than one commit at
a time. Create a few commits using `git commit --fixup REF` or `git commit --squash REF` and run `git rebase --interactive`. Git will handle it flawlessly.
While creating fixup/squash commits, you can even create more commits that fixup
or squash to our existing fixup/squash commits and Git will handle that just fine,
too.

{{< convertkit >}}
