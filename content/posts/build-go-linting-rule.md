---
title: "Go, Lint. Go! How to Build a Go Linting Rule"
images:
  - images/build-go-linting-rule/build-go-linting-rule.png
date: 2023-07-13T12:00:00Z
lastmod: 2023-07-13T12:00:00Z
draft: false
categories:
  - development
tags:
  - go
  - linting
---

Several months ago, I started working on a [Go linter (gomega-lint)](https://github.com/dustinspecker/gomega-lint) for [gomega](https://onsi.github.io/gomega/). I've been using gomega at work for almost a year and love it now. I've formed some opinions on good practices for using gomega. But giving this kind of feedback during code reviews - it's too late by that point. So, I wanted a Go linter to encourage these good practices.

Creating a new linter or linting rule in Go wasn't immediately apparent. And I wanted to know how to test the linter. This post shares my lessons learned, and I hope it helps someone else in the future.

Let's build a contrived rule to prevent invoking `fmt.Printf` by using [singlechecker](https://pkg.go.dev/golang.org/x/tools/go/analysis/singlechecker).

> Note: the final code can be found at [go-lint-rule-demo](https://github.com/dustinspecker/go-lint-rule-demo)

## Create a new Go module for the linting rule

We'll start by creating a new Go project that will have the following structure:

```
.
├── go.mod
├── go.sum
└── internal
    └── rules
        ├── nofmtprintf.go
        ├── nofmtprintf_test.go
        └── testdata
            └── src
                └── nofmtprintf
                    └── example.go
```

Run the following commands to initialize a new Go module and create the above file structure.

```bash
mkdir ~/go-lint-rule-demo
cd ~/go-lint-rule-demo
go mod init go-lint-rule-demo
mkdir -p internal/rules/testdata/src/nofmtprintf
touch internal/rules/nofmtprintf{,_test}.go
```

Afterward, you should have the same file structure as above.

Next, let's download `golang.org/x/tools` which contains [singlechecker](https://pkg.go.dev/golang.org/x/tools/go/analysis/singlechecker).

```bash
go get golang.org/x/tools
```

## Build a primitive rule

When I first started to build my rule, I took a naive approach to checking any function call matching "fmt.Printf". Let's start by doing that
and then talk about the downsides.

I like to try to create failing tests before writing any source code, so let's make `./internal/rules/nofmtfprintf_test.go` with the following content:

```go
package rules_test

import (
  "testing"

  "golang.org/x/tools/go/analysis/analysistest"

  "go-lint-rule-demo/internal/rules"
)

func TestNoFmtPrintf(t *testing.T) {
  testDataDir := analysistest.TestData()

  analysistest.Run(t, testDataDir, rules.NoFmtPrintf, "./src/nofmtprintf/")
}
```

This wires up analysistest, a tool used for testing rules. Ultimately, this will run our linting rule
within the `testdata` directory that we'll now set up with an example code to lint.

Create a new file named `internal/rules/testdata/src/nofmtprintf/nofmtprintf.go` with the following content:

```go
package nofmtprintf

import "fmt"

func dostuff() {
	fmt.Printf("hello") // want `Don't use fmt.Printf`

	fmt.Println("hey")
}
```

This file is just a plain ol' Go file. analysistest will execute our linting rule against this file.
analysistest will expect to get a linting error with a message of `Don't use fmt.Printf` when linting `fmt.Printf("hello")`. It will also
expect zero linting errors on all other lines.

We can execute our unit test via `go test ./...`.

Let's now implement our naive rule. Let's make a new file named `./internal/rules/nofmtprintf.go` and populate it with:

```go
package rules

import (
	"go/ast"

	"golang.org/x/tools/go/analysis"
)

var NoFmtPrintf = &analysis.Analyzer{
	Name: "nofmtprintf",
	Doc:  "Avoid fmt.Printf",
	Run:  noFmtPrintfRun,
}

func noFmtPrintfRun(pass *analysis.Pass) (interface{}, error) {
	for _, file := range pass.Files {
		ast.Inspect(file, func(node ast.Node) bool {
			// examine all function calls
			callExpr, isCallExpr := node.(*ast.CallExpr)
			if !isCallExpr {
				return true
			}

			selExpr, isSelExpr := callExpr.Fun.(*ast.SelectorExpr)
			if !isSelExpr {
				return true
			}

			xIdent, isIdent := selExpr.X.(*ast.Ident)
			if !isIdent {
				return true
			}

			if xIdent.Name == "fmt" && selExpr.Sel.Name == "Printf" {
				pass.Report(analysis.Diagnostic{
					Pos:     node.Pos(),
					End:     node.End(),
					Message: "Don't use fmt.Printf",
				})
			}

			return true
		})
	}

	return nil, nil
}
```

A lot happens here if you're unfamiliar with abstract syntax trees (AST). This code looks for function calls and then checks that the package name is "fmt" and that the function invoked is exactly named "Printf".

## Use types to build a more intelligent rule

So the naive implementation catches "fmt.Printf". Unfortunately, there are several issues:

- dot imports of `fmt` won't be caught
- aliasing the `fmt` import won't be caught
- other packages or structs named fmt with a Printf function will be erroneously reported

Let's update our example code first to prove this:

```go
package nofmtprintf

import (
  "fmt"
  . "fmt"
  format "fmt"
)

func dostuff() {
  fmt.Printf("hello")    // want `Don't use fmt.Printf`
  format.Printf("hello") // want `Don't use fmt.Printf`
  Printf("hello")        // want `Don't use fmt.Printf`
  fmt.Println("hey")

  fmt := printer{}
  fmt.Printf("fake")
  fmt.Println("fake")
}

