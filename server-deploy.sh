#!/usr/bin/env bash
set -euo pipefail

# Manual deploy entry point for an always-on box (e.g. a NUC — see
# docs/arch/pi-harness.md). Unlike track-web there's no CI/webhook trigger
# here: run this by hand over SSH after pushing, or wire up your own trigger
# later if that becomes worth it.

APP_DIR="${APP_DIR:-$(dirname "$(realpath "$0")")}"
cd "${APP_DIR}"

# `npm install` across different platforms (dev on macOS, deploy on Linux)
# can rewrite package-lock.json with non-deterministic `"peer": true` markers
# on optional platform binaries (e.g. esbuild/lightningcss), leaving the tree
# dirty and making `git pull --ff-only` abort. Discard *only* that churn.
# Other local changes are left untouched (and still block the pull).
if ! git diff --quiet -- package-lock.json; then
  echo "Discarding local package-lock.json churn before pull"
  git checkout -- package-lock.json
fi

git pull --ff-only
exec bash "${APP_DIR}/scripts/build-deploy.sh"
