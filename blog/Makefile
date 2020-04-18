HUGO = docker run \
	--env AWS_ACCESS_KEY_ID=$(AWS_ACCESS_KEY_ID) \
	--env AWS_SECRET_ACCESS_KEY=$(AWS_SECRET_ACCESS_KEY) \
	--interactive \
	--publish 1313:1313 \
	--rm \
	--user=$(shell id -u):$(shell id -g) \
	--volume=$(PWD):/src \
	jojomi/hugo:0.68.3 hugo

.PHONY: build
build:
	$(HUGO)

.PHONY: deploy
deploy:
	$(HUGO) deploy \
		--target s3

.PHONY: fetch-theme
fetch-theme:
	./scripts/fetch-theme.sh

.PHONY: hugo-server
hugo-server:
	$(HUGO) server \
			--bind "0.0.0.0"
