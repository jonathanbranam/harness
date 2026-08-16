## Why

`dungeon-tactics` needs its own web-backed harness before any board tools (phase 03) or Gherkin tools (phase 05) can be built. Per `docs/dungeon-harness/phases/phase-01-harness-scaffold.md`, this phase stands up `dungeon-harness-server` + `client-dungeon` as a working third harness pair — auth, one long-lived `AgentSession` per login, a jailed agent workspace, a minimal chat UI — with no dungeon-tactics-specific tools yet, so the scaffold is proven in isolation before board/Gherkin tooling lands on top of it.

## What Changes

- Add `dungeon-harness-server/` and `client-dungeon/` npm workspaces, mirroring `deck-harness-server`/`client-deck`'s shape exactly (see `CLAUDE.md`'s Architecture and Agent sandboxing sections).
- Add cookie-session auth to `dungeon-harness-server`, reusing the existing opaque-token/bcrypt pattern (`deck-harness-server/src/auth.ts` + `src/routes/auth.ts`).
- Add `session-store.ts`: one long-lived pi `AgentSession` per login, keyed by the auth session token, disposed on logout.
- Add `agent-workspace.ts`: a self-contained, gitignored workspace at `dungeon-harness-server/data/workspace/`, seeded from `templates/agent-workspace/AGENTS.md`.
- Add `pi-extensions/permission-gate.ts`: a per-session factory (not a module-level `pending` map — see `CLAUDE.md`), path-jailed to the workspace directory, gating `bash`/`write`/`edit` behind browser approval.
- Add `websocket.ts` streaming `AgentSession` events to the browser, same message shape as the existing two harnesses.
- Add `client-dungeon`: Vite/React scaffold — login page, `AuthGuard`, `useAuth`/`useTheme` hooks, a bare chat panel, branding swapped from `client-deck`'s equivalents. No board canvas yet.
- Register no tools beyond pi's defaults (`bash`/`write`/`edit`, jailed to the workspace) — dungeon-specific tools land in phases 03/05.
- Keep-in-sync updates: root `package.json` workspaces + `dev:dungeon-server`/`dev:dungeon-client`/`build:client-dungeon` scripts, `vitest.config.mts` include glob, `ecosystem.config.cjs` PM2 entry, `Caddyfile`/`Caddyfile.local` blocks, `dev-local.sh` tmux panes, this repo's `CLAUDE.md`.

## Capabilities

### New Capabilities
- `dungeon-agent-session`: One long-lived pi `AgentSession` per authenticated browser session on `dungeon-harness-server`, streaming prompts and agent events over WebSocket. Mirrors `deck-agent-session`/`introspect/agent-session` minus deck-state broadcast and render-request (no dungeon-tactics tools yet).
- `dungeon-tool-permission-gate`: Per-session permission-gate extension for `dungeon-harness-server`, path-jailing `write`/`edit` to the agent workspace and gating `bash`/`write`/`edit` behind browser-routed approval. Mirrors `tool-permission-gate`, instantiated for the dungeon harness.

### Modified Capabilities
- `harness-auth`: Extend the existing cookie-session auth pattern to cover `dungeon-harness-server`'s routes and its `/ws` endpoint, the same way it was already extended to cover the introspection harness. No change to the auth contract itself.

## Impact

- New server workspace `dungeon-harness-server/`.
- New client workspace `client-dungeon/`.
- New pi extension `dungeon-harness-server/src/pi-extensions/permission-gate.ts`.
- Reuses auth primitives (`auth.ts`, `routes/auth.ts`) copied from `deck-harness-server`.
- Root-level workspace/script/tooling files updated per the "Keep in sync" list in `CLAUDE.md`.
- Adds a new PM2 app, `Caddyfile`/`Caddyfile.local` block, and dev ports (deployment details land alongside/after later phases, matching how the deck/introspect harnesses were rolled out).
