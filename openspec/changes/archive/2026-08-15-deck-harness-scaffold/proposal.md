## Why

track-web's architecture (see `docs/arch/track-web-architecture.md`) runs every client app through one shared, stateless Hono process on a resource-constrained box. A pi-coding-agent harness needs the opposite: a long-lived, stateful, in-process agent runtime with `bash`/`write`/`edit` tool execution — something that process has never had and shouldn't (`docs/arch/pi-harness.md`). This change stands up `harness/` as that separate project and builds its first concrete harness — live, chat-driven presentation editing — to validate the pattern (Hono + pi SDK + WebSocket + browser-mediated approvals) before any second harness reuses it.

## What Changes

- New `harness/` npm-workspaces monorepo, independent of track-web, with two workspaces: `deck-harness-server` and `client-deck`. No shared `packages/` tier yet — deferred until a second harness makes the shared surface obvious, per pi-harness.md.
- `deck-harness-server`: Hono + `@hono/node-ws`, single-user cookie-session auth (in-memory, bcrypt password hash), a `sessionId -> AgentSession` map keyed by the auth token, and a WebSocket protocol that forwards pi's event stream to the browser and routes prompts/selection/approvals back.
- Two pi extensions, loaded as in-process `extensionFactories` (not file-discovered) so they can close over per-session server state:
  - `permission-gate`: static bash blocklist, a path jail scoping `write`/`edit` to the agent's sandboxed workspace, and browser-mediated interactive approval for `bash`/`write`/`edit`.
  - `presentation-bridge`: registers `presentation_get_state`, `presentation_update`, and `presentation_select_by_text` tools against an in-memory deck store, plus a `before_agent_start` hook that injects the current selection into context every turn.
- The agent's `cwd` is a sandboxed, gitignored `data/workspace/` directory, seeded on first run from a committed `templates/agent-workspace/` (default `AGENTS.md` + a `presentation` skill).
- `client-deck`: Vite + React 19 + React Router 7 + Tailwind 4. Login page, a chat panel that renders streamed assistant text and tool-call status, a click-to-select deck canvas, and an approval dialog.
- Ops scaffolding present but optional for local iteration: `dev-local.sh` (tmux), `Caddyfile`/`Caddyfile.local` (LAN-only — this harness is meant to run without public internet exposure, unlike track-web's `branam.us` subdomains), `ecosystem.config.cjs` (PM2), and `server-deploy.sh`/`scripts/build-deploy.sh` for optional deployment to an always-on local box (e.g. a NUC).
- Unit tests for the deck store and the bash blocklist regex; typecheck, test, and production client build all verified green; the full auth -> WebSocket -> extension-loading -> tool-registration path smoke-tested live (only the final model call is untested, since it needs a `pi login` this sandbox doesn't have).

## Capabilities

### New Capabilities
- `harness-auth`: single-owner password login, cookie-session validation gating all API and WebSocket routes, logout.
- `deck-agent-session`: per-login `AgentSession` lifecycle and the WebSocket protocol that streams prompts, agent events, and deck-state updates between browser and server.
- `presentation-editing`: the tools that let pi read and mutate the live deck (position, size, text, fill color, font size, grid layout, text search) and the browser canvas that shares that state.
- `tool-permission-gate`: the defense-in-depth policy for `bash`/`write`/`edit` — static blocklist, path jail, and interactive browser approval.

### Modified Capabilities
<!-- none: this is a new project, nothing existing to modify -->

## Impact

- **New repo root**: `harness/` (separate from `track-web/`; no changes to track-web).
- **New dependencies**: `@earendil-works/pi-coding-agent`, `hono`, `@hono/node-server`, `@hono/node-ws`, `bcrypt`, `typebox` (server); `react`, `react-dom`, `react-router-dom`, `tailwindcss` (client).
- **Affected systems**: none outside `harness/` — this is greenfield.
- **Deferred/future**: chat history isn't replayed on WebSocket reconnect (documented limitation in `websocket.ts`); no persistence for deck state or sessions across restarts; no shared `packages/` tier until a second harness exists.
