FROM mhart/alpine-node:12

WORKDIR /project

RUN apk add --no-cache \
  git \
  py-pip \
  && pip install s3cmd

COPY package.json package-lock.json ./

RUN npm ci --unsafe-perm

COPY gulpfile.js .

COPY app ./app

RUN npm run build

 CMD cd ./build && s3cmd sync --acl-public --delete-removed . s3://dustinspecker.com
