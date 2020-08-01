---
title: "setuid: Elevating Privileges"
images:
  - images/dustinspecker.jpg
date: 2020-08-01T12:00:00Z
lastmod: 2020-08-01T12:00:00Z
draft: false
categories:
  - development
tags:
  - linux
  - go
  - security
---

Some executables need elevated privileges, but we don't always want to provide a user with root access. Fortunately, Linux and macOS support `setuid`.
`setuid` instructs the OS to run an executable as the owner of the executable instead of the current user.

Let's make an executable binary and demonstrate `setuid`'s usage to run a program as root without requiring the user to be root.

## create a Go binary

`setuid` only works on binaries, so unfortunately bash and python scripts can't leverage `setuid`. We can instead create a small Go program and compile a binary.

> Note: I'm using Go `1.14.6` in these examples.

Create a new file named `main.go` with the following content:

```go
package main

import (
	"fmt"
	"os"
)

func main() {
	file, err := os.Open("/etc/sudoers")
	defer file.Close()
	if err == nil {
		fmt.Println("Yay! You're running as root!")
	} else {
		fmt.Println(":( You're a regular user and got the following error:", err)
	}
}
```

This program will open `/etc/sudoers`, a file a regular user can't read. If a regular user runs this program they will get an error message, while the root user will be successful.

We can then create a binary named `main` by running:

```bash
go build main.go
```

At this point if we run:

```bash
./main
```

we'll get the following expected error message:

```
:( You're a regular user and got the following error: open /etc/sudoers: permission denied
```

A regular user can't access `/etc/sudoers`. If we then run:

```bash
sudo ./main
```

we'll get the desired output:

```
Yay! You're running as root!
```

At least we know it works as the root user, but we want to avoid using `sudo` when running `main`. Let's play with `setuid` now.

## use setuid to run an executable as root

First, take a look at the current file permissions of `main` by running:

```bash
ls -l ./main
```

We'll get the following output:

```
-rwxr-xr-x 1 dustin dustin 2072688 Jul 31 17:47 ./main
```

The file permissions on the left should be the same. The date will be different (_Hello future!_) and the username will be different (unless you're also named Dustin, then _Hey Dustin!_).

> Note: on macOS you'll see `staff` instead of `dustin` for the group name.

To take advantage of `setuid`, we need to change the owner of the file. Let's change the owner to `root` via:

```bash
sudo chown root ./main
```

And now for the magic, we use `chmod` to set the `setuid` bit on a file:

```bash
sudo chmod u+s ./main
```

If we run `ls -l ./main` again we'll see an `s` where an `x` used to be.

```
-rwsr-xr-x 1 root root 2072688 Jul 31 17:47 ./main
```

When this binary is run by any user the executable will actually be run as the owner of the file! Since root owns the file the executable will run as root.

Let's run `main` again:

```bash
./main
```

and we'll see:

```
Yay! You're running as root!
```

`setuid` is great for providing users a way to run processes that require root privileges without giving individual users root access.

> Note: this is how `sudo` works! `sudo` additionally checks `/etc/sudoers` to see what the real user may do before running the command
> given to `sudo`.

## future research

Like everything else dealing with technology, understanding `setuid` has created more questions:

- How does `setcap` work? `setcap` enables allowing particular Linux capabilities instead of all capabilities like the root user.
  - `setuid` and `setgid`, which revolves around the group instead of the user, both modify the file permissions. `setcap` doesn't seem to change file permissions.
- How does Kubernetes' `AllowPrivilegeEscalation` prevent `setuid`, `setgid`, and `setcap`?

Know the answer to one of the above questions or have more questions? Then please feel free to
reach out and let me know on [Twitter](https://twitter.com/dustinspecker), [LinkedIn](https://www.linkedin.com/in/dustin-specker/), or [GitHub](https://github.com/dustinspecker).

The source code for this Go application may be found in a [setuid-example Git repository](https://github.com/dustinspecker/setuid-example).

{{< convertkit >}}
