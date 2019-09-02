.PHONY: build deploy

AWS_S3_BUCKET = dustinspecker.com

IMAGE_NAME = www

build:
	docker build . -t $(IMAGE_NAME)

deploy:
	docker run --rm -e AWS_ACCESS_KEY -e AWS_SECRET_KEY -e AWS_S3_BUCKET=$(AWS_S3_BUCKET) $(IMAGE_NAME)
