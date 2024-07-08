---
title: "Ginkgo/Gomega: Custom Formatter for Improved Assertion Messages"
images:
  - images/ginkgo-gomega-custom-formatter/ginkgo-gomega-custom-formatter.png
date: 2024-07-09T12:00:00Z
lastmod: 2024-07-09T12:00:00Z
draft: false
categories:
  - development
tags:
  - golang
  - ginkgo
  - gomega
---

[Gomega](https://onsi.github.io/gomega/) is a Go assertion library commonly used with [Ginkgo](https://onsi.github.io/ginkgo/). Out of the box, Gomega has pretty solid formatting of values when
assertions fail. Sometimes, we may know more about the value and how to better represent it in the output for easier test troubleshooting.

In this post, we'll create a custom formatter for Gomega to improve the output of errors made by [github.com/pkg/errors](https://github.com/pkg/errors) to display stack traces in assertion failure messages.

> Jump to [Create a custom formatter to handle github.com/pkg/errors](#create-a-custom-formatter-to-handle-githubcompkgerrors) to skip project setup steps.

## Setup a new project

Initialize a new Go module by running:

```bash
mkdir ginkgo-gomega-custom-formatter-example
cd ginkgo-gomega-custom-formatter-example
go mod init github.com/dustinspecker/ginkgo-gomega-custom-formatter-example
```

Install Ginkgo and Gomega Go packages and the Ginkgo CLI:

```bash
go get github.com/onsi/gomega
go get github.com/onsi/ginkgo/v2
go install -mod=mod github.com/onsi/ginkgo/v2/cmd/ginkgo
```

## Create functions to return errors

Create a directory and a new Go file to hold functions that return errors.

```bash
mkdir internal
touch internal/internal.go
```

`internal/internal.go` will have a function that returns a standard Go error and another function that returns a `github.com/pkg/errors` error:

```go
package internal

import (
	"errors"

	pkgErrors "github.com/pkg/errors"
)

// ReturnsError returns a standard Go error
func ReturnsError() error {
	return errors.New("error from ReturnsError")
}

// ReturnsPkgError returns a wrapped error using github.com/pkg/errors
func ReturnsPkgError() error {
	err := ReturnsError()

	return pkgErrors.Wrapf(err, "error from ReturnsPkgError")
}
```

## Create test cases

Bootstrap a new Ginkgo test suite by running:

```bash
mkdir test
cd test
ginkgo bootstrap
cd ..
```

The generated `test_suite_test.go` file will look like this:

```go
package test_test

import (
	"testing"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

func TestTest(t *testing.T) {
	RegisterFailHandler(Fail)
	RunSpecs(t, "Test Suite")
}
```

Generate an example Ginkgo test file via:

```bash
cd test
ginkgo generate example
cd ..
```

Modify the generated `example_test.go` file to look like this:

```go
package test_test

import (
	"github.com/dustinspecker/ginkgo-gomega-custom-formatter-example/internal"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

var _ = Describe("Test", func() {
	It("custom reporter handles github.com/pkg/errors", func() {
		Expect(internal.ReturnsPkgError()).To(Succeed(), "example of github.com/pkg/errors")
	})

	It("custom reporter falls back to Gomega's default reporter for other types", func() {
		Expect(internal.ReturnsError()).To(Succeed(), "example of error")
	})
})
```

Our test suite will have two tests. The first test will use `internal.ReturnsPkgError`, which returns an error using `github.com/pkg/errors`. The second test will use `internal.ReturnsError`, which returns a standard Go error.

## Run tests

Run our tests to see the default output:

```bash
ginkgo run ./test
```

The output will look like this:

```text
Running Suite: Test Suite - /home/dustin/github.com/dustinspecker/ginkgo-gomega-custom-formatter-example/test
=============================================================================================================
Random Seed: 1720472691

Will run 2 of 2 specs
------------------------------
• [FAILED] [0.000 seconds]
Test [It] custom reporter handles github.com/pkg/errors
/home/dustin/github.com/dustinspecker/ginkgo-gomega-custom-formatter-example/test/example_test.go:10

  [FAILED] example of github.com/pkg/errors
  Expected success, but got an error:
      <*errors.withStack | 0xc00019e738>:
      error from ReturnsPkgError: error from ReturnsError
      {
          error: <*errors.withMessage | 0xc0001dabc0>{
              cause: <*errors.errorString | 0xc000193e50>{
                  s: "error from ReturnsError",
              },
              msg: "error from ReturnsPkgError",
          },
          stack: [0x75843a, 0x75843b, 0x731a73, 0x7431ad, 0x476041],
      }
  In [It] at: /home/dustin/github.com/dustinspecker/ginkgo-gomega-custom-formatter-example/test/example_test.go:11 @ 07/08/24 16:04:51.599
------------------------------
• [FAILED] [0.000 seconds]
Test [It] custom reporter falls back to Gomega's default reporter for other types
/home/dustin/github.com/dustinspecker/ginkgo-gomega-custom-formatter-example/test/example_test.go:14

  [FAILED] example of error
  Expected success, but got an error:
      <*errors.errorString | 0xc0002b0390>:
      error from ReturnsError
      {
          s: "error from ReturnsError",
      }
  In [It] at: /home/dustin/github.com/dustinspecker/ginkgo-gomega-custom-formatter-example/test/example_test.go:15 @ 07/08/24 16:04:51.599
------------------------------

Summarizing 2 Failures:
  [FAIL] Test [It] custom reporter handles github.com/pkg/errors
  /home/dustin/github.com/dustinspecker/ginkgo-gomega-custom-formatter-example/test/example_test.go:11
  [FAIL] Test [It] custom reporter falls back to Gomega's default reporter for other types
  /home/dustin/github.com/dustinspecker/ginkgo-gomega-custom-formatter-example/test/example_test.go:15

Ran 2 of 2 Specs in 0.000 seconds
FAIL! -- 0 Passed | 2 Failed | 0 Pending | 0 Skipped
--- FAIL: TestTest (0.00s)
FAIL

Ginkgo ran 1 suite in 499.015671ms

Test Suite Failed
```

Notice how the "custom reporter handles github.com/pkg/errors" test case doesn't display the stack trace correctly. Gomega is simply printing the pointer addresses instead of the actual stack trace.

Let's fix that by creating a custom formatter.

## Create a custom formatter to handle github.com/pkg/errors

Gomega supports [registering custom formatters](https://onsi.github.io/gomega/#adjusting-output) to handle different types of values. We can use this feature to create a custom formatter to display the stack trace for errors made by `github.com/pkg/errors` correctly.

Gomega expects a formatter function to return a string representation of the value and a boolean indicating if the formatter handled the value. If the formatter handles the value, Gomega will use the string representation in the output. If the formatter doesn’t handle the value, Gomega will loop through registered formatters and its default formatter.

> Unfortunately, [github.com/pkg/errors](https://github.com/pkg/errors/blob/5dd12d0cfe7f152f80558d591504ce685299311e/errors.go#L120) doesn't have an exported type we can use to check if an error is a `github.com/pkg/errors` error. Instead, we'll check if the error has a `Cause` method. If it does, we'll assume it's a `github.com/pkg/errors` error.

Update the `test_suite_test.go` file to include a custom formatter function and register it:

```go
package test_test

import (
	"fmt"
	"testing"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"github.com/onsi/gomega/format"
)

func TestTest(t *testing.T) {
	RegisterFailHandler(Fail)
	format.RegisterCustomFormatter(formatter)
	RunSpecs(t, "Test Suite")
}

func formatter(value any) (string, bool) {
	// handle github.com/pkg/errors with a stack
	pkgErr, isPkgError := value.(interface{ Cause() error })
	if isPkgError {
		return fmt.Sprintf("%+v", pkgErr), true
	}

	return "", false
}
```

> You may register multiple custom formatters by calling `format.RegisterCustomFormatter` multiple times.

## Re-run tests using a custom formatter

Finally, run our test case that uses `github.com/pkg/errors`:

```bash
ginkgo run --focus "github.com/pkg/errors" ./test
```

Now, the output will look like this:

```text
Running Suite: Test Suite - /home/dustin/github.com/dustinspecker/ginkgo-gomega-custom-formatter-example/test
=============================================================================================================
Random Seed: 1720472938

Will run 1 of 2 specs
------------------------------
• [FAILED] [0.000 seconds]
Test [It] custom reporter handles github.com/pkg/errors
/home/dustin/github.com/dustinspecker/ginkgo-gomega-custom-formatter-example/test/example_test.go:10

  [FAILED] example of github.com/pkg/errors
  Expected success, but got an error:
      <*errors.withStack | 0xc0001420d8>:
      error from ReturnsPkgError: error from ReturnsError
      error from ReturnsError
          error from ReturnsPkgError
          github.com/dustinspecker/ginkgo-gomega-custom-formatter-example/internal.ReturnsPkgError
                /home/dustin/github.com/dustinspecker/ginkgo-gomega-custom-formatter-example/internal/github_pkg_errors.go:11
          github.com/dustinspecker/ginkgo-gomega-custom-formatter-example/test_test.init.func1.1
                /home/dustin/github.com/dustinspecker/ginkgo-gomega-custom-formatter-example/test/example_test.go:11
          github.com/onsi/ginkgo/v2/internal.extractBodyFunction.func3
                /home/dustin/go/pkg/mod/github.com/onsi/ginkgo/v2@v2.19.0/internal/node.go:472
          github.com/onsi/ginkgo/v2/internal.(*Suite).runNode.func3
                /home/dustin/go/pkg/mod/github.com/onsi/ginkgo/v2@v2.19.0/internal/suite.go:894
          runtime.goexit
                /home/dustin/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.22.4.linux-amd64/src/runtime/asm_amd64.s:1695
  In [It] at: /home/dustin/github.com/dustinspecker/ginkgo-gomega-custom-formatter-example/test/example_test.go:11 @ 07/08/24 16:08:58.397
------------------------------
S

Summarizing 1 Failure:
  [FAIL] Test [It] custom reporter handles github.com/pkg/errors
  /home/dustin/github.com/dustinspecker/ginkgo-gomega-custom-formatter-example/test/example_test.go:11

Ran 1 of 2 Specs in 0.000 seconds
FAIL! -- 0 Passed | 1 Failed | 0 Pending | 1 Skipped
--- FAIL: TestTest (0.00s)
FAIL

Ginkgo ran 1 suite in 341.679105ms

Test Suite Failed
```

The stack trace is now correctly displayed for the test case that uses `github.com/pkg/errors`.

---

This post is an example of creating a custom formatter for Ginkgo/Gomega. You can customize the formatter to handle other types of errors or to display additional information. Another use case of formatters is redacting sensitive information.

Have you used Gomega's formatters for something else? Please let me know on
[Twitter](https://twitter.com/dustinspecker), [LinkedIn](https://www.linkedin.com/in/dustin-specker/), or [GitHub](https://github.com/dustinspecker).

{{< convertkit >}}
