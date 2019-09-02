.PHONY: build deploy

IMAGE_NAME = www

build:
	docker build . -t $(IMAGE_NAME)

deploy:
	docker run --rm -e AWS_ACCESS_KEY -e AWS_SECRET_KEY $(IMAGE_NAME)
