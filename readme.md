# dustinspecker.com

## Running locally

1. Install Docker
1. Run `make hugo-server` to run a local Hugo server
1. Visit [https://localhost:1313](https://localhost:1313)

## Creating a new post

1. Install Docker
1. Run `make NEW_POST_NAME=blah new-post` to scaffold a new post
1. Run `go run ./cmd/generate-image/main.go ./content/posts/blah.md` to generate logo for post
