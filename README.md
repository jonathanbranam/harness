# pi Harness

Web-backed harnesses that run the [`pi` coding agent](https://github.com/earendil-works/pi-mono)
(`@earendil-works/pi-coding-agent`) **in-process** behind a browser UI,
instead of the terminal. Each harness pairs a Hono server (which owns a
live `AgentSession` per login and streams its events over a WebSocket) with
a Vite/React client, so a browser tab becomes the agent's interface: you
watch its reasoning, tool calls, and file changes stream in live, and it
can act on state the browser owns (a presentation canvas, a context-window
visualization) just as naturally as it edits files on disk.

This is a **separate, sibling project to track-web** — its own
deployable(s), reusing track-web's validated patterns (Hono, Vite/React,
cookie-session auth, Caddy, PM2) without sharing its process, build
pipeline, or public exposure. See
[`docs/arch/pi-harness.md`](docs/arch/pi-harness.md) for the full rationale.

## Why

`pi` is normally a CLI. Running it behind a web UI instead unlocks two
things a terminal can't: **domain-specific UI the agent's tools can drive**
(a canvas it edits directly, not through describing changes in text), and
**a legible, shareable view of what the agent is actually doing** (context
window, skills, tool trace) for anyone who isn't the person driving the
keyboard. Both harnesses below are instances of that same idea, aimed at
different audiences.

## Harnesses

### `deck-harness-server` + `client-deck`

A live, chat-driven presentation editor. The user and pi share one
in-memory deck: the user selects objects on a canvas and types requests
("lay these out in a grid", "resize the font to fit the box"), pi calls
tools to edit the same live state, and both sides see the result
immediately. Supports multiple decks and slides, and a `slide_view` tool
that renders the active slide back to pi as an image so it can visually
check for layout problems (overflow, overlap) that numeric bounds alone
don't reveal. See
[`docs/talks/deck-harness/planning.md`](docs/talks/deck-harness/planning.md).

### `introspect-harness-server` + `client-introspect`

A meta harness: instead of being domain-specific, it visualizes *any*
pi-driven session — the context window, skills, tool-call trace, and
file-system changes — in real time, and lets a session be recorded and
replayed deterministically (rewind, branch, resume to live). Built for
demoing and teaching how AI-assisted development actually works, without
the risk of a live LLM call going off-script on stage. See
[`docs/introspect-harness/proposal.md`](docs/introspect-harness/proposal.md).

Both harnesses are **single-user** (one owner, cookie-session auth) and
meant to run **without exposure to the public internet** — their
`bash`/`write`/`edit` tool surface is a materially bigger blast radius than
anything else this pattern has been used for. See pi-harness.md's security
section.

## Quickstart

```bash
npm install

# Per harness: copy its .env.example, generate a password hash, set it
cp deck-harness-server/.env.example deck-harness-server/.env
npm run hash-password -w deck-harness-server -- 'your-password'
# paste the printed hash into deck-harness-server/.env as HARNESS_PASSWORD_HASH

# Model auth is resolved by pi's own ModelRuntime (~/.pi/agent/auth.json,
# `pi login`, or a custom ~/.pi/agent/models.json) — see docs/pi-setup.md.

# Run a harness's server + client in separate terminals...
npm run dev               # deck-harness-server
npm run dev:client-deck   # client-deck

# ...or use dev-local.sh inside a tmux session to split panes for all of them
./dev-local.sh
```

No Caddy or build step is needed for local dev — Vite proxies `/api` and
`/ws` straight to the corresponding server. See `CLAUDE.md` for the full
command reference (typecheck, test, build, production), and
[`docs/pi-setup.md`](docs/pi-setup.md) for configuring a model — including
what's required for tools that return **images** (e.g. `slide_view`) to
actually reach it.

## Structure

```
deck-harness-server/   client-deck/          # presentation-editing harness
introspect-harness-server/  client-introspect/ # session-introspection harness
docs/                  design docs and architecture notes
```

No shared `packages/` tier yet — see pi-harness.md's "Suggested structure"
on why that's deliberate: it's built up once real duplication across
harnesses is visible, not designed up front.

## More

- [`CLAUDE.md`](CLAUDE.md) — commands, architecture notes, and
  implementation details for working in this repo day-to-day.
- [`docs/arch/pi-harness.md`](docs/arch/pi-harness.md) — why this is a
  separate project from track-web, and what's reused vs. new territory.
- [`docs/pi-setup.md`](docs/pi-setup.md) — configuring `pi`'s model/auth
  layer, including vision-capable models for image-returning tools.
