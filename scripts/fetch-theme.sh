#!/bin/bash
set -ex

memes_sha="badc532fb41cfc95f38a64ea527d9f68a089872c"

mkdir -p themes/meme

(
  cd themes/meme

  git init

  if ! git cat-file -t ${memes_sha}; then
    git fetch https://github.com/reuixiy/hugo-theme-meme ${memes_sha} \
      --depth 1
  fi

  if [ "$(git rev-parse HEAD)" != ${memes_sha} ]; then
    git -c "advice.detachedHead=false" checkout ${memes_sha}
  fi

  # remove any previously made changes
  git checkout .

  git -c "user.name=Dustin Specker" -c "user.email=DustinSpecker.DustinSpecker.com" am ../../theme-patches/*
)
