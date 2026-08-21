# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`harness` is a **separate, sibling project to track-web** (see
`docs/arch/pi-harness.md` for why) that hosts web-backed harnesses running
the `pi` coding agent (`@earendil-works/pi-coding-agent`) in-process behind a
browser UI. The first harness is `deck-harness-server` + `client-deck`, a
live presentation-editing chat UI — see `docs/talks/deck-harness/planning.md`
for its design. The second harness is `introspect-harness-server` +
`client-introspect`, a browser chat that drives an in-process `AgentSession`
and visualizes the agent's context window. A third harness,
`dungeon-harness-server` + `client-dungeon`, is a **design bench for the
Dungeon Tactics game**: a board played through the real game engine, with the
agent driving it alongside the designer. Its original feature work was backed
out and it is being rebuilt — see the note below.

> **⛔ History: the dungeon harness's original feature work was backed out**
> (2026-08-18, complete). The Gherkin-authoring approach put the LLM in the
> referee's chair for game rules and never produced a usable design tool; the
> freehand board tools let it draw a board it had no way to be right about. The
> Gherkin authoring core, baseline/changeset surface, freehand board tools,
> board state, and `BoardCanvas` are **deleted** and are not coming back.
> `docs/dungeon-harness/STATUS.md` is the decision record and
> `backout-plan.md` the executed removal plan.
>
> The harness is being **rebuilt** around simulation driven by the real game
> engine, now shipped as `@repo/dungeon-engine` in the sibling track-web repo
> (`packages/dungeon-engine`, consumed here over a relative `file:` path).
> Design and build order live in `docs/dungeon-harness/harness-rebuild/`;
> **`phase-plan.md` is the plan of record.**
>
> **Phases 1–4 are built and browser-verified** (2026-08-19): the hand-driven
> bench, bookmarks, reach/threat overlays, and the transport strip — see
> `dungeon-harness-server/src/bench/`, `src/pi-extensions/bench-bridge.ts`, and
> `client-dungeon/src/bench/`. The **action surface** also landed: the engine
> owns what a unit may do and whether a pick is legal, so **the harness derives
> no game rules of its own** — every bench and agent-tool call is a thin wrapper
> over an engine function. Preserve that invariant; it is the lesson the
> previous effort died on.
>
> **The turn sequencer landed on 2026-08-20**, ahead of phase 5: the engine owns
> the round (`packages/dungeon-engine/src/sequencer.ts` in track-web), the bench
> runs on it and shows the phase and the next step, and the designer can author
> enemy turns by hand or hand them to the AI. One deliberate rule-break lives
> here: a locked telegraph can be retargeted mid-round, retroactively — gated by
> an engine mode that defaults to `'game'` and refuses unless the host opts in.
> `docs/dungeon-harness/harness-rebuild/turn-sequencer-plan.md` is the plan;
> phases 4 (the game host adopting it) and 5 (guards) remain.
>
> **Rebuild phase 5 (scoped turn machine) is next after that, and not started.** Its rules layer,
> `docs/dungeon-harness/turn-machines/`, is **under evaluation and not
> approved** — do not implement from it without an explicit go-ahead.
> `docs/dungeon-harness/proposal.md` and `phases/` are historical — do not
> implement from them either.

See
`docs/arch/track-web-architecture.md` for the patterns this project
deliberately reuses (monorepo shape, Hono, Vite/React/Tailwind,
cookie-session auth, Caddy per-subdomain pattern, PM2).

## Commands

```bash
# Development (run from repo root in separate terminals — or use
# ./dev-local.sh inside a tmux session to split panes for you)
npm run dev:deck-server        # deck-harness-server (tsx watch)
npm run dev:deck-client        # client-deck (Vite)
npm run dev:introspect-server  # introspect-harness-server (tsx watch)
npm run dev:introspect-client  # client-introspect (Vite)
npm run dev:dungeon-server     # dungeon-harness-server (tsx watch)
npm run dev:dungeon-client     # client-dungeon (Vite)

# Build (clients only — servers ship via tsx, see below)
npm run build                # builds client-deck, client-introspect, and client-dungeon
npm run build:client-deck
npm run build:client-introspect
npm run build:client-dungeon

# Production (after `npm run build`)
npm run start                # runs deck-harness-server, which also serves
                              # client-deck/dist as the SPA
npm run start:introspect     # runs introspect-harness-server, which also serves
                              # client-introspect/dist as the SPA
npm run start:dungeon        # runs dungeon-harness-server, which also serves
                              # client-dungeon/dist as the SPA

# Typecheck (no emit)
npm run typecheck

# Test
npm test

# Utilities
npm run hash-password -w deck-harness-server -- 'your-password'
npm run hash-password -w introspect-harness-server -- 'your-password'
npm run hash-password -w dungeon-harness-server -- 'your-password'
```

