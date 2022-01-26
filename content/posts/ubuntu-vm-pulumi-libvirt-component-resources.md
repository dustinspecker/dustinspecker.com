---
title: "Spin up a Ubuntu VM using Pulumi and libvirt: Component Resources Edition"
images:
  - images/ubuntu-vm-pulumi-libvirt-component-resources/ubuntu-vm-pulumi-libvirt-component-resources.png
date: 2022-01-25T12:00:00Z
lastmod: 2022-01-25T12:00:00Z
draft: false
categories:
  - development
series:
  - Pulumi and libvirt
tags:
  - pulumi
  - libvirt
  - IaC
---

Previously, I discussed how to [Spin up a Ubuntu VM using Pulumi and libvirt]({{< ref "ubuntu-vm-pulumi-libvirt" >}}). By the end,
we had a fully working VM that we could SSH into with provided credentials for the Ubuntu user. But how could we begin to make this
usable by others?

Pulumi supports a concept called [Component Resources](https://www.pulumi.com/docs/intro/concepts/resources/components/), which
is perfect for creating shareable components.

This post
continues from the previous one and walks through how to migrate our existing `main.go` to use Component Resources. Then we'll explore
the advantages of component resources over a language's built-in module capabilities.

> Note: If you'd like to see the finished code, view the [pulumi-libvirt-ubuntu-component-example](https://github.com/dustinspecker/pulumi-libvirt-ubuntu-component-resources-example).

## Configure the default libvirt provider

At the end of the last blog post, our `main.go` looked like this:

```go
package main

import (
	"os"

	"github.com/pulumi/pulumi-libvirt/sdk/go/libvirt"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		conf := config.New(ctx, "")

		// require each stack to specify a libvirt_uri
		libvirt_uri := conf.Require("libvirt_uri")
		// create a provider, this isn't required, but will make it easier to configure
		// a libvirt_uri, which we'll discuss in a bit
		provider, err := libvirt.NewProvider(ctx, "provider", &libvirt.ProviderArgs{
			Uri: pulumi.String(libvirt_uri),
		})
		if err != nil {
			return err
		}

		// `pool` is a storage pool that can be used to create volumes
		// the `dir` type uses a directory to manage files
		// `Path` maps to a directory on the host filesystem, so we'll be able to
		// volume contents in `/pool/cluster_storage/`
		pool, err := libvirt.NewPool(ctx, "cluster", &libvirt.PoolArgs{
			Type: pulumi.String("dir"),
			Path: pulumi.String("/pool/cluster_storage"),
		}, pulumi.Provider(provider))
		if err != nil {
			return err
		}

		// create a volume with the contents being a Ubuntu 20.04 server image
		ubuntu, err := libvirt.NewVolume(ctx, "ubuntu", &libvirt.VolumeArgs{
			Pool:   pool.Name,
			Source: pulumi.String("https://cloud-images.ubuntu.com/releases/focal/release/ubuntu-20.04-server-cloudimg-amd64.img"),
		}, pulumi.Provider(provider))
		if err != nil {
			return err
		}

		// create a filesystem volume for our VM
		// This filesystem will be based on the `ubuntu` volume above
		// we'll use a size of 10GB
		filesystem, err := libvirt.NewVolume(ctx, "filesystem", &libvirt.VolumeArgs{
			BaseVolumeId: ubuntu.ID(),
			Pool:         pool.Name,
			Size:         pulumi.Int(10000000000),
		}, pulumi.Provider(provider))
		if err != nil {
			return err
		}

		cloud_init_user_data, err := os.ReadFile("./cloud_init_user_data.yaml")
		if err != nil {
			return err
		}

		cloud_init_network_config, err := os.ReadFile("./cloud_init_network_config.yaml")
		if err != nil {
			return err
		}

		// create a cloud init disk that will setup the ubuntu credentials
		cloud_init, err := libvirt.NewCloudInitDisk(ctx, "cloud-init", &libvirt.CloudInitDiskArgs{
			MetaData:      pulumi.String(string(cloud_init_user_data)),
			NetworkConfig: pulumi.String(string(cloud_init_network_config)),
			Pool:          pool.Name,
			UserData:      pulumi.String(string(cloud_init_user_data)),
		}, pulumi.Provider(provider))
		if err != nil {
			return err
		}

		// create NAT network using 192.168.10/24 CIDR
		network, err := libvirt.NewNetwork(ctx, "network", &libvirt.NetworkArgs{
			Addresses: pulumi.StringArray{pulumi.String("192.168.10.0/24")},
			Autostart: pulumi.Bool(true),
			Mode:      pulumi.String("nat"),
		}, pulumi.Provider(provider))
		if err != nil {
			return err
		}

		// create a VM that has a name starting with ubuntu
		domain, err := libvirt.NewDomain(ctx, "ubuntu", &libvirt.DomainArgs{
			Autostart: pulumi.Bool(true),
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

		ctx.Export("IP Address", domain.NetworkInterfaces.Index(pulumi.Int(0)).Addresses().Index(pulumi.Int(0)))
		ctx.Export("VM name", domain.Name)

		return nil
	})
}
```

We created a provider to configure the libvirt URI, and we passed the provider to each resource. It turns out we don't need
to make a new provider after all. We can instead configure the default libvirt provider.

We'll want to make the following changes to `main.go`:

- remove requiring `libvirt_uri` to be configured
- remove creating a libvirt provider
- remove passing the provider to each resource
- configure pool and network to be deleted before replacing to handle changes to these resources

Modify `main.go` like:

```diff
 package main

 import (
 	"os"

 	"github.com/pulumi/pulumi-libvirt/sdk/go/libvirt"
 	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
-	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
 )

 func main() {
 	pulumi.Run(func(ctx *pulumi.Context) error {
-		conf := config.New(ctx, "")
-
-		// require each stack to specify a libvirt_uri
-		libvirt_uri := conf.Require("libvirt_uri")
-		// create a provider, this isn't required, but will make it easier to configure
-		// a libvirt_uri, which we'll discuss in a bit
-		provider, err := libvirt.NewProvider(ctx, "provider", &libvirt.ProviderArgs{
-			Uri: pulumi.String(libvirt_uri),
-		})
-		if err != nil {
-			return err
-		}
-
 		// `pool` is a storage pool that can be used to create volumes
 		// the `dir` type uses a directory to manage files
 		// `Path` maps to a directory on the host filesystem, so we'll be able to
 		// volume contents in `/pool/cluster_storage/`
 		pool, err := libvirt.NewPool(ctx, "cluster", &libvirt.PoolArgs{
 			Type: pulumi.String("dir"),
 			Path: pulumi.String("/pool/cluster_storage"),
-		}, pulumi.Provider(provider))
+		}, pulumi.DeleteBeforeReplace(true))
 		if err != nil {
 			return err
 		}

 		// create a volume with the contents being a Ubuntu 20.04 server image
 		ubuntu, err := libvirt.NewVolume(ctx, "ubuntu", &libvirt.VolumeArgs{
 			Pool:   pool.Name,
 			Source: pulumi.String("https://cloud-images.ubuntu.com/releases/focal/release/ubuntu-20.04-server-cloudimg-amd64.img"),
-		}, pulumi.Provider(provider))
+		})
 		if err != nil {
 			return err
 		}

 		// create a filesystem volume for our VM
 		// This filesystem will be based on the `ubuntu` volume above
 		// we'll use a size of 10GB
 		filesystem, err := libvirt.NewVolume(ctx, "filesystem", &libvirt.VolumeArgs{
 			BaseVolumeId: ubuntu.ID(),
 			Pool:         pool.Name,
 			Size:         pulumi.Int(10000000000),
-		}, pulumi.Provider(provider))
+		})
 		if err != nil {
 			return err
 		}

 		cloud_init_user_data, err := os.ReadFile("./cloud_init_user_data.yaml")
 		if err != nil {
 			return err
 		}

 		cloud_init_network_config, err := os.ReadFile("./cloud_init_network_config.yaml")
 		if err != nil {
 			return err
 		}

 		// create a cloud init disk that will setup the ubuntu credentials
 		cloud_init, err := libvirt.NewCloudInitDisk(ctx, "cloud-init", &libvirt.CloudInitDiskArgs{
 			MetaData:      pulumi.String(string(cloud_init_user_data)),
 			NetworkConfig: pulumi.String(string(cloud_init_network_config)),
 			Pool:          pool.Name,
 			UserData:      pulumi.String(string(cloud_init_user_data)),
-		}, pulumi.Provider(provider))
+		})
 		if err != nil {
 			return err
 		}

 		// create NAT network using 192.168.10/24 CIDR
 		network, err := libvirt.NewNetwork(ctx, "network", &libvirt.NetworkArgs{
 			Addresses: pulumi.StringArray{pulumi.String("192.168.10.0/24")},
 			Autostart: pulumi.Bool(true),
 			Mode:      pulumi.String("nat"),
-		}, pulumi.Provider(provider))
+		}, pulumi.DeleteBeforeReplace(true))
 		if err != nil {
 			return err
 		}

 		// create a VM that has a name starting with ubuntu
 		domain, err := libvirt.NewDomain(ctx, "ubuntu", &libvirt.DomainArgs{
 			Autostart: pulumi.Bool(true),
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
-		}, pulumi.Provider(provider), pulumi.ReplaceOnChanges([]string{"*"}), pulumi.DeleteBeforeReplace(true))
+		}, pulumi.ReplaceOnChanges([]string{"*"}), pulumi.DeleteBeforeReplace(true))

 		ctx.Export("IP Address", domain.NetworkInterfaces.Index(pulumi.Int(0)).Addresses().Index(pulumi.Int(0)))
 		ctx.Export("VM name", domain.Name)

 		return nil
 	})
 }
```

Clean up the existing `libvirt_uri` config by running:

```bash
pulumi config rm libvirt_uri
```

To configure the default libvirt provider's URI, run:

```bash
pulumi config set libvirt:uri qemu:///system
```

Run `pulumi up` to recreate our resources with the default libvirt provider.

## Create a VM module

Now, let's start making our code re-usable by others. We'll start this by just using Go and nothing fancy with Pulumi.

Our `VM` module will do the following:

- create a filesystem unique to the VM based on a provided image volume ID in a given storage pool
- create a domain using the filesystem and provided cloud-init volume ID and network ID

Later, we'll investigate creating another component to create the storage pool, image volume, and network.

Let's create a `VM` package by running:

```bash
mkdir -p pkg/vm/
touch pkg/vm/vm.go
```

And make the file contents of `pkg/vm/vm.go` be:

```go
package vm

import (
	"fmt"

	"github.com/pulumi/pulumi-libvirt/sdk/go/libvirt"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func NewVM(ctx *pulumi.Context, name string, poolName pulumi.StringOutput, baseDiskID pulumi.IDOutput, cloudInitDiskID pulumi.IDOutput, networkID pulumi.IDOutput, opts ...pulumi.ResourceOption) (map[string]pulumi.StringOutput, error) {
	// return info about the newly created VM
	outputs := make(map[string]pulumi.StringOutput)

	// create a filesystem volume for our VM
	// This filesystem will be based on the `ubuntu` volume above
	// we'll use a size of 10GB
	filesystem, err := libvirt.NewVolume(ctx, fmt.Sprintf("%s-filesystem", name), &libvirt.VolumeArgs{
		BaseVolumeId: baseDiskID,
		Pool:         poolName,
		Size:         pulumi.Int(10000000000),
	})
	if err != nil {
		return outputs, err
	}

	// create a VM that has a name starting with ubuntu
	domain, err := libvirt.NewDomain(ctx, fmt.Sprintf("%s-domain", name), &libvirt.DomainArgs{
		Autostart: pulumi.Bool(true),
		Cloudinit: cloudInitDiskID,
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
				NetworkId:    networkID,
				WaitForLease: pulumi.Bool(true),
			},
		},
		// delete existing VM before creating replacement to avoid two VMs trying to use the same volume
	}, pulumi.ReplaceOnChanges([]string{"*"}), pulumi.DeleteBeforeReplace(true))

	outputs["IP Address"] = domain.NetworkInterfaces.Index(pulumi.Int(0)).Addresses().Index(pulumi.Int(0))
	outputs["VM name"] = domain.Name

	return outputs, nil
}
```

Our `NewVM` function requires a few args and then returns a map about the newly created VM. We can then use this
in our `main.go` to export outputs for the stack.

We've created a plain ol' Go module that others can consume. Let's update our `main.go` to use it.

```diff
 package main

 import (
 	"os"

+	"pulumi-libvirt-ubuntu/pkg/vm"
+
 	"github.com/pulumi/pulumi-libvirt/sdk/go/libvirt"
 	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
 )

 func main() {
 	pulumi.Run(func(ctx *pulumi.Context) error {
 		// `pool` is a storage pool that can be used to create volumes
 		// the `dir` type uses a directory to manage files
 		// `Path` maps to a directory on the host filesystem, so we'll be able to
 		// volume contents in `/pool/cluster_storage/`
 		pool, err := libvirt.NewPool(ctx, "cluster", &libvirt.PoolArgs{
 			Type: pulumi.String("dir"),
 			Path: pulumi.String("/pool/cluster_storage"),
 		}, pulumi.DeleteBeforeReplace(true))
 		if err != nil {
 			return err
 		}

 		// create a volume with the contents being a Ubuntu 20.04 server image
 		ubuntu, err := libvirt.NewVolume(ctx, "ubuntu", &libvirt.VolumeArgs{
 			Pool:   pool.Name,
 			Source: pulumi.String("https://cloud-images.ubuntu.com/releases/focal/release/ubuntu-20.04-server-cloudimg-amd64.img"),
 		})
 		if err != nil {
 			return err
 		}
-
-		// create a filesystem volume for our VM
-		// This filesystem will be based on the `ubuntu` volume above
-		// we'll use a size of 10GB
-		filesystem, err := libvirt.NewVolume(ctx, "filesystem", &libvirt.VolumeArgs{
-			BaseVolumeId: ubuntu.ID(),
-			Pool:         pool.Name,
-			Size:         pulumi.Int(10000000000),
-		})
-		if err != nil {
-			return err
-		}

 		cloud_init_user_data, err := os.ReadFile("./cloud_init_user_data.yaml")
 		if err != nil {
 			return err
 		}

 		cloud_init_network_config, err := os.ReadFile("./cloud_init_network_config.yaml")
 		if err != nil {
 			return err
 		}

 		// create a cloud init disk that will setup the ubuntu credentials
 		cloud_init, err := libvirt.NewCloudInitDisk(ctx, "cloud-init", &libvirt.CloudInitDiskArgs{
 			MetaData:      pulumi.String(string(cloud_init_user_data)),
 			NetworkConfig: pulumi.String(string(cloud_init_network_config)),
 			Pool:          pool.Name,
 			UserData:      pulumi.String(string(cloud_init_user_data)),
 		})
 		if err != nil {
 			return err
 		}

 		// create NAT network using 192.168.10/24 CIDR
 		network, err := libvirt.NewNetwork(ctx, "network", &libvirt.NetworkArgs{
 			Addresses: pulumi.StringArray{pulumi.String("192.168.10.0/24")},
 			Autostart: pulumi.Bool(true),
 			Mode:      pulumi.String("nat"),
 		}, pulumi.DeleteBeforeReplace(true))
 		if err != nil {
 			return err
 		}

-		// create a VM that has a name starting with ubuntu
-		domain, err := libvirt.NewDomain(ctx, "ubuntu", &libvirt.DomainArgs{
-			Autostart: pulumi.Bool(true),
-			Cloudinit: cloud_init.ID(),
-			Consoles: libvirt.DomainConsoleArray{
-				// enables using `virsh console ...`
-				libvirt.DomainConsoleArgs{
-					Type:       pulumi.String("pty"),
-					TargetPort: pulumi.String("0"),
-					TargetType: pulumi.String("serial"),
-				},
-			},
-			Disks: libvirt.DomainDiskArray{
-				libvirt.DomainDiskArgs{
-					VolumeId: filesystem.ID(),
-				},
-			},
-			NetworkInterfaces: libvirt.DomainNetworkInterfaceArray{
-				libvirt.DomainNetworkInterfaceArgs{
-					NetworkId:    network.ID(),
-					WaitForLease: pulumi.Bool(true),
-				},
-			},
-			// delete existing VM before creating replacement to avoid two VMs trying to use the same volume
-		}, pulumi.ReplaceOnChanges([]string{"*"}), pulumi.DeleteBeforeReplace(true))
-
-		ctx.Export("IP Address", domain.NetworkInterfaces.Index(pulumi.Int(0)).Addresses().Index(pulumi.Int(0)))
-		ctx.Export("VM name", domain.Name)
+		vmOutputs, err := vm.NewVM(ctx, "ubuntu", pool.Name, ubuntu.ID(), cloud_init.ID(), network.ID())
+		if err != nil {
+			return err
+		}
+
+		ctx.Export("IP Address", vmOutputs["IP Address"])
+		ctx.Export("VM name", vmOutputs["VM name"])

 		return nil
 	})
 }
```

Run `pulumi up`, and it should successfully recreate the domain and filesystem volume since they have new names.

Let's refactor our `NewVM` function to use Pulumi's ComponentResource and discover the advantages.

## Convert to Component Resource

Now modify `pkg/vm/vm.go` to use the Component Resource pattern:

```diff
 package vm

 import (
 	"fmt"

 	"github.com/pulumi/pulumi-libvirt/sdk/go/libvirt"
 	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
 )

+type VM struct {
+	pulumi.ResourceState
+
+	Name pulumi.StringOutput `pulumi:"name"`
+	IP   pulumi.StringOutput `pulumi:"ip"`
+}
+
-func NewVM(ctx *pulumi.Context, name string, poolName pulumi.StringOutput, baseDiskID pulumi.IDOutput, cloudInitDiskID pulumi.IDOutput, networkID pulumi.IDOutput, opts ...pulumi.ResourceOption) (map[string]pulumi.StringOutput, error) {
+func NewVM(ctx *pulumi.Context, name string, poolName pulumi.StringOutput, baseDiskID pulumi.IDOutput, cloudInitDiskID pulumi.IDOutput, networkID pulumi.IDOutput, opts ...pulumi.ResourceOption) (*VM, error) {
-	// return info about the newly created VM
-	outputs := make(map[string]pulumi.StringOutput)
+	// new VM resource to create
+	var resource VM
+
+	// register the component
+	err := ctx.RegisterComponentResource("pulumi-libvirt-ubuntu:pkg/vm:vm", name, &resource, opts...)
+	if err != nil {
+		return nil, err
+	}

 	// create a filesystem volume for our VM
 	// This filesystem will be based on the `ubuntu` volume above
 	// we'll use a size of 10GB
 	filesystem, err := libvirt.NewVolume(ctx, fmt.Sprintf("%s-filesystem", name), &libvirt.VolumeArgs{
 		BaseVolumeId: baseDiskID,
 		Pool:         poolName,
 		Size:         pulumi.Int(10000000000),
-	})
+	}, pulumi.Parent(&resource))
 	if err != nil {
-		return outputs, err
+		return nil, err
 	}

 	// create a VM that has a name starting with ubuntu
 	domain, err := libvirt.NewDomain(ctx, fmt.Sprintf("%s-domain", name), &libvirt.DomainArgs{
 		Autostart: pulumi.Bool(true),
 		Cloudinit: cloudInitDiskID,
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
 				NetworkId:    networkID,
 				WaitForLease: pulumi.Bool(true),
 			},
 		},
 		// delete existing VM before creating replacement to avoid two VMs trying to use the same volume
-	}, pulumi.ReplaceOnChanges([]string{"*"}), pulumi.DeleteBeforeReplace(true))
+	}, pulumi.Parent(&resource), pulumi.ReplaceOnChanges([]string{"*"}), pulumi.DeleteBeforeReplace(true))

-	outputs["IP Address"] = domain.NetworkInterfaces.Index(pulumi.Int(0)).Addresses().Index(pulumi.Int(0))
-	outputs["VM name"] = domain.Name
-
-	return outputs, nil
+	resource.Name = domain.Name
+	resource.IP = domain.NetworkInterfaces.Index(pulumi.Int(0)).Addresses().Index(pulumi.Int(0))
+	ctx.RegisterResourceOutputs(&resource, pulumi.Map{
+		"ip":   domain.NetworkInterfaces.Index(pulumi.Int(0)).Addresses().Index(pulumi.Int(0)),
+		"name": domain.Name,
+	})
+
+	return &resource, err
 }
```

A few things to note in our refactor:

- create a VM struct
- register a Pulumi Component Resource
- mark `resource` as the parent of `filesystem` and `domain`
- register outputs for our Component Resource
- return a pointer to the VM resource instead of a map

Let's now update `main.go` to use our new Component Resource:

```diff
 package main

 import (
 	"os"

 	"pulumi-libvirt-ubuntu/pkg/vm"

 	"github.com/pulumi/pulumi-libvirt/sdk/go/libvirt"
 	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
 )

 func main() {
 	pulumi.Run(func(ctx *pulumi.Context) error {
 		// `pool` is a storage pool that can be used to create volumes
 		// the `dir` type uses a directory to manage files
 		// `Path` maps to a directory on the host filesystem, so we'll be able to
 		// volume contents in `/pool/cluster_storage/`
 		pool, err := libvirt.NewPool(ctx, "cluster", &libvirt.PoolArgs{
 			Type: pulumi.String("dir"),
 			Path: pulumi.String("/pool/cluster_storage"),
 		}, pulumi.DeleteBeforeReplace(true))
 		if err != nil {
 			return err
 		}

 		// create a volume with the contents being a Ubuntu 20.04 server image
 		ubuntu, err := libvirt.NewVolume(ctx, "ubuntu", &libvirt.VolumeArgs{
 			Pool:   pool.Name,
 			Source: pulumi.String("https://cloud-images.ubuntu.com/releases/focal/release/ubuntu-20.04-server-cloudimg-amd64.img"),
 		})
 		if err != nil {
 			return err
 		}

 		cloud_init_user_data, err := os.ReadFile("./cloud_init_user_data.yaml")
 		if err != nil {
 			return err
 		}

 		cloud_init_network_config, err := os.ReadFile("./cloud_init_network_config.yaml")
 		if err != nil {
 			return err
 		}

 		// create a cloud init disk that will setup the ubuntu credentials
 		cloud_init, err := libvirt.NewCloudInitDisk(ctx, "cloud-init", &libvirt.CloudInitDiskArgs{
 			MetaData:      pulumi.String(string(cloud_init_user_data)),
 			NetworkConfig: pulumi.String(string(cloud_init_network_config)),
 			Pool:          pool.Name,
 			UserData:      pulumi.String(string(cloud_init_user_data)),
 		})
 		if err != nil {
 			return err
 		}

 		// create NAT network using 192.168.10/24 CIDR
 		network, err := libvirt.NewNetwork(ctx, "network", &libvirt.NetworkArgs{
 			Addresses: pulumi.StringArray{pulumi.String("192.168.10.0/24")},
 			Autostart: pulumi.Bool(true),
 			Mode:      pulumi.String("nat"),
 		}, pulumi.DeleteBeforeReplace(true))
 		if err != nil {
 			return err
 		}

-		vmOutputs, err := vm.NewVM(ctx, "ubuntu", pool.Name, ubuntu.ID(), cloud_init.ID(), network.ID())
-		if err != nil {
-			return err
-		}
-
-		ctx.Export("IP Address", vmOutputs["IP Address"])
-		ctx.Export("VM name", vmOutputs["VM name"])
+		vm, err := vm.NewVM(ctx, "ubuntu", pool.Name, ubuntu.ID(), cloud_init.ID(), network.ID())
+		if err != nil {
+			return err
+		}
+
+		ctx.Export("IP Address", vm.IP)
+		ctx.Export("VM name", vm.Name)

 		return nil
 	})
 }
```

Our changes to `main.go` are pretty minor, just updating how we reference resource outputs.

Now, run `pulumi up`, and Pulumi will recreate the domain and filesystem. The UI will now show a logical grouping similar to:

```
Previewing update (dev):
     Type                             Name                       Plan
     pulumi:pulumi:Stack              pulumi-libvirt-ubuntu-dev
 +   ├─ pulumi-libvirt-ubuntu:pkg:vm  ubuntu                     create
 +   │  ├─ libvirt:index:Volume       ubuntu-filesystem          create
 +   │  └─ libvirt:index:Domain       ubuntu-domain              create
 -   ├─ libvirt:index:Domain          ubuntu-domain              delete
 -   └─ libvirt:index:Volume          ubuntu-filesystem          delete
```

This UI is a little easier to glance at but not a huge advantage to bring in a new pattern. Let's talk about a huge advantage.

## Why use a Component Resource?

By leveraging Pulumi's Component Resources, we can take advantage of [Resource Transformations](https://www.pulumi.com/docs/intro/concepts/resources/options/transformations/).

Let's say you're another team using our `VM` Component Resource. Our Component Resource doesn't support configuring the domain's memory.
Traditionally, the other team would have to add support by:

- creating a pull request to modify `NewVM` to support providing memory
- waiting for the pull request to be merged

With transformations, we can pass along a transformation as a Resource Option to our `NewVM` function to modify how it creates a child resource.

## Transform a Component Resource's child resource

Let's create a Resource Transformation named `domainsUse1GBMemory`. Pulumi will invoke this function for each resource created. We then:

- check if the resource is a Domain
- if the resource is a Domain, then set the memory to 1024 MiB
- if the resource is NOT a Domain, then do nothing

Let's update `main.go` to transform domains to be created with 1GiB of memory:

```diff
 package main

 import (
 	"os"

 	"pulumi-libvirt-ubuntu/pkg/vm"

 	"github.com/pulumi/pulumi-libvirt/sdk/go/libvirt"
 	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
 )

 func main() {
 	pulumi.Run(func(ctx *pulumi.Context) error {
 		// `pool` is a storage pool that can be used to create volumes
 		// the `dir` type uses a directory to manage files
 		// `Path` maps to a directory on the host filesystem, so we'll be able to
 		// volume contents in `/pool/cluster_storage/`
 		pool, err := libvirt.NewPool(ctx, "cluster", &libvirt.PoolArgs{
 			Type: pulumi.String("dir"),
 			Path: pulumi.String("/pool/cluster_storage"),
 		}, pulumi.DeleteBeforeReplace(true))
 		if err != nil {
 			return err
 		}

 		// create a volume with the contents being a Ubuntu 20.04 server image
 		ubuntu, err := libvirt.NewVolume(ctx, "ubuntu", &libvirt.VolumeArgs{
 			Pool:   pool.Name,
 			Source: pulumi.String("https://cloud-images.ubuntu.com/releases/focal/release/ubuntu-20.04-server-cloudimg-amd64.img"),
 		})
 		if err != nil {
 			return err
 		}

 		cloud_init_user_data, err := os.ReadFile("./cloud_init_user_data.yaml")
 		if err != nil {
 			return err
 		}

 		cloud_init_network_config, err := os.ReadFile("./cloud_init_network_config.yaml")
 		if err != nil {
 			return err
 		}

 		// create a cloud init disk that will setup the ubuntu credentials
 		cloud_init, err := libvirt.NewCloudInitDisk(ctx, "cloud-init", &libvirt.CloudInitDiskArgs{
 			MetaData:      pulumi.String(string(cloud_init_user_data)),
 			NetworkConfig: pulumi.String(string(cloud_init_network_config)),
 			Pool:          pool.Name,
 			UserData:      pulumi.String(string(cloud_init_user_data)),
 		})
 		if err != nil {
 			return err
 		}

 		// create NAT network using 192.168.10/24 CIDR
 		network, err := libvirt.NewNetwork(ctx, "network", &libvirt.NetworkArgs{
 			Addresses: pulumi.StringArray{pulumi.String("192.168.10.0/24")},
 			Autostart: pulumi.Bool(true),
 			Mode:      pulumi.String("nat"),
 		}, pulumi.DeleteBeforeReplace(true))
 		if err != nil {
 			return err
 		}

-		vm, err := vm.NewVM(ctx, "ubuntu", pool.Name, ubuntu.ID(), cloud_init.ID(), network.ID())
+		domainsUse1GBMemory := func(args *pulumi.ResourceTransformationArgs) *pulumi.ResourceTransformationResult {
+			// only modify resources that are a Domain type
+			if args.Type == "libvirt:index/domain:Domain" {
+				modifiedDomainArgs := args.Props.(*libvirt.DomainArgs)
+				modifiedDomainArgs.Memory = pulumi.Int(1024)
+
+				return &pulumi.ResourceTransformationResult{
+					Props: modifiedDomainArgs,
+					Opts:  args.Opts,
+				}
+			}
+
+			return nil
+		}
+
+		vm, err := vm.NewVM(ctx, "ubuntu", pool.Name, ubuntu.ID(), cloud_init.ID(), network.ID(), pulumi.Transformations([]pulumi.ResourceTransformation{domainsUse1GBMemory}))
 		if err != nil {
 			return err
 		}

 		ctx.Export("IP Address", vm.IP)
 		ctx.Export("VM name", vm.Name)

 		return nil
 	})
 }
```

Run `pulumi up`, and we'll see the domain recreated with 1024 MiB of memory.

These transformations can be a considerable time saving when using third-party components. It can also be a good litmus test for Component
Resource developers to figure out what is commonly modified by others. Then decide if it should be easier to configure
instead of using a transformation.

Our VM Component Resource is looking pretty good, but currently, someone has to set up the pool, image volume, and network. Let's make
a higher-level component to encapsulate all of this.

## Create Higher Level VMGroup Component Resource

We can go another step and create a Component Resource that makes other resources and Component Resources.

Let's create a new Component Resource named `VMGroup` to make the pool, image volume, and network.

Our `VMGroup` resource will take the following arguments:

- name of the group
- directory to use for storage pool
- image source to use for VMs
- IP CIDR to use for the NAT network
- number of VMs to create

Create a new file for our VMGroup:

```bash
touch pkg/vm/group.go
```

and with the following content:

```go
package vm

import (
	"fmt"
	"os"

	"github.com/pulumi/pulumi-libvirt/sdk/go/libvirt"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

type VMGroup struct {
	pulumi.ResourceState

	Name pulumi.String         `pulumi:"name"`
	VMs  pulumi.StringMapArray `pulumi:"vms"`
}

func NewVMGroup(ctx *pulumi.Context, groupName string, hostStoragePoolPath string, vmImageSource string, ipCIDR string, numberOfVMs int, opts ...pulumi.ResourceOption) (*VMGroup, error) {
	var resource VMGroup

	err := ctx.RegisterComponentResource("pulumi-libvirt-ubuntu:pkg/vm:vmgroup", groupName, &resource, opts...)
	if err != nil {
		return nil, err
	}

	// `pool` is a storage pool that can be used to create volumes
	// the `dir` type uses a directory to manage files
	// `Path` maps to a directory on the host filesystem, so we'll be able to
	// volume contents in `/pool/cluster_storage/`
	pool, err := libvirt.NewPool(ctx, fmt.Sprintf("%s-cluster", groupName), &libvirt.PoolArgs{
		Type: pulumi.String("dir"),
		Path: pulumi.String(hostStoragePoolPath),
	}, pulumi.Parent(&resource), pulumi.DeleteBeforeReplace(true))
	if err != nil {
		return nil, err
	}

	// create a volume with the contents being a Ubuntu 20.04 server image
	imageVolume, err := libvirt.NewVolume(ctx, fmt.Sprintf("%s-image", groupName), &libvirt.VolumeArgs{
		Pool:   pool.Name,
		Source: pulumi.String(vmImageSource),
	}, pulumi.Parent(&resource))
	if err != nil {
		return nil, err
	}

	cloud_init_user_data, err := os.ReadFile("./cloud_init_user_data.yaml")
	if err != nil {
		return nil, err
	}

	cloud_init_network_config, err := os.ReadFile("./cloud_init_network_config.yaml")
	if err != nil {
		return nil, err
	}

	// create a cloud init disk that will setup the ubuntu credentials
	cloud_init, err := libvirt.NewCloudInitDisk(ctx, fmt.Sprintf("%s-cloud-init", groupName), &libvirt.CloudInitDiskArgs{
		MetaData:      pulumi.String(string(cloud_init_user_data)),
		NetworkConfig: pulumi.String(string(cloud_init_network_config)),
		Pool:          pool.Name,
		UserData:      pulumi.String(string(cloud_init_user_data)),
	}, pulumi.Parent(&resource))
	if err != nil {
		return nil, err
	}

	// create NAT network using 192.168.10/24 CIDR
	network, err := libvirt.NewNetwork(ctx, fmt.Sprintf("%s-network", groupName), &libvirt.NetworkArgs{
		Addresses: pulumi.StringArray{pulumi.String(ipCIDR)},
		Autostart: pulumi.Bool(true),
		Mode:      pulumi.String("nat"),
	}, pulumi.Parent(&resource), pulumi.DeleteBeforeReplace(true))
	if err != nil {
		return nil, err
	}

	vmOutputs := pulumi.StringMapArray{}

	for i := 0; i < numberOfVMs; i++ {
		vmName := fmt.Sprintf("%s-%d", groupName, i)

		vm, err := NewVM(ctx, vmName, pool.Name, imageVolume.ID(), cloud_init.ID(), network.ID(), pulumi.Parent(&resource))
		if err != nil {
			return nil, err
		}

		vmOutputs = append(vmOutputs, pulumi.StringMap{
			"ip":   vm.IP,
			"name": vm.Name,
		})
	}

	resource.Name = pulumi.String(groupName)
	resource.VMs = vmOutputs

	ctx.RegisterResourceOutputs(&resource, pulumi.Map{
		"name": pulumi.String(groupName),
		"vms":  vmOutputs,
	})

	return &resource, nil
}
```

This file is pretty similar to our existing `vm.go` file. We're just demonstrating a Component Resource can create more Component Resources.

Let's now update `main.go` to use our `VMGroup`:

```diff
 package main

 import (
 	"os"

 	"pulumi-libvirt-ubuntu/pkg/vm"

 	"github.com/pulumi/pulumi-libvirt/sdk/go/libvirt"
 	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
 )

 func main() {
 	pulumi.Run(func(ctx *pulumi.Context) error {
-		// `pool` is a storage pool that can be used to create volumes
-		// the `dir` type uses a directory to manage files
-		// `Path` maps to a directory on the host filesystem, so we'll be able to
-		// volume contents in `/pool/cluster_storage/`
-		pool, err := libvirt.NewPool(ctx, "cluster", &libvirt.PoolArgs{
-			Type: pulumi.String("dir"),
-			Path: pulumi.String("/pool/cluster_storage"),
-		}, pulumi.DeleteBeforeReplace(true))
-		if err != nil {
-			return err
-		}
-
-		// create a volume with the contents being a Ubuntu 20.04 server image
-		ubuntu, err := libvirt.NewVolume(ctx, "ubuntu", &libvirt.VolumeArgs{
-			Pool:   pool.Name,
-			Source: pulumi.String("https://cloud-images.ubuntu.com/releases/focal/release/ubuntu-20.04-server-cloudimg-amd64.img"),
-		})
-		if err != nil {
-			return err
-		}
-
-		cloud_init_user_data, err := os.ReadFile("./cloud_init_user_data.yaml")
-		if err != nil {
-			return err
-		}
-
-		cloud_init_network_config, err := os.ReadFile("./cloud_init_network_config.yaml")
-		if err != nil {
-			return err
-		}
-
-		// create a cloud init disk that will setup the ubuntu credentials
-		cloud_init, err := libvirt.NewCloudInitDisk(ctx, "cloud-init", &libvirt.CloudInitDiskArgs{
-			MetaData:      pulumi.String(string(cloud_init_user_data)),
-			NetworkConfig: pulumi.String(string(cloud_init_network_config)),
-			Pool:          pool.Name,
-			UserData:      pulumi.String(string(cloud_init_user_data)),
-		})
-		if err != nil {
-			return err
-		}
-
-		// create NAT network using 192.168.10/24 CIDR
-		network, err := libvirt.NewNetwork(ctx, "network", &libvirt.NetworkArgs{
-			Addresses: pulumi.StringArray{pulumi.String("192.168.10.0/24")},
-			Autostart: pulumi.Bool(true),
-			Mode:      pulumi.String("nat"),
-		}, pulumi.DeleteBeforeReplace(true))
-		if err != nil {
-			return err
-		}
-
 		domainsUse1GBMemory := func(args *pulumi.ResourceTransformationArgs) *pulumi.ResourceTransformationResult {
 			// only modify resources that are a Domain type
 			if args.Type == "libvirt:index/domain:Domain" {
 				modifiedDomainArgs := args.Props.(*libvirt.DomainArgs)
 				modifiedDomainArgs.Memory = pulumi.Int(1024)

 				return &pulumi.ResourceTransformationResult{
 					Props: modifiedDomainArgs,
 					Opts:  args.Opts,
 				}
 			}

 			return nil
 		}

-		vm, err := vm.NewVM(ctx, "ubuntu", pool.Name, ubuntu.ID(), cloud_init.ID(), network.ID(), pulumi.Transformations([]pulumi.ResourceTransformation{domainsUse1GBMemory}))
+		vmGroup, err := vm.NewVMGroup(ctx, "ubuntu", "/pool/cluster_storage", "https://cloud-images.ubuntu.com/releases/focal/release/ubuntu-20.04-server-cloudimg-amd64.img", "192.168.10.0/24", 1, pulumi.Transformations([]pulumi.ResourceTransformation{domainsUse1GBMemory}))
 		if err != nil {
 			return err
 		}

-		ctx.Export("IP Address", vm.IP)
-		ctx.Export("VM name", vm.Name)
+		ctx.Export("VMs", vmGroup.VMs)

 		return nil
 	})
 }
```

Our `main.go` now only creates a `VMGroup`. The `VMGroup` handles creating the storage pool, image volume, and network. If we
want more than one VM, we change `numberOfVMs`.

One thing to note, our previous `domainsUse1GBMemory` transformation still works as-is!

Now, let's update our deployment.
I recommend running `pulumi destroy` first for this case to avoid having two pools and two networks trying to use the same resources.
This issue is happening because we're renaming the resources, but it's trying to create the new ones before destroying the old ones.

Afterward, run `pulumi up`.

---

I hope this helps illustrate the advantages of Pulumi's Component Resources and how to make shareable components for others.

Have any recommendations for improvements or questions? Let me know on [Twitter](https://twitter.com/dustinspecker),
[LinkedIn](https://www.linkedin.com/in/dustin-specker/), or [GitHub](https://github.com/dustinspecker).

{{< convertkit >}}
