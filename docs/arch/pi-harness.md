# pi-Coding-Agent Harness Notes

Design notes for a *new, separate* project: web-backed harnesses that run
the `pi` coding agent (`@earendil-works/pi-coding-agent`) in-process behind a
browser UI — starting with the deck-editing harness in
[`../talks/deck-harness/planning.md`](../talks/deck-harness/planning.md),
with more harnesses expected to follow.

This document assumes familiarity with
[`track-web-architecture.md`](./track-web-architecture.md), which describes
the **implemented** track-web system. Everything below is a proposal for a
different, sibling project — none of this is built or exists in track-web
today.

## Why not build this inside track-web

track-web runs every client app's API through **one shared Hono process**
under a single PM2 entry (`ecosystem.config.cjs`), on a resource-constrained
production host (t4g.micro, 2 vCPU burstable / 1 GB RAM) whose build
pipeline already had one incident (bundling Phaser) that overwhelmed the
box. See "Server" and "Deploy pipeline" in `track-web-architecture.md`.

A pi-agent harness needs something track-web has never had: a **long-lived,
stateful, in-process agent runtime** — a `Map<sessionId, AgentSession>` held
for the life of a chat session, streaming events over a WebSocket, with tool
calls (`bash`, `write`, `edit`) that can consume real CPU/memory and hit
external model APIs. Running that inside track-web's single shared process
would mean:

- A hung or memory-heavy agent session (or a bug in the WebSocket/approval
  plumbing, which is new, unproven code) can degrade or crash the same
  process serving time tracking, trips, watch, and every other app.
- The harness's tool-execution surface (`bash`/`write`/`edit`, even with a
  permission-gate extension) is a materially larger attack/blast-radius
  surface than anything else in track-web, sitting behind the same public
  subdomains and auth model.
- The existing build pipeline already has zero slack; adding a harness
  client + WebSocket server code to the same sequential build only adds risk
  for no benefit, since the harness doesn't need to share a deploy cadence
  with the time tracker.
- The plan explicitly anticipates *several* harnesses, which compounds all
  of the above if they all live in one shared process.

Conclusion: build harnesses as their own deployable(s), reusing track-web's
validated patterns rather than its process.

## What to reuse directly from track-web

These are validated, cheap to replicate, and require no rethinking:

- **Monorepo shape**: npm workspaces, with a `packages/` tier for code
  shared across harnesses (auth primitives, UI shell, a dev-ports registry)
  — mirrors `@repo/auth` / `@repo/ui` / `@repo/config` in track-web.
- **Server stack**: Hono + `@hono/node-server`, `tsx watch` for dev, `tsc`
  build for prod, the same `env.ts` `requireEnv()` pattern for config.
- **Client stack**: Vite + React 19 + React Router 7 + Tailwind 4, same
  dev-port-registry convention if there end up being multiple harness UIs.
- **Caddy**: per-subdomain block pattern, wildcard DNS + automatic Let's
  Encrypt — trivially extends to a new subdomain (e.g. `deck.branam.us`)
  regardless of which box runs it, and can share the *same* Caddy instance
  as track-web without sharing anything else.
- **Auth**: the cookie-session model (opaque token, hash stored
  server-side) is a reasonable fit as-is — these harnesses are described as
  single-user (the owner) in the deck-harness plan.
- **Testing**: Vitest at the root with an explicit `include` glob per
  workspace.
- **Deploy shape**: `git pull` + build + process-manager restart +
  `caddy reload`, as a template — but see below on *not* sharing the actual
  pipeline/process with track-web.

## What's new territory (not reused from track-web)

- **WebSocket transport** for streaming pi events (`message_update`,
  `tool_execution_*`, approval requests) to the browser. track-web has zero
  precedent for this — no WebSocket, no SSE, no persistent connection
  handling anywhere in its codebase.
- **In-process agent runtime**: `createAgentSession` /
  `ModelRuntime.create()` / `SessionManager`, held per chat session in a
  server-side map, per the deck-harness plan's architecture section.
- **Custom pi extensions**: a permission-gate extension (static
  blocklist, path jail, interactive browser-mediated approval flow) and a
  presentation-bridge (or equivalent, per-harness) tool-registration
  extension. These run with the server's full privileges, per pi's
  extension model — see the "Security and safety" section of the
  deck-harness plan.
- **Possibly multiple backends**: since each harness pairs its own server
  with its own client (per the stated design goal), each harness owns its
  own `sessionId -> AgentSession` state rather than centralizing it in a
  shared server. This keeps failure domains isolated per-harness even if
  several harnesses eventually sit behind one Caddy config on the same
  physical box.

## Suggested structure

- Separate git repo (or at minimum a separate deployable root) from
  track-web — not a new workspace inside `track-web/`.
- One npm-workspaces monorepo for the harness project itself, with a
  `packages/` tier for anything shared *across harnesses* (agent-session
  bootstrapping, the permission-gate extension, WebSocket event-forwarding
  glue, shared chat-UI components) — built up incrementally as a second
  harness makes the shared surface obvious, not designed up front.
- Each harness = its own paired server + client workspace pair (e.g.
  `deck-harness-server/` + `client-deck/`), its own PM2 app entry, its own
  subdomain — independently deployable and independently restartable, so
  one harness misbehaving doesn't affect another or track-web.
- Caddy config for the harness project can live on the same host as
  track-web's (cheap, low-risk to share — it's just a reverse proxy) even
  though the Node processes, PM2 entries, and build pipelines stay separate.
- Revisit whether a shared `packages/pi-harness-core`-style package is worth
  extracting only after a second harness exists and the actual common
  surface is visible — mirrors how `packages/auth`/`packages/ui` in
  track-web emerged from real duplication, not upfront design.

## References

- [`../talks/deck-harness/planning.md`](../talks/deck-harness/planning.md)
  — the concrete design for the first harness (live presentation editing).
- [`track-web-architecture.md`](./track-web-architecture.md) — the baseline
  patterns this project reuses.
