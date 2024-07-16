---
title: "Go 1.20: Combined Unit and Integration Code Coverage"
images:
  - images/logos/go-combined-unit-integration-code-coverage.png
date: 2023-01-08T12:00:00Z
lastmod: 2023-01-08T12:00:00Z
draft: false
categories:
  - development
tags:
  - go
  - coverage
  - test
---

You know that code that is tricky to unit test but easy to make an integration test for? And you track code coverage?

Well, the upcoming Go 1.20 release adds support for [collecting code coverage from integration tests](https://go.dev/testing/coverage/).

Go 1.20 has a new trick and can build binaries ready to collect coverage during integration tests. If you're
like me, you want to know how to combine code coverage from unit and integration tests. Let's walk through that.

> Note: The new coverage reports are in a binary format. The typical `go test -coverprofile=c.out ./...` produces a text format.
> These two formats are not compatible. This post demonstrates Go 1.20's new tooling to merge and convert the binary format into the text format.

## Create a sample Go program

To show off collecting combined unit and integration coverage reports, we'll start by creating a Go
program to exercise.

> If you'd prefer, you can clone the demo repository instead: [go-combined-unit-integration-coverage-demo](https://github.com/dustinspecker/go-combined-unit-integration-coverage-demo).

Our Go program will feature a CLI that takes two numbers and prints the sum. Our project structure will look like this:

```
.
├── cmd
│   └── add
│       └── main.go
├── go.mod
└── internal
    └── calculator
        ├── calculator.go
        └── calculator_test.go
```

We'll create an internal `calculator` package with an `Add` and a `Multiply` function. We'll create unit tests for
the `calculator` package to have 100% unit test code coverage. Later, we'll execute our CLI twice to collect code
coverage of our `main` function.

Create a new directory, Go module, and new files by running:

```bash
mkdir ~/combined-coverage-demo
cd $_
go mod init combined-coverage-demo
mkdir -p cmd/add/ internal/calculator
touch cmd/add/main.go internal/calculator/calculator{,_test}.go
```

Populate `internal/calculator/calculator.go` with:

```go
package calculator

func Add(a, b int) int {
	return a + b
}

func Multiply(a, b int) int {
	return a * b
}
```

and add unit tests in `internal/calculator/calculator_test.go`:

```go
import (
	"testing"

	"combined-coverage-demo/internal/calculator"
)

func TestAdd(t *testing.T) {
	testcases := []struct {
		a           int
		b           int
		expectedSum int
	}{
		{3, 4, 7},
		{-1, 0, -1},
	}

	for _, tt := range testcases {
		actual := calculator.Add(tt.a, tt.b)
		if actual != tt.expectedSum {
			t.Errorf("expected %d + %d to be %d, but got %d", tt.a, tt.b, tt.expectedSum, actual)
		}
	}
}

func TestMultiply(t *testing.T) {
	testcases := []struct {
		a               int
		b               int
		expectedProduct int
	}{
		{3, 4, 12},
		{-1, 0, 0},
	}

	for _, tt := range testcases {
		actual := calculator.Multiply(tt.a, tt.b)
		if actual != tt.expectedProduct {
			t.Errorf("expected %d x %d to be %d, but got %d", tt.a, tt.b, tt.expectedProduct, actual)
		}
	}
}
```

Finally, we'll create our `main` package in `cmd/add/main.go`:

```go
package main

import (
	"fmt"
	"log"
	"os"
	"strconv"

	"combined-coverage-demo/internal/calculator"
)

func main() {
	if len(os.Args) != 3 {
		log.Fatal("expected two numbers as arguments")
	}

	a, err := strconv.Atoi(os.Args[1])
	if err != nil {
		log.Fatalf("expected %q to be an int", os.Args[1])
	}

	b, err := strconv.Atoi(os.Args[2])
	if err != nil {
		log.Fatalf("expected %q to be an int", os.Args[2])
	}

	fmt.Println(calculator.Add(a, b))
}
```

As a sanity check, unit tests should pass, and we can build our program by running the following:

```bash
go test ./...
go build -o /dev/null ./cmd/add/
```

## Build a binary for coverage collection

With Go 1.20, we can create a variation of our program with coverage collection
enabled.

Build a binary with coverage reporting enabled by running:

```bash
go build -cover -o ./bin/add ./cmd/add
```

## Run the binary to collect coverage

We've built our binary ready to report coverage. Now we want to run it.

Start by creating a directory `coverage/int` for our coverage reports for integration tests.

```bash
mkdir -p coverage/int
```

We can still run our program like usual:

```bash
./bin/add
```

But we'll see a warning printed:

```
warning: GOCOVERDIR not set, no coverage data emitted
```

If we then set `GOCOVERDIR` and run the following command:

```bash
GOCOVERDIR=coverage/int ./bin/add 1 3
```

We'll have binary coverage reports in `./coverage/int` now.

We can execute our binary multiple times to exercise different code paths. This time
let's run our program in a manner that will error.

Please run the following command and notice we provide no arguments to our `./bin/add`.

```bash
GOCOVERDIR=coverage/int ./bin/add
```

The command will fail, and that's okay. Coverage reports will continue appear in in the `./coverage/int` directory.

At this point, we can see code coverage from our integration tests (executing
`./bin/add` twice) by running:

```bash
go tool covdata percent -i=./coverage/int
```

and we'll see the following output:

```
combined-coverage-demo/cmd/add  coverage: 77.8% of statements
combined-coverage-demo/internal/calculator      coverage: 50.0% of statements
```

## Run unit tests to collect coverage

Before Go 1.20, we'd collect code coverage profiles by running:

```bash
go test -coverprofile=c.out ./...
```

The generated cover profile is in a text format and incompatible with the new binary format. There's a way to merge multiple binary reports (`go tool covdata merge`), but there isn't currently built-in tooling to combine coverage profiles.

Fortunately, with Go 1.20, there's a way to instruct `go test` to create binary coverage reports too.

Create a new directory to store binary coverage for unit tests:

```bash
mkdir -p coverage/unit
```

Then run the following command to generate coverage from unit tests:

```bash
go test -cover ./... -args -test.gocoverdir="$PWD/coverage/unit"
```

We can see unit test code coverage by running:

```bash
go tool covdata percent -i=./coverage/unit
```

and see our coverage on `internal/calculator`:

```
combined-coverage-demo/internal/calculator      coverage: 100.0% of statements
```

> Note: `-args -test.gocoverdir=...` can be read in the [proposal for cmd/cover: extend coverage testing to include applications](https://github.com/golang/go/issues/51430#issuecomment-1344711300)

## Retrieve total coverage

So far, we've used `go tool covdata percent` to display code coverage separately from
unit and from integration tests.

Fortunately, `go tool covdata percent` supports multiple directories. So we can
run:

```bash
go tool covdata percent -i=./coverage/unit,./coverage/int
```

and see the combined coverage report:

```
combined-coverage-demo/cmd/add  coverage: 77.8% of statements
combined-coverage-demo/internal/calculator      coverage: 100.0% of statements
```

## Convert total coverage to cover profile

So, we can see combined coverage from binary reports. But so much tooling and
reporting already exist around the previous text format.

Compatbility with existing tools has been thought about and `go tool covdata` supports converting
binary reports into a cover profile.

Covert our binary reports to a text profile by running:

```bash
go tool covdata textfmt -i=./coverage/unit,./coverage/int -o coverage/profile
```

And finally, we can view our total coverage again by running:

```bash
go tool cover -func coverage/profile
```

to see:

```
combined-coverage-demo/cmd/add/main.go:12:                      main            77.8%
combined-coverage-demo/internal/calculator/calculator.go:3:     Add             100.0%
combined-coverage-demo/internal/calculator/calculator.go:7:     Multiply        100.0%
total:                                                          (statements)    81.8%
```

---

Integration code coverage will be a big deal for the Go community. Reporting complete
coverage from unit and integration tests will go a long way in
helping teams have confidence in their tests.

Do you have other interesting use cases for this? Please feel free to reach out on
[Twitter](https://twitter.com/dustinspecker), [LinkedIn](https://www.linkedin.com/in/dustin-specker/), or [GitHub](https://github.com/dustinspecker). Let me know!

{{< convertkit >}}