No lint is configured.

## OpenSpec: archive a change as soon as its work is verified

This repo plans work as OpenSpec changes under `openspec/changes/`. **When a
change's tasks are done and the work is verified, sync its specs and archive it
in the same sitting:**

```bash
openspec validate <change-name> --strict
openspec archive <change-name> -y      # syncs the delta into openspec/specs/
```

Do not leave verified changes sitting open. This gets more important the more
changes stack up, and the reason is concrete rather than tidiness:

- **A delta is written against the main spec as it stands.** Archiving is what
  folds a delta in. Two unarchived changes touching the same capability are both
  written against the *pre-both* spec, so whichever archives second is missing
  whatever the first added — and `openspec archive` refuses it: *"current spec
  contains scenario(s) not present in the modified block."* You then have to go
  back and reconcile deltas by hand, which is exactly the drift the format
  exists to prevent.
- **A `MODIFIED` requirement replaces the whole block**, scenarios included. The
  longer a change waits, the more likely the requirement it modifies has moved
  underneath it.
- **`openspec/specs/` is the answer to "what does this system do today."** An
  unarchived pile means that answer is stale, and the next change gets planned
  against the wrong picture.

If a change turns out to be *partly* verified, archive nothing and say what is
outstanding — an archived change asserts the work is done and checked.

## Never kill or restart the dev servers

The user keeps a server + client instance running at all times, each in its
own terminal, for **every app in this workspace** — `deck-harness-server` +
`client-deck`, `introspect-harness-server` + `client-introspect`,
`dungeon-harness-server` + `client-dungeon`, and any future harness
server/client pair added to this monorepo (see "Keep in sync" below). Do
**not** run `lsof -ti:<port> | xargs kill`, `pkill`, or otherwise stop these
processes, and do not start a second copy of a server or client that's
already running (check `lsof -i:<port>` first if unsure — deck-harness-server
defaults to port 4100, client-deck to 5175; see each `vite.config.ts`/`.env`
for other harnesses' ports). If a server needs to be
restarted (e.g. to pick up a changed `.env` value that `tsx watch` won't
hot-reload), **ask the user to restart it** rather than doing it yourself.

## Verifying UI changes: use playwright-cli

The globally installed `@playwright/cli` (`playwright-cli` on PATH) is
available for driving a real browser against the already-running dev
clients — use it to verify UI changes instead of asking the user to click
through them by hand. Typical flow: `playwright-cli open
http://localhost:5175` (client-deck) or the equivalent introspect-client
port, log in (the harness's cookie-session auth — ask the user for the
password if you don't already have it, don't guess), then `snapshot`/
`click`/`fill`/`screenshot` as needed. See `playwright-cli --help` for the
full command list. This still runs against the user's already-running dev
server per "Never kill or restart the dev servers" above — don't start a
second client instance.

## Why the harness servers ship via `tsx`, not `tsc`

Every other Node service in this family (track-web) builds with `tsc` to
`out/` and runs the compiled JS in production. The harness servers instead
run `tsx src/index.ts` directly in both dev and prod (see each server's
`package.json`). Two reasons this diverges from track-web's pattern
deliberately, not by oversight:

1. `@earendil-works/pi-coding-agent` ships ESM-only (`"type": "module"`, no
   CommonJS export condition), so the servers have to be ESM packages too —
   building them with `tsc`'s `NodeNext` module mode would require explicit
   `.js` extensions on every relative import, for no benefit here.
2. These harnesses are explicitly meant to "run locally for many iterations,"
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
  With two harnesses now in the repo, auth/config code still lives directly in
  each `*-harness-server`/`client-*` pair. Look for real duplication (auth, a
  dev-ports registry, the extension-loading glue) before extracting anything.
- **In-memory auth, not SQLite.** track-web's cookie-session model is
  reused (opaque token, only its hash stored server-side — see
  `deck-harness-server/src/auth.ts`), but the session table is an in-memory
  `Map`, not SQLite. This harness has exactly one user and one process, so a
  restart just means logging in again; that's a fine trade for not needing a
  database at all.
- **`sessionId` = auth token.** The `sessionId -> AgentSession` map in each
  server's `session-store.ts` is keyed by the browser's auth session token, so
  one login gets one long-lived `AgentSession` reused across WebSocket
  reconnects, disposed on logout.

### Agent sandboxing

The pi `AgentSession`'s `cwd` (where its `bash`/`write`/`edit` tools operate,
and where `.pi/skills/` + `AGENTS.md` are discovered from) is **not** the
server source tree. Each server has its own workspace:

