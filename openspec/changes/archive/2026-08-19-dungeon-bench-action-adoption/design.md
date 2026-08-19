## Context

See `proposal.md`, and the audit at `docs/dungeon-harness/harness-rebuild/action-surface-plan.md`. The engine surface landed in the sibling repo as `2026-08-19-dungeon-engine-action-surface` and the game adopted it in `2026-08-19-dungeon-game-action-adoption`; the harness consumes the same source through its existing `file:` dependency, so there is nothing to publish or copy.

The bench's constraint is unchanged and is the reason this change exists: **the engine referees, never the agent.** The bench had been honouring that for movement and dishonouring it for aiming, not deliberately but because the engine had no aiming layer to defer to.

## Goals / Non-Goals

**Goals:**
- The designer and the agent aim exactly as a player does.
- Delete the bench's remaining rule reconstructions rather than improve them.
- Keep every affordance that makes the bench a design tool rather than a game.

**Non-Goals:**
- The telegraph window / turn sequencer. `runEnemyAi` still resolves moves and attacks in one step, which the audit records as a real divergence and the deferred change owns.
- Phase enforcement. The bench drives both sides out of sequence on purpose.
- Any change to setup — placement, relocation, HP setting, board generation stay direct edits, because a bench board is a scenario board and need not be a legal game setup.

## Decisions

### The control is action-then-tile, replacing four direction buttons

The designer picks Move or Attack, the board lights the engine's targets for that action, and a click on one commits it. This is the game's gesture. It also collapses two bench controls into one shape: movement used to be implicit (select a unit, tiles appear) while attacking was explicit (arm a direction, then click). Both are now explicit and identical.

### Unavailable actions stay on screen

Same reasoning as the game: a disabled Move carrying "The melee has no movement left this turn" answers a question the designer would otherwise have to infer from tiles that stopped appearing. The bench shows the unit's id beside it, so the engine's display-name phrasing loses nothing here.

### Hover previews the action

The bench has a mouse, which the game largely does not, so it can afford the preview the engine already computes: hovering a target paints the tiles the action would cover and reports what it would damage. This is the cheapest version of the "see the consequence before committing" idea the design session asked for, and it costs one engine call per hover.

### `threatTilesFrom` is deleted, not corrected

The bench's approximation walked the targeting band itself and documented that it ignored blocking. The engine's `threatTiles` does the same walk with blocking, so the local copy goes rather than being fixed — leaving a second implementation is how the two would drift again.

This changes what the overlay shows: a tile behind a blocker is no longer marked threatened. That is a behaviour change in the designer's favour, and the spec records it.

### The NPC-spent workaround is dropped

`attackSelected` marked a hand-driven NPC as having attacked, because `resolveNpcAction` does not (in the game, NPC attacks are telegraphs resolved at end of round, not turn actions). `commitAction` now does this, so the bench's copy goes.

### Wire shapes stay hand-mirrored

There is still no shared package spanning server and client (CLAUDE.md, "No `packages/` tier yet"), so `client-dungeon/src/bench/types.ts` continues to hand-mirror the server's shapes. `ActionOption` and `ActionPreview` join that list. The alternative — pulling the engine into the client build to import its types — would drag the whole engine into the browser bundle for two type declarations.

## Risks / Trade-offs

- **[Two clicks where there was one]** → Selecting a unit still lands on Move with its tiles lit, so moving is unchanged; only attacking gained an explicit step, and it replaces the step of choosing a direction.
- **[Hover previews could be chatty over the WebSocket]** → Preview is computed server-side but requested only on hover of an offered tile, and the response is small. If it proves noisy, the offered targets could carry their previews in the state push instead.
- **[The threat overlay gets smaller and may look like a regression]** → It is more accurate, not less; the spec scenario names the blocking case so the change is intentional and testable.
- **[Agent tool shape changes mid-session]** → `AGENTS.md` is updated in the same change, and the agent reads it at session start. Nothing persisted refers to the old shape.

## Migration Plan

None required. Bookmarks store board state and definition overrides, not actions, so saved positions load unchanged.
