---
title: "Lessons Learned Implementing CI"
images:
  - images/logos/lessons-learned-implementing-ci.png
date: 2021-01-16T12:00:00Z
lastmod: 2021-01-16T12:00:00Z
draft: false
categories:
  - development
tags:
  - continuous integration
---

I've helped several teams create and support their Continuous Integration (CI) processes. My approach to CI has changed over the years as I've learned from mistakes and incidents.

I hope these lessons help you prevent making the same mistakes I have.

## 1. Keep CI config files slim

The less configuration and code that only exists in files such as `.travis.yml` and `.github/workflows/main.yaml`, the better.

Instead, prefer to have these type of files invoke scripts that exist in the repository. An advantage to this is that local development and CI can use the same scripts.
Have you ever relied on scripts to set up a project to have them unexpectedly run into an error someday? Since CI uses the same scripts, we can catch issues with changes
that break setup scripts.

This process also allows testing changes to these kinds of scripts locally. While there are solutions that enable running `.travis.yml` and GitHub actions locally, they
don't have 100% of the features supported by the real thing. We want to eliminate any surprises that pop up in CI that don't happen locally.

## 2. Avoid prompting for authentication credentials

I've been on a few teams where we have scripts that ask for your user id, password, etc. These scripts are clunky and often include logic to behave differently
on CI than on local development. We want to minimize the differences between CI and local development as much as possible.

Environment variables are an improvement here. The scripts should validate the environment variables and print a helpful error message to the user when they are
missing.

An alternative to environment variables is configuration files. I'm a fan of [dotenv](https://github.com/motdotla/dotenv)-like solutions.
Local developers can create a file during the onboarding of the project and then forget about it. I prefer this technique as it's easy to forget to set environment variables at some point.

Both of these techniques are easily used by CI as well. Either define the required environment variables or create the configuration file as needed.

## 3. Avoid using root and sudo

The more a CI process can work adequately as a non-root user, the better. Typically, as a non-root user, I have less chance of mucking with the system and breaking another project
a developer may be working on.

Having some scripts require root, while other scripts don't will confuse developers at some point. In my experience, root and sudo usage can also cause many file permission
problems as folks try to use root and sudo to overcome issues. Next thing you know, developers have a mix of files they own, and files root own in their source code.

## 4. Install executable/binary dependencies local to the project

One of the most common reasons for needing root is installing the tools required for a project. If possible, instead prefer to install those tools local to the project. I'm a huge fan of installing
programs to `./bin` (relative to the project's root directory). This practice enables scripts to install without elevated privileges and allows developers to have multiple versions of the same tool on their systems.

Scripts within the project will use `./bin/executable` instead of `executable`, but this trade-off is worth it. CI and local development can use the same install scripts, ensuring local
development and CI use identical versions.

Another alternative to this is leveraging Docker images with the desired executable.

## 5. Lock dependencies

This tip is the one I get the most pushback on. Avoiding surprise package upgrades is my #1 goal with CI processes. The
amount of time I've spent tracking down what changed overnight with dependencies is too much. By locking all dependencies, we will have to upgrade dependencies manually. This part is where the pushback typically
comes. A lot of folks enjoy using the newest packages. Unfortunately, breaking changes can show up. No one wants to be handling this kind of issue while preparing for a significant release.

Package managers such as npm and poetry have been embracing lock files for a while. Don't go out of your way to ignore these lock files.

A couple of other dependencies I watch out for are Git references and Docker images. Most people know to avoid using the `latest` Docker images, but I like to go a step further and avoid all tags.
A project owner can update a tag with an accidental breaking change. I prefer always to use Docker image digests.

If I see a tool such as `kustomize` reference a resource via Git, I like to
use a Git commit over a tag or branch. Branches can change easily, and while tags typically do not change, nothing stops a tag from being deleted and re-created, pointing at a
different Git commit.

If we lock dependencies, we will not be surprised when a new version introduces breaking changes because we'll still be using the locked version. When we are ready to upgrade a dependency, we have a nice commit
in version control that shows the lock changing from one version to another. That same commit may also include any code changes required to handle a breaking change. This commit makes an easy code review
and great commit history to look back on later.

Speaking of commit history, if our project uses the latest version of dependencies, then debugging when bugs came into the project is even more challenging. By locking down dependencies, tools such as `git bisect`
are super helpful because we know every version of every dependency at each commit. `git bisect`'s value diminishes when dependencies aren't locked. Commits that passed all tests in the past can
suddenly fail because of changes in dependencies.

## 6. Enable painless documentation changes

Not every CI process is 100% perfect. Issues such as flaky tests or even flaky network connections can come up. While we're trying to add new code changes, it may be
okay to retrigger CI a few times in hopes of it passing.

This is a poor experience for someone trying to improve documentation. Documentation changes should be easy reviews, and we want to encourage people to improve and add documentation.

If a CI process
is flaky, consider skipping parts of CI on documentation only changes. Do end-to-end tests need to run if a `readme.md` file is updated? Hopefully not. Someone trying to make a small documentation
change may not have the patience to retrigger CI a few times and ultimately abandon the change entirely.

---

Do you have any lessons learned you'd add to this list? Let me know on [Twitter](https://twitter.com/dustinspecker) or [LinkedIn](https://linkedin.com/in/dustin-specker).

{{< convertkit >}}
