FROM mhart/alpine-node:12

WORKDIR /project

RUN apk add --no-cache \
  git

COPY package.json package-lock.json ./

RUN npm ci --unsafe-perm

COPY gulpfile.js .

COPY app ./app

RUN npm run build
