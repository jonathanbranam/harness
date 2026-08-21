## Context

`dungeon-turn-sequencer` landed in `@repo/dungeon-engine`. Verified surface:

```ts
advance(state): { ok: true; state; step: SequencerStep } | { ok: false; reason }
nextAction(state): SequencerStep | null
advanceNpc(state, unitId): SequencerResult          // AI plans one named enemy
commitNpcTurn(state, unitId, move, attackTile?)     // host-authored plan — 3b
unplannedNpcs(state): string[]
plannedTelegraph(state, unitId): NpcAttackPlan | null
amendTelegraph(state, unitId, tile): SequencerResult // bench-only — 3b
setEngineMode('game' | 'bench')                      // defaults to 'game'

type SequencerStep =
  | { kind: 'plan-enemy'; unitId; action; attackPlan }
  | { kind: 'resolve-telegraph'; unitId; attack }
  | { kind: 'skip-telegraph'; unitId; attack }
  | { kind: 'phase-transition'; from: TurnPhase; to: TurnPhase }
```

The bench today pins `phase: 'player'` (`bench-store.ts:202`), sequences the
enemy turn itself in `planEnemyTurn`/`resolveTelegraphs`, and carries its own
guards — including refusing `endRound` while telegraphs are pending.

## Goals / Non-Goals

**Goals**

- The bench's enemy turn is the engine's round. No bench-side sequencing.
- The designer can see the phase and the next step, and step through the round
  one action at a time.
- Telegraphs are legible.

**Non-Goals**

- **Designer-authored plans.** `commitNpcTurn` and `amendTelegraph` exist in the
  engine but stay unused here — 3b.
- **Any change to `@repo/dungeon-engine`.** If this change wants an engine
  change, that is a finding to report, not to implement.

## Decisions

### `advance` is exposed both single-step and composite

`advance` performs exactly one step. That granularity is the point — it is what
makes the enemy phase a scrubbable interval rather than one jump — so the bench
exposes it directly as **Step**, paired with the `nextAction` display so the
designer can see what Step will do before pressing it.

Two composites are kept because pressing Step five times to plan five enemies is
tedious: **Plan enemy turn** (advance until the phase leaves `npc-move`) and
**Resolve telegraphs** (advance until the phase leaves `npc-attack`). These
preserve phase 1's two designer-visible steps.

### One frame per engine step, including inside composites

Each `advance` is its own timeline frame, even when a composite issues several.
The promise this phase inherits is that the designer can step back *into* the
enemy phase; a composite that commits one frame would collapse exactly the
interval being made inspectable.

`MAX_FRAMES` already bounds the timeline, and frames are cheap
(`GameState` is plain data). If five enemies per round proves noisy in practice
that is a UI grouping problem, not a reason to lose the states.

### The player → `npc-attack` transition stays host-owned

`advance` returns `null` during `player` and refuses. That is correct, not a
gap: ending your turn is a decision, not a rule, and the game does the same
thing — `handleConfirmEndTurn` sets `phase: 'npc-attack'` itself
(`DungeonTacticsGame.tsx:430`). The bench sets it the same way, from an **End
turn** control.

Every other transition comes from the engine.

### `endRound` as a bench operation is retired

The engine ends the round as the `npc-attack → npc-move` transition, after every
telegraph has resolved or been skipped. There is no path through the engine that
ends a round with telegraphs pending, so phase 1's `endRound` guard is not
reimplemented — it becomes unreachable rather than checked. `BenchStore.endRound`
and its control go away.

This removes the bench's ability to end a round arbitrarily without playing the
enemy turn. Accepted: that affordance existed because the bench had no real
round. Stepping back remains the way to abandon a planned turn.

### `setEngineMode('bench')` is called once at server startup

Not per session and not per board. 3a uses no bench-only operation, so nothing
here depends on it — but the call belongs with the process that is the bench,
and putting it in now means 3b's `amendTelegraph` does not arrive alongside a
mode bug. Set it where the server starts, and assert it in one test.

### Bookmarks saved before this change must be normalised on load

`saveBookmark` stores the whole `GameState` verbatim and `loadBookmark` commits
it back verbatim (`bench-store.ts:702-734`). A bookmark saved before this change
therefore carries `phase: 'player'` and **no** `npcPlannedThisRound` or
`npcPlansResolved` at all.

That is not cosmetic: `advance` reads `state.npcPlannedThisRound.includes(...)`,
so loading an old bookmark and pressing Step would throw on `undefined`. Every
bookmark on disk today predates this change, so this is the normal case, not an
edge one.

**Resolution:** normalise on load — default each missing round-progress field to
empty, and default a missing `phase` to `'player'`. Keep whatever phase a
bookmark does carry, so phase 2's promise that mid-play positions save and
restore keeps holding for bookmarks saved from here on.

### Telegraph rendering is replaced, not tinted

The current marker is a dark red X inset in the tile
(`BoardView.tsx:156`, stroke `#b91c1c`). It renders correctly and is still
nearly invisible at normal zoom — it was missed entirely on a first look at a
full-page screenshot during phase 1's verification.

The spec requires legibility over any terrain or structure fill **and** under a
reach/threat field on the same tile. That third condition is what rules out
"pick a brighter red": the fields already tint whole tiles, and a marker that
competes with them re-creates the muddy-wash problem phase 3 hit. Prefer a mark
that reads structurally rather than chromatically — outline plus fill contrast,
or a shape that survives being tinted — and check it against both field overlays
switched on.

## Risks / Trade-offs

**One frame per step could make the timeline noisy.** Five enemies plus
transitions is roughly seven frames per round where phase 1 had two. Accepted
above; watch it during browser verification and treat grouping as the fix if it
bites.

**Losing arbitrary `endRound` may annoy.** If a designer misses it, the answer is
that the round is now real — but this is the most likely piece of this change to
come back as feedback.

**The bench becomes phase-sensitive everywhere.** Placement, def tweaks, and
bookmarks were all written when the bench sat in `player` forever. Each needs
checking against a bench that moves through phases — particularly bookmarks,
which serialize `GameState` — see the bookmark decision above.

## Open Questions

None.