type printer struct{}

func (printer) Printf(string)  {}
func (printer) Println(string) {}
```

Our test will start failing as expected. So how do we avoid all of the false negatives and the permutations of aliases?

The parser has a nifty trick - it also identifies types! While analyzing a file, we can also look up information about the package's imports.

So, what we can do is roughly:

1. Look up the packages imported by the file under inspection
1. Look for the fmt package in the list of imports
1. Lookup the Printf function in fmt package when found

We can get the Printf function's type once we've found the Printf function in the fmt package.

The magic ingredient here is that every usage of `fmt.Printf` will have the same type. It'll be the same for any alias and dot import.

Let's update our rule to look up the "fmt.Printf" function and find matching function calls:

```go
package rules

import (
	"go/ast"
	"go/types"

	"golang.org/x/tools/go/analysis"
)

var NoFmtPrintf = &analysis.Analyzer{
	Name: "nofmtprintf",
	Doc:  "Avoid fmt.Printf",
	Run:  noFmtPrintfRun,
}

func noFmtPrintfRun(pass *analysis.Pass) (interface{}, error) {
	var fmtPrintfType types.Type

	for _, pkg := range pass.Pkg.Imports() {
		if pkg.Name() == "fmt" {
			fmtPrintfType = pkg.Scope().Lookup("Printf").Type()
		}
	}

	for _, file := range pass.Files {
		ast.Inspect(file, func(node ast.Node) bool {
			// examine all function calls
			callExpr, isCallExpr := node.(*ast.CallExpr)
			if !isCallExpr {
				return true
			}

			callExprFunType := pass.TypesInfo.TypeOf(callExpr.Fun)
			if callExprFunType == fmtPrintfType {
				pass.Report(analysis.Diagnostic{
					Pos:     node.Pos(),
					End:     node.End(),
					Message: "Don't use fmt.Printf",
				})
			}

			return true
		})
	}

	return nil, nil
}
```

So, not only is our rule more accurate, but it's simpler!

If you know an even better way, then please let me know!

## Compile linter executable

Let's build a binary so we can use this rule anywhere.

Create a new directory:

```bash
mkdir -p cmd/linter
```

and create `./cmd/linter/main.go` matching:

```go
package main

import (
	"golang.org/x/tools/go/analysis/singlechecker"

	"go-lint-rule-demo/internal/rules"
)

func main() {
	singlechecker.Main(rules.NoFmtPrintf)
}
```

> Note: there's also golang.org/x/tools/go/analysis/multichecker if you want to include multiple rules in one binary.

Now we can build our executable with:

```bash
go build ./cmd/...
```

and run our executable like:

```bash
./linter ./internal/rules/testdata/src/...
```

and we'll see the same linting errors as our tests!

The singlechecker and multichecker come with great functionality out of the box. You can learn more via `./linter -h`. One of the incredible options is the ability
to support auto fixes with `-fix`!

## Support auto fixes

Linting is excellent for catching issues, but linters reach another level when they
can automatically fix issues. Thankfully, the analysis package supports this as well. Our rule needs to provide suggested fixes for invalid code.

Our example linter rule that is going to replace `fmt.Printf` arbitrarily with `log.Printf`.

Let's start by updating our unit tests:

```go
package rules_test

