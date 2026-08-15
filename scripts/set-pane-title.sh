#!/usr/bin/env bash
# Sets the current terminal/tmux pane title via OSC escape sequence.
# Usage: set-pane-title.sh [title]   (defaults to the current directory's basename)
set -euo pipefail

title="${1:-$(basename "$PWD")}"
printf '\033]2;%s\033\\' "$title"
