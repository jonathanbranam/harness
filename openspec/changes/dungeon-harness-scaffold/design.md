## Context

This is the third harness in this repo, after `deck-harness-server`/`client-deck` and `introspect-harness-server`/`client-introspect`. Per `docs/dungeon-harness/phases/phase-01-harness-scaffold.md`, it deliberately mirrors `deck-harness-server`/`client-deck`'s shape exactly — auth, session-store, agent-workspace, permission-gate, websocket — and leaves out anything dungeon-tactics-specific (board tools land in phase 03, Gherkin tools in phase 05). See `CLAUDE.md`'s Architecture and Agent sandboxing sections for the patterns being reused, and `proposal.md` for why this phase is split out on its own.

## Goals / Non-Goals

**Goals:**
- Stand up `dungeon-harness-server` + `client-dungeon` as a working pair: login, chat, one long-lived `AgentSession` per login, jailed `bash`/`write`/`edit`.
- Reuse the deck harness's auth/session/permission-gate code shape as directly as possible rather than inventing new patterns.

**Non-Goals:**
- Any dungeon-tactics domain state (board, pieces, Gherkin scenarios) or tools — phases 03/05.
- A shared `packages/` tier — per `CLAUDE.md`'s "No `packages/` tier yet" decision, copy the auth/session-store/permission-gate code the same way `introspect-harness-server` copied it from `deck-harness-server`, rather than extracting a shared package now. Revisit only if real duplication across three copies becomes a maintenance problem.
- Production deployment hardening (PM2/Caddy entries are added for parity with the other two harnesses, but not exercised beyond that in this phase).

## Decisions

### Decision: Modify the existing `harness-auth` capability, not a new `dungeon-harness-auth`
**Rationale:** `harness-auth` already exists as the shared cookie-session capability (established by `deck-harness-scaffold`, already extended once by `introspect-harness-phase-01` to cover the introspection harness's routes). Adding a third "Dungeon harness routes are session-gated" requirement to that same spec follows the precedent actually set in this repo. The phase doc's suggested capability list (`dungeon-harness-auth`, `dungeon-agent-session`, `dungeon-tool-permission-gate`) predates that precedent; this design deviates from it only for the auth capability's name, not its substance — the auth code itself is still copied into `dungeon-harness-server/src/auth.ts` exactly like the other two harnesses' copies.
**Alternative considered:** A standalone `dungeon-harness-auth` capability, as literally suggested. Rejected as spec drift: it would describe the exact same contract as `harness-auth` a second time under a different name, splitting one behavior across two specs for no reason.

### Decision: Session-store has no domain-state broadcast (unlike deck's)
**Rationale:** `deck-harness-server`'s `session-store.ts`/`websocket.ts` thread a `requestRender` callback and broadcast shared `DeckState` because the deck harness already has deck/slide/object domain state to synchronize. This phase registers no dungeon-tactics tools and has no board state yet, so `dungeon-harness-server`'s session-store and websocket handler are closer in shape to `introspect-harness-server`'s: `getOrCreateSession(sessionId, callbacks)` closes only over `requestApproval`, and the WebSocket protocol is limited to `prompt`, `approval_response`, `history`, `agent_event`, `approval_required`, and `error`. Board-state broadcast and a render-request callback (mirroring deck's `slide_view`) are expected to land in phase 03 alongside the board tools that need them.
**Alternative considered:** Build the broadcast/render-callback plumbing now, unused, so phase 03 doesn't have to add it later. Rejected — per the phase doc's explicit goal of keeping this phase small, and because designing that plumbing before the board's actual state shape exists would mean guessing at it twice.

### Decision: Dev ports 4300 (server) / 5177 (client)
**Rationale:** Continues the existing per-harness port sequence: deck is 4100/5175, introspect is 4200/5176. Dungeon takes the next hundred/next-integer slot, keeping `Caddyfile`/`Caddyfile.local`/`dev-local.sh` additions mechanical.
**Alternative considered:** A shared `packages/config` dev-ports registry, as gestured at in `client-deck/vite.config.ts`'s comment. Rejected for this phase — still only worth introducing once a third client needs one badly enough to justify the extraction; noted here as one more data point toward that reaching the two-is-a-coincidence, three-is-a-pattern point, since this is that third client.

### Decision: `client-dungeon` starts from `client-deck`'s auth/chat/theme files verbatim, minus canvas-specific pieces
**Rationale:** `AuthGuard`, `useAuth`, `useTheme`, `LoginPage`, `ChatPanel`, `ApprovalDialog`, and `api.ts`'s `authApi` have no deck-specific content — they're pure auth/chat/theme scaffolding already proven across two harnesses. `client-dungeon` copies them with branding swapped (title text, `localStorage` key prefix) and a `useDungeonSocket` hook trimmed from `useDeckSocket`: keep the WebSocket lifecycle, `prompt`/`agent_event`/`approval_required`/`approval_response`/`error` handling and transcript-building logic; drop everything deck-state-specific (`DeckState`, `selection`, `object_update`, shape/image/deck/slide messages, `canvasRef`/render-request handling).
**Alternative considered:** Scaffold `client-dungeon` from scratch. Rejected — `client-deck`'s auth/chat/theme code is already the validated pattern this phase is explicitly told to mirror; rewriting it would just risk introducing small behavioral drift for no benefit.

## Risks / Trade-offs

- **Risk:** Copying auth/permission-gate/session-store code a third time (rather than sharing it) means a future security fix to one harness's copy could be missed in the other two. → Mitigation: this is the same trade-off `introspect-harness-server` already accepted per `CLAUDE.md`; if a real fix is needed, apply it to all three copies and treat that repetition as the trigger for finally extracting a shared `packages/` tier.
- **Risk:** Building `dungeon-agent-session`/`dungeon-tool-permission-gate` without any board-state broadcast could mean phase 03 has to restructure `session-store.ts`/`websocket.ts` rather than just extend them. → Mitigation: deck's `session-store.ts` shape (a `callbacks` object mutated via `rebind`) is a known-working pattern for adding a second callback later; phase 03 can follow it directly instead of inventing something new.

## Migration Plan

Not applicable — this is a new, independent harness pair with no existing users or data to migrate.