import (
	"testing"

	"golang.org/x/tools/go/analysis/analysistest"

	"go-lint-rule-demo/internal/rules"
)

func TestNoFmtPrintf(t *testing.T) {
	testDataDir := analysistest.TestData()

	analysistest.Run(t, testDataDir, rules.NoFmtPrintf, "./src/nofmtprintf/")
}

func TestNoFmtPrintfAutoFix(t *testing.T) {
	testDataDir := analysistest.TestData()

	results := analysistest.RunWithSuggestedFixes(t, testDataDir, rules.NoFmtPrintf, "./src/nofmtprintf/")

	suggestedFixProvided := false
	for _, result := range results {
		for _, diagnostic := range result.Diagnostics {
			for _, suggestedFix := range diagnostic.SuggestedFixes {
				if len(suggestedFix.TextEdits) != 0 {
					suggestedFixProvided = true
				}
			}
		}
	}

	if !suggestedFixProvided {
		t.Errorf("expected a suggested fix to be provided, but didn't have any in %+v", results)
	}
}
```

We're using `RunWithSuggestedFixes` instead of `Run` here. It looks the same as `Run`, but `RunWithSuggestedFixes` does the following:

1. Runs the linter to get a report of violations
1. Applies any suggested fixes returned in the report
1. Compares a fixed file to a `.golden` file

Let's create `./internal/rules/testdata/src/nofmtfprintf/example.go.golden` with the following content:

```go
package nofmtprintf

import (
	"fmt"
	. "fmt"
	format "fmt"
)

func dostuff() {
	log.Printf("hello") // want `Don't use fmt.Printf`
	log.Printf("hello") // want `Don't use fmt.Printf`
	log.Printf("hello") // want `Don't use fmt.Printf`
	fmt.Println("hey")

	fmt := printer{}
	fmt.Printf("fake")
	fmt.Println("fake")
}

type printer struct{}

func (printer) Printf(string)  {}
func (printer) Println(string) {}
```

This file matches the content of our `./internal/rules/testdata/src/nofmtfprintf/example.go` file, except the `fmt.Printf` usages have been replaced with `log.Printf`.

The `TestNoFmtPrintfAutoFix` test will start failing now.

One thing to note is the loop over `results` is only so this test fails from the start. Without this logic, if a rule returns 0 suggested fixes, then `RunWithSuggestedFixes` doesn't compare to the `.golden` file, so the unit test won't fail.

Now let's add support for suggested fixes by modifying `./internal/rules/nofmtprintf.go`:

```diff
 				pass.Report(analysis.Diagnostic{
 					Pos:     node.Pos(),
 					End:     node.End(),
 					Message: "Don't use fmt.Printf",
+					SuggestedFixes: []analysis.SuggestedFix{
+						{
+							TextEdits: []analysis.TextEdit{
+								{
+									Pos:     node.Pos(),
+									End:     callExpr.Lparen,
+									NewText: []byte("log.Printf"),
+								},
+							},
+						},
+					},
 				})
```

Suggested Fixes are a list of text edits to perform on the file. The text edit
provides starting and end positions to replace with the new text.

In this case, we always replace it with `log.Printf`. Once we build the linter, we can use `-fix` for the suggested fixes to be automatically applied. Also,
at this point, our unit test will be passing.

--

There are a couple of gotchas with this approach to suggested fixes:

- missing imports aren't added
- unused imports aren't removed

Imagine the file wasn't importing `log`. Now we have a compilation issue.

On the flip side, imagine the file only imported `fmt` for `Printf`. After all usages of `fmt.Printf` are replaced with `log.Printf`, we have an unused import causing another compilation issue.

I am still looking for a reliable way to modify the imports accordingly.

If you know a better way to implement rules or how to handle adding/removing imports, please connect on

[Twitter](https://twitter.com/dustinspecker), [LinkedIn](https://www.linkedin.com/in/dustin-specker/), or [GitHub](https://github.com/dustinspecker).

{{< convertkit >}}
