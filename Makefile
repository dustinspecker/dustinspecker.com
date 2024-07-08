NEW_POST_NAME            ?=

HUGO = docker run \
	--env AWS_ACCESS_KEY_ID=$(AWS_ACCESS_KEY) \
	--env AWS_SECRET_ACCESS_KEY=$(AWS_SECRET_KEY) \
	--interactive \
	--publish 1313:1313 \
	--rm \
	--user=$(shell id -u):$(shell id -g) \
	--volume=$(PWD):/src \
	hugomods/hugo:exts-0.127.0 hugo

PRETTIER = docker run \
	--rm \
	--user $(shell id -u):$(shell id -g) \
	--volume $(PWD):/work \
	tmknom/prettier:3.2.5

.PHONY: build
build: fetch-theme fmt-check
	$(HUGO) \
		--environment production

.PHONY: deploy
deploy:
	$(HUGO) deploy \
		--invalidateCDN \
		--target s3

.PHONY: fetch-theme
fetch-theme:
	./scripts/fetch-theme.sh

.PHONY: fmt
fmt:
	$(PRETTIER) '**/*.md' \
		--parser markdown \
		--write

.PHONY: fmt-check
fmt-check:
	$(PRETTIER) '**/*.md' \
		--check \
		--parser markdown

.PHONY: hugo-server
hugo-server: fetch-theme
	$(HUGO) server \
		--bind "0.0.0.0"

.PHONY: new-post
new-post:
	$(HUGO) new posts/$(NEW_POST_NAME).md
