#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${TMUX:-}" ]]; then
  echo "Error: must be run inside a tmux session"
  exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
ORIGIN="$TMUX_PANE"

tmux set-window-option pane-border-status top

# Top-right: client-deck frontend
tmux split-window -h -c "$DIR"
tmux send-keys "$DIR/scripts/set-pane-title.sh client-deck && npm run dev:deck-client" Enter

# Bottom-right: client-introspect frontend
tmux split-window -v -c "$DIR"
tmux send-keys "$DIR/scripts/set-pane-title.sh client-introspect && npm run dev:introspect-client" Enter

# Return to original (top-left) pane, then split bottom-left for introspect server
tmux select-pane -t "$ORIGIN"
tmux split-window -v -c "$DIR"
tmux send-keys "$DIR/scripts/set-pane-title.sh introspect-harness-server && npm run dev:introspect-server" Enter

# Uncomment once Caddyfile.local's hostnames are set up for LAN testing:
# tmux split-window -v -c "$DIR"
# tmux send-keys "$DIR/scripts/set-pane-title.sh caddy && caddy run --config Caddyfile.local" Enter

# Return to original pane: deck-harness-server backend
tmux select-pane -t "$ORIGIN"
tmux send-keys "$DIR/scripts/set-pane-title.sh deck-harness-server && npm run dev:deck-server" Enter
