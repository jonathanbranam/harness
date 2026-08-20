> # ⛔ STOPPED — superseded work, do not implement
>
> **This plan is stopped and has been fully backed out** (2026-08-18). The
> Gherkin-authoring dungeon-harness approach it belongs to put the LLM in
> the referee's chair for game rules, and the harness was never usable as a
> design tool. See [`../STATUS.md`](../STATUS.md) for why, what landed, and
> what happens to each piece, and [`../backout-plan.md`](../backout-plan.md)
> for the removal plan.
>
> **The replacement is the harness rebuild**
> ([`../harness-rebuild/phase-plan.md`](../harness-rebuild/phase-plan.md), the
> plan of record) — a design bench that plays a board through the real engine.
> Phases 1–4 shipped 2026-08-19. Its rules layer, a declarative unit language
> ([`../turn-machines/README.md`](../turn-machines/README.md)), is **still
> under evaluation and not approved**; only a scoped slice is planned, as
> phase 5.
>
> Kept for historical context only. The **Status** line below records what
> actually landed before the stop.

# Phase 01 — Harness scaffold

**Repo:** `harness`
**Depends on:** none
**Blocks:** 03, 05 (and transitively 06, 07, 08)

**Status:** ✅ **Complete** — archived OpenSpec change `2026-08-16-dungeon-harness-scaffold`.
**Disposition:** **KEEP.** Auth, session store, jailed agent workspace and chat UI are
substrate-independent and carry over to the rebuilt harness.

## Goal

Stand up `dungeon-harness-server` + `client-dungeon` as a working third
harness pair — auth, one long-lived `AgentSession` per login, a
self-contained agent workspace, a minimal chat UI — with **no
dungeon-tactics-specific tools yet**. This phase proves the scaffold in
isolation; board tools (03) and Gherkin tools (05) are deliberately left
out so this stays small. (The original `deck-harness-scaffold` change
bundled its first bridge extension in with the scaffold — this phase
splits that apart on purpose, per the instruction to keep phases small.)

## Concrete steps

Mirrors `deck-harness-server`/`client-deck`'s shape exactly (see
`CLAUDE.md`'s Architecture and Agent sandboxing sections):

- **Keep-in-sync updates**: add `dungeon-harness-server` + `client-dungeon`
  to root `package.json` workspaces, `dev:dungeon-server`/
  `dev:dungeon-client`/`build:client-dungeon` scripts; `vitest.config.mts`
  include glob; `ecosystem.config.cjs` PM2 entry; `Caddyfile`/
  `Caddyfile.local` block; `dev-local.sh` tmux panes; this repo's
  `CLAUDE.md`.
- **Auth**: cookie-session model copied from `deck-harness-server/src/
  auth.ts` + `src/routes/auth.ts` — opaque token, bcrypt hash, in-memory
  session `Map`, `hash-password` script.
- **`session-store.ts`**: `sessionId` (= auth token) → `AgentSession` map,
  one long-lived session per login, disposed on logout.
- **`agent-workspace.ts`**: self-contained workspace at
  `dungeon-harness-server/data/workspace/` (gitignored), seeded from
  `templates/agent-workspace/AGENTS.md`.
- **`pi-extensions/permission-gate.ts`**: per-session factory (not a
  module-level `pending` map — see CLAUDE.md's note on why), path-jailed to
  the workspace directory.
- **`websocket.ts`**: streams `AgentSession` events to the browser, same
  shape as the existing two harnesses.
- **`client-dungeon`**: Vite/React scaffold — login page, `AuthGuard`,
  `useAuth`/`useTheme` hooks, a bare chat panel. Can start from
  `client-deck`'s equivalents with branding swapped; no board canvas yet.
- No tools registered beyond whatever pi ships by default (`bash`/`write`/
  `edit`, jailed to the workspace). Dungeon-specific tools land in 03/05.

## Deliverable / definition of done

Log in via browser, chat with the agent, agent can `bash`/`write`/`edit`
inside its own jailed workspace and nothing else. `npm run typecheck` and
`npm test` pass with the new workspaces included.

## Suggested OpenSpec capabilities

`dungeon-harness-auth`, `dungeon-agent-session`,
`dungeon-tool-permission-gate` — mirrors `deck-harness-scaffold`'s
non-presentation-specific spec split, as one change.
