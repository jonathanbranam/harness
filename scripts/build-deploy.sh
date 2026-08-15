#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(dirname "$(dirname "$(realpath "$0")")")}"

cd "${APP_DIR}"
mkdir -p logs

ts() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log()  { echo "[$(ts)] $*"; }
step() { echo "[$(ts)] RUNNING: $1"; }
done_step() { echo "[$(ts)] COMPLETED: $1"; }

trap 'log "ERROR: deploy failed (exit $?) at line $LINENO"' ERR

log "=== Build started ==="

step "version.json"
SHA=$(git rev-parse --short HEAD)
COMMIT_TIME=$(git log -1 --format=%cI)
BUILD_TIME=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
printf '{"sha":"%s","commitTime":"%s","buildTime":"%s"}\n' "$SHA" "$COMMIT_TIME" "$BUILD_TIME" > "${APP_DIR}/version.json"
done_step "version.json"

step "npm install"
npm install --include=dev
# Restore any platform-specific package-lock.json churn from this install so
# the tree stays clean and the *next* deploy's `git pull --ff-only` isn't
# blocked. node_modules is already installed, so the build below is
# unaffected.
if ! git diff --quiet -- package-lock.json; then
  echo "Restoring package-lock.json after npm install"
  git checkout -- package-lock.json
fi
done_step "npm install"

# deck-harness-server ships via tsx (see its package.json) rather than a tsc
# build step — see src/session-store.ts's neighboring notes on why: this is a
# single-user local tool, not a resource-constrained shared box, so trading a
# little cold-start speed for a simpler pipeline is the right call. Add a
# `build:<harness>-server` step here only if a future harness genuinely needs
# a compiled artifact.
step "build:client-deck"
npm run build:client-deck
done_step "build:client-deck"

step "pm2 restart"
pm2 restart ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
done_step "pm2 restart"

step "pm2 save"
pm2 save
done_step "pm2 save"

if command -v caddy >/dev/null 2>&1 && [ -f "${APP_DIR}/Caddyfile" ]; then
  step "caddy reload"
  caddy reload --config "${APP_DIR}/Caddyfile" --adapter caddyfile
  done_step "caddy reload"
fi

log "=== Deploy complete ==="
