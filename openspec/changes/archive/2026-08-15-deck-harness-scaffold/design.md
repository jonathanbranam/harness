## Context

See `proposal.md` - Why for motivation. Two source docs constrain the approach: `docs/arch/pi-harness.md` (why this is a separate project from track-web, and what to reuse from it) and `docs/talks/deck-harness/planning.md` (the original sketch for this specific harness). Several implementation decisions below deliberately diverge from that sketch once real constraints showed up — each is called out with why.

## Goals / Non-Goals

**Goals:**
- Validate the SDK-in-process pattern (Hono + pi `AgentSession` + WebSocket + browser-mediated approvals) end to end, so a second harness can copy it with confidence.
- Keep the whole thing runnable by one person, locally, with no database and minimal ops ceremony.

**Non-Goals:**
- Multi-user support, or anything beyond a single owner.
- Deck persistence across restarts, or multi-slide decks (both flagged as open questions in the planning doc; not needed to validate the pattern).
- A shared `packages/` tier — see the Decisions section.

## Decisions

### deck-harness-server ships via `tsx`, not a `tsc` build
`@earendil-works/pi-coding-agent` publishes ESM-only (no CommonJS export condition), so deck-harness-server has to be an ESM package. Building that with `tsc`'s `NodeNext` mode would require explicit `.js` extensions on every relative import for no real benefit. Alternative considered: compile with `tsc` (`module: NodeNext`) to mirror track-web's pattern exactly — rejected because this harness explicitly doesn't share track-web's resource-constrained-shared-box constraint that motivated that pattern (see `docs/arch/track-web-architecture.md` - Deploy pipeline), so the simpler pipeline wins.

### Extensions are in-process `extensionFactories`, not file-discovered `.pi/extensions/*.ts`
`permission-gate` and `presentation-bridge` are built as factory functions (`createPermissionGateExtension(opts)`, `presentationBridge`) passed to `DefaultResourceLoader({ extensionFactories: [...] })` from `session-store.ts`, rather than living as standalone files under `.pi/extensions/` the way the planning doc sketches. This lets `permission-gate` close over a *per-session* `requestApproval` callback bound to that connection's WebSocket. Alternative considered: the planning doc's file-based extension with one module-level `pending` approval map — rejected because it would cross-wire concurrent chat sessions' approval prompts.

### presentation-bridge calls the deck store directly, not over HTTP
The planning doc's sketch has the presentation-bridge extension `fetch()` a local "editor API" on another port. Since everything actually runs in one process — the whole reason to use the SDK instead of RPC mode — `presentation-bridge.ts` imports `editorStore` and calls it directly. No port to configure, no failure mode where the editor API is unreachable.

### Deck state is one process-global store, not per-session
`editorStore` (in `editor-state.ts`) is a single module-level singleton, not scoped per `AgentSession`/WebSocket connection. This is deliberate: the harness is single-user, and the point of the shared canvas is that every open tab and the agent are looking at the *same* deck. A per-session store would mean two tabs (or the agent vs. the user) editing different decks, which defeats the "user selects, pi edits, canvas updates live" loop described in the planning doc's Goals.

### Auth sessions are in-memory, not SQLite
track-web's session model (opaque token, only its SHA-256 hash stored server-side) is reused as-is, but backed by a plain `Map` instead of the `sessions` table `docs/arch/track-web-architecture.md` describes. Alternative considered: reuse SQLite for consistency with track-web — rejected because this harness has exactly one user and one process; the only thing a database would buy is surviving a restart without re-entering the password, which isn't worth the added dependency and migration machinery for a tool meant to be restarted often during iteration (`tsx watch`).

### `sessionId` for the AgentSession map is the auth token itself
`session-store.ts`'s `Map<sessionId, AgentSession>` is keyed directly by the caller's session cookie token rather than a separately generated id. One login therefore maps to exactly one `AgentSession`, and logout is a natural place to dispose it (`routes/auth.ts` calls `disposeSession(token)` on logout). Alternative considered: a separate `deckSessionId` cookie decoupled from auth — rejected as unneeded complexity for a single-user tool where "one session" and "one login" are the same concept.

### Agent `cwd` is a seeded, sandboxed workspace directory
The pi `AgentSession`'s `cwd` — where its `bash`/`write`/`edit` tools operate and where `.pi/skills/` + `AGENTS.md` are discovered from — is `deck-harness-server/data/workspace/` (gitignored, runtime-only), seeded on first run from a committed `templates/agent-workspace/`. This keeps the server's own source tree out of the agent's reach independent of the permission-gate's path jail (defense in depth), and keeps the default `AGENTS.md`/`SKILL.md` versioned in git without the *live*, agent-writable copy being committed.

### No `packages/` tier yet
`docs/arch/pi-harness.md`'s "Suggested structure" explicitly says not to design the shared-package tier up front. With exactly one harness so far, auth/config code lives directly in `deck-harness-server`/`client-deck`. Revisit only once a second harness makes the actual duplication (auth, a dev-ports registry, extension-loading glue) visible.

## Risks / Trade-offs

- **[Risk]** In-memory auth/deck/AgentSession state means a server restart logs everyone out and resets the deck to its seed objects. → **Mitigation**: acceptable for a single-user local iteration tool; flagged explicitly in `proposal.md` - Impact rather than hidden.
- **[Risk]** WebSocket reconnect doesn't replay chat history into the browser transcript (the client intentionally doesn't parse pi's internal `AgentMessage` content shape, which isn't part of the documented SDK surface for this purpose). → **Mitigation**: the underlying `AgentSession` and its conversation state are unaffected — only the browser's rendered transcript resets on reconnect. Revisit once/if replaying history becomes annoying in practice.
- **[Risk]** The static bash blocklist and path jail are pattern-based, not a real sandbox — a sufficiently adversarial prompt could still find gaps. → **Mitigation**: this harness is designed to run for a single trusted owner, not exposed to the public internet (see `Caddyfile`'s comments); the gates are a safety net against mistakes, not a security boundary against a hostile user, matching the planning doc's own "Important caveats" section.
- **[Risk]** `editorStore` being process-global means there's no isolation between browser tabs — one tab's edits are visible to all. → **Mitigation**: this is the intended behavior (see Decisions above), not a bug, but worth remembering if a future harness wants per-user or per-document isolation.

## Migration Plan

Greenfield project; nothing to migrate. Two ways to run it, both already scaffolded:
1. **Local iteration** (primary, day-to-day): `npm run dev` + `npm run dev:client-deck`, no Caddy/PM2 involved.
2. **Always-on local box** (e.g. a NUC, optional/future): `npm run build`, `pm2 start ecosystem.config.cjs`, optionally `Caddyfile` for a stable LAN hostname. Deliberately no public DNS or TLS — see `Caddyfile`'s comments and `docs/arch/pi-harness.md`'s security section on why the tool-execution surface shouldn't be exposed to the internet.

Rollback, if a deploy misbehaves on the NUC: `git checkout` the previous commit and `pm2 restart ecosystem.config.cjs` — no data migration involved since there's no persisted state to roll back.

## Open Questions

Carried over from `docs/talks/deck-harness/planning.md`'s own "Open questions," still unresolved and safely deferrable without changing this change's specs or approach:
- Should deck state persist across restarts (file, SQLite) instead of resetting to seed objects each time?
- Should pi sessions persist to disk (`SessionManager.create`) instead of `SessionManager.inMemory`, so a server restart doesn't lose conversation history?
- Is single-canvas sufficient long-term, or will multi-slide support be needed?
