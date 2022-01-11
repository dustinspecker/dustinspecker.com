---
title: "Spin up a Ubuntu VM using Pulumi and libvirt"
images:
  - images/ubuntu-vm-pulumi-libvirt/ubuntu-vm-pulumi-libvirt.png
date: 2022-01-17T12:00:00Z
lastmod: 2022-01-17T12:00:00Z
draft: false
categories:
  - development
tags:
  - pulumi
  - libvirt
  - IaC
---

[Pulumi](https://www.pulumi.com/) is an Infrastructure as Code (IAC) tool that supports using
Go, .Net, Python, and TypeScript/JavaScript. [Libvirt](https://libvirt.org/) is a tool for managing virtual machines (VM).
Typically, teams use Pulumi with different cloud providers, but we can leverage libvirt to
manage virtual machines on bare-metal servers, perfect for a homelab.

We'll go through the steps of setting up libvirt and Pulumi to run against our local machine
to create a VM running Ubuntu 20.04. This post caters to folks that have never used libvirt or
Pulumi.

I'm running this on Ubuntu 21.10 x64. We'll use Pulumi v3.22.1 with the Go SDK and Go v1.17.6.

## Install libvirt

First, install libvirt via:

```bash
sudo apt install qemu-kvm libvirt-daemon-system
```

This will create a systemd service and automatically start running libvirt.

By default, our regular user can't interact with libvirt without running as root.
Fortunately, we can add ourselves to the `libvirt` group.

```bash
sudo adduser $USER libvirt
```

You'll need to log out and back in for this to take effect.

Then verify the user can interact with libvirt by running:

```bash
virsh list
```

and you should see the following output:

```
 Id   Name   State
--------------------
```

This command shows us the list of domains running.

Libvirt calls virtual machines domains. I'll be using these terms interchangeably throughout this post.

## Install Pulumi

Install Pulumi v3.22.1 for Linux x64 by running the following commands, which will download, extract, and move
the required binaries to `/usr/local/bin/`.

```bash
cd ~
wget https://get.pulumi.com/releases/sdk/pulumi-v3.22.1-linux-x64.tar.gz
tar \
  --extract \
  --file pulumi-v3.22.1-linux-x64.tar.gz \
  --gzip
sudo mv ~/pulumi/pulumi /usr/local/bin/
sudo mv ~/pulumi/pulumi-language-go /usr/local/bin/
```

This will move the `pulumi` and `pulumi-language-go` binaries to `/usr/local/bin` to make them
available in our `$PATH`.

```bash
pulumi version
```

should output:

```
v3.22.1
```

Since we're using Go in this post, we've only copied the `pulumi-language-go` binary. For other
languages, copy the respective language binaries.

## Setup Pulumi project and Dev Stack

Now that we've installed libvirt and Pulumi, we can begin creating our Pulumi project.

Create and navigate to a new directory at `~/pulumi-libvirt-ubuntu` by running:

```bash
mkdir ~/pulumi-libvirt-ubuntu
cd ~/pulumi-libvirt-ubuntu
```

Before we can begin using Pulumi we need to specify a backend to save our infrastructure state.
[Pulumi supports multiple backends](https://www.pulumi.com/docs/intro/concepts/state/) such as
S3 and their own hosted service. For convenience, we'll use our
[local filesystem](https://www.pulumi.com/docs/intro/concepts/state/#logging-into-the-local-filesystem-backend)
to store our state.

Let's create a directory to hold our project's state and then log in using the newly created
directory:

```bash
mkdir ~/pulumi-libvirt-ubuntu-state
pulumi login file://~/pulumi-libvirt-ubuntu-state
```

> NOTE: `pulumi login` supports a `--local` option, defaulting to using `~/` to save
> state. This causes issues when dealing with multiple Pulumi projects because they'll start
> sharing state. So better to create separate directories for each project.

Let's create a new Pulumi project setup for Go via:

```bash
pulumi new go \
  --description "Creates a Ubuntu 20.04 VM via libvirt" \
  --name pulumi-libvirt-ubuntu \
  --stack dev
```

After running this, Pulumi will prompt asking for a passphrase for our `dev` stack. Provide one,
re-enter it, and enter
it again to finish setting up the Pulumi project and our `dev` stack.

> Note: you can think of a stack as an environment. Later, we'll learn how to create another stack
> such as `prod`.

The above command scaffolds out a Pulumi project that looks like this:

```
.
├── go.mod
├── go.sum
├── main.go
├── Pulumi.dev.yaml
└── Pulumi.yaml
```

- `go.mod` and `go.sum` are created for us with dependencies needed by Pulumi.
- `main.go` contains
  our actual code for creating our infrastructure, which we'll be focused on in this post.
- `Pulumi.yaml` is info about the Project such as name, description, and the runtime (go in this case).
- `Pulumi.dev.yaml` is configuration for our `dev` stack. You can think of a stack as an environment.
  So we can eventually deploy our VM to our dev stack, and we could create a new stack named `prod`.

## Create a VM

We'll need to install the [Pulumi libvirt provider](https://github.com/pulumi/pulumi-libvirt)
before creating VMs.

To install this provider, run:

```bash
go get github.com/pulumi/pulumi-libvirt/sdk@v0.2.1
```

Update `main.go` to look like:

```go
package main

import (
	"github.com/pulumi/pulumi-libvirt/sdk/go/libvirt"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		// create a provider, this isn't required, but will make it easier to configure
		// a libvirt_uri, which we'll discuss in a bit
		provider, err := libvirt.NewProvider(ctx, "provider", &libvirt.ProviderArgs{})
		if err != nil {
			return err
		}

		// create a VM that has a name starting with ubuntu
		_, err = libvirt.NewDomain(ctx, "ubuntu", &libvirt.DomainArgs{}, pulumi.Provider(provider))
		if err != nil {
			return err
		}

		return nil
	})
}
```

Create an environment variable named `PULUMI_CONFIG_PASSPHRASE`, so the Pulumi CLI can
decrypt our stack by running:

```bash
export PULUMI_CONFIG_PASSPHRASE=password
```

where `password` is the passphrase used when creating the `dev` stack.

Next, run the following command to create our domain:

```bash
pulumi up
```

Pulumi will install dependencies and then display a preview such as:

```
Previewing update (dev):
     Type                     Name                       Plan
 +   pulumi:pulumi:Stack      pulumi-libvirt-ubuntu-dev  create
 +   └─ libvirt:index:Domain  ubuntu                     create
```

Select "yes" to make the domain.

Afterward, Pulumi will output that it created two resources (the stack and the domain).

We can verify the libvirt VM exists by running:

```bash
virsh list
```

which will output

```
 Id   Name             State
--------------------------------
 1    ubuntu-0b14e16   running
```

The `ubuntu-0b14e16` VM isn't doing much for now. Let's work on creating a volume and giving our VM a filesystem.

## Create filesystem volume

We can install Ubuntu on our domain by creating a new volume from a Ubuntu ISO, and then creating another volume to act
as the actual filesystem for the VM to use based on the Ubuntu volume.

Modify `main.go` to create a storage pool for our volumes and two volumes:

```diff
 import (
 	"github.com/pulumi/pulumi-libvirt/sdk/go/libvirt"
 	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
 )

 func main() {
 	pulumi.Run(func(ctx *pulumi.Context) error {
 		// create a provider, this isn't required, but will make it easier to configure
 		// a libvirt_uri, which we'll discuss in a bit
 		provider, err := libvirt.NewProvider(ctx, "provider", &libvirt.ProviderArgs{})
 		if err != nil {
 			return err
 		}

+		// `pool` is a storage pool that can be used to create volumes
+		// the `dir` type uses a directory to manage files
+		// `Path` maps to a directory on the host filesystem, so we'll be able to
+		// volume contents in `/pool/cluster_storage/`
+		pool, err := libvirt.NewPool(ctx, "cluster", &libvirt.PoolArgs{
+			Type: pulumi.String("dir"),
+			Path: pulumi.String("/pool/cluster_storage"),
+		}, pulumi.Provider(provider))
+		if err != nil {
+			return err
+		}
+
+		// create a volume with the contents being a Ubuntu 20.04 server image
+		ubuntu, err := libvirt.NewVolume(ctx, "ubuntu", &libvirt.VolumeArgs{
+			Pool:   pool.Name,
+			Source: pulumi.String("https://cloud-images.ubuntu.com/releases/focal/release/ubuntu-20.04-server-cloudimg-amd64.img"),
+		}, pulumi.Provider(provider))
+		if err != nil {
+			return err
+		}
+
+		// create a filesystem volume for our VM
+		// This filesystem will be based on the `ubuntu` volume above
+		// we'll use a size of 10GB
+		filesystem, err := libvirt.NewVolume(ctx, "filesystem", &libvirt.VolumeArgs{
+			BaseVolumeId: ubuntu.ID(),
+			Pool:         pool.Name,
+			Size:         pulumi.Int(10000000000),
+		}, pulumi.Provider(provider))
+		if err != nil {
+			return err
+		}
+
		// create a VM that has a name starting with ubuntu
-		_, err = libvirt.NewDomain(ctx, "ubuntu", &libvirt.DomainArgs{}, pulumi.Provider(provider))
+		_, err = libvirt.NewDomain(ctx, "ubuntu", &libvirt.DomainArgs{
+			Disks: libvirt.DomainDiskArray{
+				libvirt.DomainDiskArgs{
+					VolumeId: filesystem.ID(),
+				},
+			},
+		}, pulumi.Provider(provider))
 		if err != nil {
 			return err
 		}

 		return nil
 	})
 }

```

Then run

```bash
pulumi up
```

Select yes after viewing the preview. Pulumi will create a storage pool, download the Ubuntu image, and then hit a `Permission denied` error when attempting to use the image like:

```
error: error creating libvirt domain: internal error: process exited while connecting to monitor: 2022-01-12T01:36:34.005110Z qemu-system-x86_64: -blockdev {"driver":"file","filename":"/pool/cluster_storage/ubuntu-552ab14","node-name":"libvirt-2-storage","auto-read-only":true,"discard":"unmap"}: Could not open '/pool/cluster_storage/ubuntu-552ab14': Permission denied
```

## Fix libvirt permission errors

There are a few ways to handle this, but the easiest solution is disabling SELinux.

To disable SELinux, modify `/etc/libvirt/qemu.conf`:

```bash
sudo sed --in-place 's/#security_driver = "selinux"/security_driver = "none"/' /etc/libvirt/qemu.conf
```

Then restart libvirtd for this config change to take effect.

```bash
sudo systemctl restart libvirtd
```

And finally, re-try running:

```bash
pulumi up
```

It'll be successful this time. We can then run the following commands to see the impact on libvirt.

```bash
virsh list
```

will output a new domain:

```
Id   Name             State
--------------------------------
 2    ubuntu-e629e71   running
```

```bash
virsh pool-list
```

will show our storage pool:

```
 Name              State    Autostart
---------------------------------------
 cluster-1d3f78e   active   yes
```

and we can view our volumes by running:

```bash
virsh vol-list cluster-1d3f78e
```

will show our volumes in our pool:

```
 Name                 Path
----------------------------------------------------------------
 filesystem-103d88a   /pool/cluster_storage/filesystem-103d88a
 ubuntu-552ab14       /pool/cluster_storage/ubuntu-552ab14
```

So now we have a VM with Ubuntu 20.04 running, but we cannot interact with it just yet.

## Attach virtual console to VM

We can attach a virtual console to our VM so we can login from a terminal.

Modify `main.go` so the domain has a console attached like:

```diff
		// create a VM that has a name starting with ubuntu
 		_, err = libvirt.NewDomain(ctx, "ubuntu", &libvirt.DomainArgs{
+			Consoles: libvirt.DomainConsoleArray{
+				// enables using `virsh console ...`
+				libvirt.DomainConsoleArgs{
+					Type:       pulumi.String("pty"),
+					TargetPort: pulumi.String("0"),
+					TargetType: pulumi.String("serial"),
+				},
+			},
 			Disks: libvirt.DomainDiskArray{
 				libvirt.DomainDiskArgs{
 					VolumeId: filesystem.ID(),
 				},
 			},
-		}, pulumi.Provider(provider))
+			// delete existing VM before creating replacement to avoid two VMs trying to use the same volume
+		}, pulumi.Provider(provider), pulumi.ReplaceOnChanges([]string{"*"}), pulumi.DeleteBeforeReplace(true))
 		if err != nil {
 			return err
 		}
```

> Note: pay attention to the `ReplaceOnChanges` and `DeleteBeforeReplace` gotcha. Since only a single domain can use our volumes
> at once, we need to delete the existing domain before creating a new one.

Run `pulumi up` again to create a new VM.

Get the name of the VM from `virsh list`, and then we can access the VM by running:

```
virsh console ubuntu-3c69e6a
```

Press enter to be access a username and password prompt. Unfortunately, there isn't a default password for ubuntu, so we're
can't login, yet.

`virsh console ...` can be great for debugging issues such as `cloud-init`, which we'll do next.

> Note: to exit the console, hold `CTRL` and press `]`.

## Use cloud-init to setup ubuntu user

We can leverage [cloud-init](https://cloudinit.readthedocs.io/en/latest/) to create credentials for the ubuntu user, amongst
other things.

Create a new file named `cloud_init_user_data.yaml`.

```bash
touch ~/pulumi-libvirt-ubuntu/cloud_init_user_data.yaml
```

with the following content:

```yaml
#cloud-config
ssh_pwauth: True
chpasswd:
  list: |
    ubuntu:ubuntu
  expire: False
```

Now update `main.go` so that we create a cloud-init resource and initialize the VM with the cloud-init mounted.

```diff
+		cloud_init_user_data, err := os.ReadFile("./cloud_init_user_data.yaml")
+		if err != nil {
+			return err
+		}
+
+		// create a cloud init disk that will setup the ubuntu credentials
+		cloud_init, err := libvirt.NewCloudInitDisk(ctx, "cloud-init", &libvirt.CloudInitDiskArgs{
+			MetaData: pulumi.String(string(cloud_init_user_data)),
+			Pool:     pool.Name,
+			UserData: pulumi.String(string(cloud_init_user_data)),
+		}, pulumi.Provider(provider))
+		if err != nil {
+			return err
+		}
+
 		// create a VM that has a name starting with ubuntu
 		_, err = libvirt.NewDomain(ctx, "ubuntu", &libvirt.DomainArgs{
+			Cloudinit: cloud_init.ID(),
 			Consoles: libvirt.DomainConsoleArray{
 				// enables using `virsh console ...`
 				libvirt.DomainConsoleArgs{
 					Type:       pulumi.String("pty"),
 					TargetPort: pulumi.String("0"),
 					TargetType: pulumi.String("serial"),
 				},
 			},
 			Disks: libvirt.DomainDiskArray{
 				libvirt.DomainDiskArgs{
 					VolumeId: filesystem.ID(),
 				},
 			},
 			// delete existing VM before creating replacement to avoid two VMs trying to use the same volume
 		}, pulumi.Provider(provider), pulumi.ReplaceOnChanges([]string{"*"}), pulumi.DeleteBeforeReplace(true))
 		if err != nil {
 			return err
 		}
```

Run `pulumi up` again.

Now, get the name of the VM again with `virsh list` and execute `virsh console NAME_OF_VM`.

Press enter, and you can then log in with the `ubuntu` username and `ubuntu` password. You may need to wait a few minutes for cloud-init
to complete before these credentials are valid.

This is great, but most of the time we'll want to SSH instead. Let's get that working.

## Setup network so we can SSH into VM

Currently, our VM doesn't have an IP address that we can connect to for SSH. We'll need a libvirt network to attach our VM to and
configure our VM to get an IP address from libvirt's DHCP server automatically.

Create a new file named `cloud_init_network_config.yaml`

```bash
touch ~/pulumi-libvirt-ubuntu/cloud_init_network_config.yaml
```

with the following content:

```yaml
version: 2
ethernets:
  ens3:
    dhcp4: true
```

We'll add this to our cloud-init, so the VM will attempt to get an IP address assigned at boot up.

Update `main.go` to add this network config to cloud-init and create a libvirt network.

```diff
+		cloud_init_network_config, err := os.ReadFile("./cloud_init_network_config.yaml")
+		if err != nil {
+			return err
+		}
+
-		// create a cloud init disk that will setup the ubuntu credentials
+		// create a cloud init disk that will setup the ubuntu credentials and enable dhcp
 		cloud_init, err := libvirt.NewCloudInitDisk(ctx, "cloud-init", &libvirt.CloudInitDiskArgs{
 			MetaData:      pulumi.String(string(cloud_init_user_data)),
+			NetworkConfig: pulumi.String(string(cloud_init_network_config)),
 			Pool:          pool.Name,
 			UserData:      pulumi.String(string(cloud_init_user_data)),
 		}, pulumi.Provider(provider))
 		if err != nil {
 			return err
 		}

+		// create NAT network using 192.168.10/24 CIDR
+		network, err := libvirt.NewNetwork(ctx, "network", &libvirt.NetworkArgs{
+			Addresses: pulumi.StringArray{pulumi.String("192.168.10.0/24")},
+			Mode:      pulumi.String("nat"),
+		}, pulumi.Provider(provider))
+		if err != nil {
+			return err
+		}
+
 		// create a VM that has a name starting with ubuntu
 		_, err = libvirt.NewDomain(ctx, "ubuntu", &libvirt.DomainArgs{
 			Cloudinit: cloud_init.ID(),
 			Consoles: libvirt.DomainConsoleArray{
 				// enables using `virsh console ...`
 				libvirt.DomainConsoleArgs{
 					Type:       pulumi.String("pty"),
 					TargetPort: pulumi.String("0"),
 					TargetType: pulumi.String("serial"),
 				},
 			},
 			Disks: libvirt.DomainDiskArray{
 				libvirt.DomainDiskArgs{
 					VolumeId: filesystem.ID(),
 				},
 			},
+			NetworkInterfaces: libvirt.DomainNetworkInterfaceArray{
+				libvirt.DomainNetworkInterfaceArgs{
+					NetworkId:    network.ID(),
+					WaitForLease: pulumi.Bool(true),
+				},
+			},
 			// delete existing VM before creating replacement to avoid two VMs trying to use the same volume
 		}, pulumi.Provider(provider), pulumi.ReplaceOnChanges([]string{"*"}), pulumi.DeleteBeforeReplace(true))
 		if err != nil {
 			return err
 		}
```

Once again, run:

```bash
pulumi up
```

We can see a newly created network by running:

```bash
virsh net-list
```

which will output something similar to:

```
Name              State    Autostart   Persistent
----------------------------------------------------
 default           active   yes         yes
 network-171e7af   active   no          yes
```

To find the IP address of the VM, we can look at the leases by running:

```bash
virsh net-dhcp-leases network-171e7af
```

to see

```
 Expiry Time           MAC address         Protocol   IP address         Hostname         Client ID or DUID
----------------------------------------------------------------------------------------------------------------------------------------------------
 2022-01-11 21:40:37   52:54:00:ca:f2:e4   ipv4       192.168.10.52/24   ubuntu-af93b6f   ff:b5:5e:67:ff:00:02:00:00:ab:11:f3:04:a5:1b:1a:65:18:76
```

We can finally SSH by running:

```bash
ssh ubuntu@192.168.10.52
```

and logging in with the `ubuntu` password again.

> Note: This network is uses NAT, so it will only be reachable from the host that libvirt is running by default.

## Add Pulumi outputs

Throughout this post, we've had to use `virsh` to find the VM name and IP address, but we can actually use
[Pulumi Outputs](https://www.pulumi.com/docs/intro/concepts/inputs-outputs/). Pulumi will then automatically retrieve these values
and display them after provisioning resources.

We can define an `IP Address` and `VM Name` output by modifying `main.go` again:

```diff
 		// create a VM that has a name starting with ubuntu
-		_, err = libvirt.NewDomain(ctx, "ubuntu", &libvirt.DomainArgs{
+		domain, err := libvirt.NewDomain(ctx, "ubuntu", &libvirt.DomainArgs{
 			Cloudinit: cloud_init.ID(),
 			Consoles: libvirt.DomainConsoleArray{
 				// enables using `virsh console ...`
 				libvirt.DomainConsoleArgs{
 					Type:       pulumi.String("pty"),
 					TargetPort: pulumi.String("0"),
 					TargetType: pulumi.String("serial"),
 				},
 			},
 			Disks: libvirt.DomainDiskArray{
 				libvirt.DomainDiskArgs{
 					VolumeId: filesystem.ID(),
 				},
 			},
 			NetworkInterfaces: libvirt.DomainNetworkInterfaceArray{
 				libvirt.DomainNetworkInterfaceArgs{
 					NetworkId:    network.ID(),
 					WaitForLease: pulumi.Bool(true),
 				},
 			},
 			// delete existing VM before creating replacement to avoid two VMs trying to use the same volume
 		}, pulumi.Provider(provider), pulumi.ReplaceOnChanges([]string{"*"}), pulumi.DeleteBeforeReplace(true))
 		if err != nil {
 			return err
 		}

+		ctx.Export("IP Address", domain.NetworkInterfaces.Index(pulumi.Int(0)).Addresses().Index(pulumi.Int(0)))
+		ctx.Export("VM name", domain.Name)
```

Run `pulumi up` again, and we'll now see the following output:

```
Outputs:
  + IP Address: "192.168.10.52"
  + VM name   : "ubuntu-af93b6f"
```

We can also retrieve these by running `pulumi stack output` to list all outputs. To get a specific output, run `pulumi stack output "IP Address"`, which can be usefull in shell scripts.

## Enable autostart

If we restart the computer, libvirt will not automatically start our network and domain. Fortunately, there's an option
to handle that.

Modify `main.go`:

```diff
 		// create NAT network using 192.168.10/24 CIDR
 		network, err := libvirt.NewNetwork(ctx, "network", &libvirt.NetworkArgs{
 			Addresses: pulumi.StringArray{pulumi.String("192.168.10.0/24")},
+			Autostart: pulumi.Bool(true),
 			Mode:      pulumi.String("nat"),
 		}, pulumi.Provider(provider))
 		if err != nil {
 			return err
 		}

 		// create a VM that has a name starting with ubuntu
 		domain, err := libvirt.NewDomain(ctx, "ubuntu", &libvirt.DomainArgs{
+			Autostart: pulumi.Bool(true),
 			Cloudinit: cloud_init.ID(),
 			Consoles: libvirt.DomainConsoleArray{
 				// enables using `virsh console ...`
 				libvirt.DomainConsoleArgs{
 					Type:       pulumi.String("pty"),
 					TargetPort: pulumi.String("0"),
 					TargetType: pulumi.String("serial"),
 				},
 			},
 			Disks: libvirt.DomainDiskArray{
 				libvirt.DomainDiskArgs{
 					VolumeId: filesystem.ID(),
 				},
 			},
 			NetworkInterfaces: libvirt.DomainNetworkInterfaceArray{
 				libvirt.DomainNetworkInterfaceArgs{
 					NetworkId:    network.ID(),
 					WaitForLease: pulumi.Bool(true),
 				},
 			},
 			// delete existing VM before creating replacement to avoid two VMs trying to use the same volume
 		}, pulumi.Provider(provider), pulumi.ReplaceOnChanges([]string{"*"}), pulumi.DeleteBeforeReplace(true))
 		if err != nil {
 			return err
 		}
```

Run `pulumi up` again to create a new network and domain that will autostart on reboot.

## Use Pulumi provider and config to support multiple stacks

So far, our `main.go` works great to create a VM on the same machine we're running Pulumi. This is nice for a dev environment, but
what about a staging or production environment where we want to run Pulumi against a remote libvirt instance?

By default, the libvirt provider uses a libvirt URI found in the `LIBVIRT_DEFAULT_URI` environment variable. If that isn't
defined, then it assumes `qemu:///system` for the libvirt URI.

Try it out by running `virsh --connect qemu:///system list` to see the same output as `virsh list`.

We could know to specify a `LIBVIRT_DEFAULT_URI` each time we run Pulumi, or we could leverage configuring a libvirt provider, so each environment will provide its own libvirt URI.

Install the Pulumi config package by running:

```bash
go get github.com/pulumi/pulumi/sdk/v3/go/pulumi/config@v3.19.0
```

and add as an import in `main.go`:

```diff
 import (
 	"os"

 	"github.com/pulumi/pulumi-libvirt/sdk/go/libvirt"
 	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
+	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
 )
```

Modify `main.go` to require `libvirt_uri` to be defined by the stack and pass the value to the provider:

```diff
+		conf := config.New(ctx, "")
+
+		// require each stack to specify a libvirt_uri
+		libvirt_uri := conf.Require("libvirt_uri")
+
 		// create a provider, this isn't required, but will make it easier to configure
 		// a libvirt_uri, which we'll discuss in a bit
-		provider, err := libvirt.NewProvider(ctx, "provider", &libvirt.ProviderArgs{})
+		provider, err := libvirt.NewProvider(ctx, "provider", &libvirt.ProviderArgs{
+			Uri: pulumi.String(libvirt_uri),
+		})
 		if err != nil {
 			return err
 		}
```

Now run `pulumi up` and we'll see the following error message:

```
panic: fatal: A failure has occurred: missing required configuration variable 'pulumi-libvirt-ubuntu:libvirt_uri'; run `pulumi config` to set
```

To define `libvirt_uri` for our `dev` stack, run:

```bash
pulumi config set libvirt_uri qemu:///system
```

> Note: this will also update `Pulumi.dev.yaml`.

and now `pulumi up` will run successfully.

If we wanted to create a production stack, for example, we could run the following commands:

```
pulumi stack init prod
pulumi config set libvirt_uri qemu://PROD_IP_ADDRESS/system
pulumi up
```

> Note: you can switch to another stack by running `pulumi stack select dev`.

And then, we can use the same code for different environments!

---

I hope you enjoyed learning about libvirt and Pulumi. I'm pretty happy to take advantage of Infrastructure as Code tooling
for my homelab. Have some advice on Pulumi? Let me know on [Twitter](https://twitter.com/dustinspecker),
[LinkedIn](https://www.linkedin.com/in/dustin-specker/), or [GitHub](https://github.com/dustinspecker).

{{< convertkit >}}
