#!/usr/bin/env sh
set -ex

cd ./build

s3cmd sync --acl-public --delete-removed . s3://$AWS_S3_BUCKET
