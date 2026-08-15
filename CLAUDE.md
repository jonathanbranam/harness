# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`harness` is a **separate, sibling project to track-web** (see
`docs/arch/pi-harness.md` for why) that hosts web-backed harnesses running
the `pi` coding agent (`@earendil-works/pi-coding-agent`) in-process behind a
browser UI. The first harness is `deck-harness-server` + `client-deck`, a
live presentation-editing chat UI — see `docs/talks/deck-harness/planning.md`
for its design and `docs/arch/track-web-architecture.md` for the patterns
this project deliberately reuses (monorepo shape, Hono, Vite/React/RR7/
Tailwind, cookie-session auth, Caddy per-subdomain pattern, PM2).

## Commands

```bash
# Development (run both from repo root, in separate terminals — or use
# ./dev-local.sh inside a tmux session to split panes for you)
npm run dev               # deck-harness-server (tsx watch)
npm run dev:client-deck   # client-deck (Vite)

# Build (client only — deck-harness-server ships via tsx, see below)
npm run build

# Production (after `npm run build`)
npm run start              # runs deck-harness-server, which also serves
                            # client-deck/dist as the SPA

# Typecheck (no emit)
npm run typecheck

# Test
npm test

# Utilities
npm run hash-password -w deck-harness-server -- 'your-password'
```

No lint is configured.

## Why deck-harness-server ships via `tsx`, not `tsc`

Every other Node service in this family (track-web) builds with `tsc` to
`out/` and runs the compiled JS in production. deck-harness-server instead
runs `tsx src/index.ts` directly in both dev and prod (see its
`package.json`). Two reasons this diverges from track-web's pattern
deliberately, not by oversight:

1. `@earendil-works/pi-coding-agent` ships ESM-only (`"type": "module"`, no
   CommonJS export condition), so deck-harness-server has to be an ESM
   package too — building it with `tsc`'s `NodeNext` module mode would
   require explicit `.js` extensions on every relative import, for no benefit
   here.
2. This harness is explicitly meant to "run locally for many iterations,"
   not survive on a resource-constrained shared box the way track-web does —
   see track-web-architecture.md's "Deploy pipeline" section on the t4g.micro
   constraint that motivated its build step. Trading `tsx`'s slightly slower
   cold start for a simpler pipeline is the right call here.

`npm run typecheck` still runs `tsc --noEmit` so type errors are caught
without needing a build artifact.

## Architecture

See `docs/arch/pi-harness.md` (design rationale for this whole project) and
`docs/talks/deck-harness/planning.md` (deck-harness's specific design,
including the extension/tool code this repo implements) before making
structural changes. A few points worth calling out because the
implementation intentionally diverges from those docs' sketches:

- **No self-HTTP.** The planning doc's presentation-bridge sketch calls out
  to an "editor API" over `fetch("http://localhost:3001/...")`. Since
  everything actually runs in one process (the whole point of using the pi
  SDK instead of RPC mode — see pi-harness.md), `presentation-bridge.ts`
  calls `editorStore` directly instead.
- **Per-session permission-gate.** The planning doc's approval-flow sketch
  uses one module-level `pending` Map, which would cross-wire concurrent
  chat sessions. `permission-gate.ts` is a factory
  (`createPermissionGateExtension`) instantiated per session in
  `session-store.ts`, closing over that session's own `requestApproval`
  callback.
- **No `packages/` tier yet.** pi-harness.md's "Suggested structure"
  explicitly says not to design the shared `packages/` tier up front — build
  it "incrementally as a second harness makes the shared surface obvious."
  With one harness so far, auth/config code lives directly in
  `deck-harness-server`/`client-deck`. When a second harness appears, look
  for real duplication (auth, a dev-ports registry, the extension-loading
  glue) before extracting anything.
- **In-memory auth, not SQLite.** track-web's cookie-session model is
  reused (opaque token, only its hash stored server-side — see
  `deck-harness-server/src/auth.ts`), but the session table is an in-memory
  `Map`, not SQLite. This harness has exactly one user and one process, so a
  restart just means logging in again; that's a fine trade for not needing a
  database at all.
- **`sessionId` = auth token.** The `sessionId -> AgentSession` map in
  `session-store.ts` is keyed by the browser's auth session token, so one
  login gets one long-lived `AgentSession` reused across WebSocket
  reconnects, disposed on logout.

### Agent sandboxing

The pi `AgentSession`'s `cwd` (where its `bash`/`write`/`edit` tools operate,
and where `.pi/skills/` + `AGENTS.md` are discovered from) is **not** the
server source tree. It's `deck-harness-server/data/workspace/`
(gitignored, runtime-only), seeded on first run from
`deck-harness-server/templates/agent-workspace/` (committed — that's where
to edit the default `AGENTS.md` / `SKILL.md`). See `agent-workspace.ts`.
The permission-gate extension's path jail enforces that `write`/`edit` can't
escape this directory regardless.

## Deployment

- **Local dev**: `npm run dev` + `npm run dev:client-deck`, or
  `./dev-local.sh` inside tmux. No Caddy needed — Vite proxies `/api` and
  `/ws` straight to deck-harness-server.
- **NUC / always-on local box**: `server-deploy.sh` + `ecosystem.config.cjs`
  + `Caddyfile` are set up but not required day-to-day — see the comments in
  each file. This harness is meant to run **without exposure to the public
  internet** (unlike track-web's `branam.us` subdomains): the
  `bash`/`write`/`edit` tool surface is a materially bigger blast radius than
  anything track-web exposes publicly, per pi-harness.md's security section.
  `Caddyfile`/`Caddyfile.local` here are LAN-hostname conveniences, not
  public TLS termination — no wildcard DNS, no automatic Let's Encrypt.
- Unlike track-web, there's no push-to-`main` webhook. `server-deploy.sh` is
  meant to be run by hand over SSH on the deploy box.

> **Keep in sync:** when adding a second harness (its own
> `<name>-harness-server/` + `client-<name>/` pair per pi-harness.md), update
> together: root `package.json` (workspaces + `dev:*`/`build:*` scripts),
> `vitest.config.mts` (`include` glob), `dev-local.sh`, `ecosystem.config.cjs`
> (new PM2 app entry), `Caddyfile`/`Caddyfile.local` (new block), and this
> file.

## Model auth

pi's `ModelRuntime` resolves credentials the normal pi way (`~/.pi/agent/auth.json`,
env vars, `pi login`) — see the "API Keys and OAuth" section of the installed
`@earendil-works/pi-coding-agent` package's `docs/sdk.md`. Nothing
harness-specific is required beyond having a working `pi` login on whatever
box runs deck-harness-server.
