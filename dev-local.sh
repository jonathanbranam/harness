#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${TMUX:-}" ]]; then
  echo "Error: must be run inside a tmux session"
  exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
ORIGIN="$TMUX_PANE"

tmux set-window-option pane-border-status top

# Split right: client-deck frontend
tmux split-window -h -c "$DIR"
tmux send-keys "$DIR/scripts/set-pane-title.sh client-deck && npm run dev:client-deck" Enter

# Add more panes here as more harness clients show up, following the same
# `npm run dev:<client>` pattern — see package.json.

# Uncomment once Caddyfile.local's hostname is set up for LAN testing:
# tmux split-window -v -c "$DIR"
# tmux send-keys "$DIR/scripts/set-pane-title.sh caddy && caddy run --config Caddyfile.local" Enter

# Return to original pane: deck-harness-server backend
tmux select-pane -t "$ORIGIN"
tmux send-keys "$DIR/scripts/set-pane-title.sh deck-harness-server && npm run dev" Enter