- `deck-harness-server/data/workspace/` (gitignored, runtime-only), seeded from
  `deck-harness-server/templates/agent-workspace/`.
- `introspect-harness-server`'s workspace lives **outside the repo tree**, at
  `~/.local/share/introspect-harness/workspace/` by default (override via
  `INTROSPECT_WORKSPACE_DIR`), seeded from
  `introspect-harness-server/templates/agent-workspace/`. It's deliberately
  not repo-nested: an ancestor-walking CLI invoked via `bash` (e.g. `openspec`,
  which resolves its project root by walking up from `cwd` rather than taking
  a path argument) must not be able to walk up into this repo's own
  `openspec/`/`.git`. The seed template also ships its own pre-initialized
  `openspec/` directory so such tools resolve at the workspace root itself
  and never need to walk up at all. A pre-existing
  `introspect-harness-server/data/workspace/` from before this change is
  orphaned (gitignored, no longer read or written) and safe to delete by
  hand.

See each server's `agent-workspace.ts`. The deck harness's permission-gate
extension's path jail enforces that `write`/`edit` can't escape that
server's workspace directory; the introspect harness has an equivalent
`permission-gate.ts` that also jails `read` (no interactive approval UI to
fall back on) and pattern-blocks `bash` escapes (`cd`, absolute paths, `..`
traversal outside the workspace root).

introspect-harness-server's chat sessions persist to disk via
`SessionManager.create(cwd)`, in the same `.jsonl` layout the pi SDK already
uses for interactive `pi` CLI sessions: `~/.pi/agent/sessions/<encoded-cwd>/`.
Session logs survive `disposeSession` and server restarts (no rotation), so
a sandbox-escape attempt or other unexpected tool behavior can be reviewed
after the fact by inspecting the relevant `.jsonl` file.

## Deployment

- **Local dev**: run the server and client for the harness you're working on
  (e.g. `npm run dev:introspect-server` + `npm run dev:introspect-client`), or use
  `./dev-local.sh` inside tmux to spin up all four panes at once. No Caddy
  needed — Vite proxies `/api` and `/ws` straight to the corresponding
  server.
- **NUC / always-on local box**: `server-deploy.sh` + `ecosystem.config.cjs`
  + `Caddyfile` are set up but not required day-to-day — see the comments in
  each file. These harnesses are meant to run **without exposure to the public
  internet** (unlike track-web's `branam.us` subdomains): the
  `bash`/`write`/`edit` tool surface is a materially bigger blast radius than
  anything track-web exposes publicly, per pi-harness.md's security section.
  `Caddyfile`/`Caddyfile.local` here are LAN-hostname conveniences, not
  public TLS termination — no wildcard DNS, no automatic Let's Encrypt.
- Unlike track-web, there's no push-to-`main` webhook. `server-deploy.sh` is
  meant to be run by hand over SSH on the deploy box.

> **Keep in sync:** when adding a new harness (its own
> `<name>-harness-server/` + `client-<name>/` pair per pi-harness.md), update
> together: root `package.json` (workspaces + `dev:*`/`build:*` scripts),
> `vitest.config.mts` (`include` glob), `dev-local.sh`, `ecosystem.config.cjs`
> (new PM2 app entry), `Caddyfile`/`Caddyfile.local` (new block), and this
> file. `dungeon-harness-server` + `client-dungeon` (ports 4300/5177) is the
> most recent harness added this way.

## Model auth

pi's `ModelRuntime` resolves credentials the normal pi way (`~/.pi/agent/auth.json`,
env vars, `pi login`) — see the "API Keys and OAuth" section of the installed
`@earendil-works/pi-coding-agent` package's `docs/sdk.md`. Nothing
harness-specific is required beyond having a working `pi` login on whatever
box runs a harness server.

See [`docs/pi-setup.md`](docs/pi-setup.md) for adding custom models via
`~/.pi/agent/models.json`, the `input: ["text", "image"]` declaration a
model needs before an image tool result (e.g. deck-harness's `slide_view`)
will actually reach it, and a restart gotcha specific to editing that file.
