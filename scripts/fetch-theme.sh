#!/bin/bash
set -ex

memes_sha="ea7ecaea580125509024ee307570807a9ab326ac"

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
)
