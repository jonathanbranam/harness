## Context

3a put the bench on the engine's round: it steps `advance`, shows the phase and
`nextAction`, and forwards engine refusals. Enemy turns are still authored only
by the AI.

The engine surface this change adds to the bench, all already shipped:

```ts
commitNpcTurn(state, unitId, move: NpcMoveChoice, attackTile?): SequencerResult
plannableAttacks(state, unitId, move: NpcMoveChoice): Tile[]
validMoveDests(state, unitId): Tile[]
advanceNpc(state, unitId): SequencerResult        // AI plans one named enemy
unplannedNpcs(state): string[]
amendTelegraph(state, unitId, tile): SequencerResult   // bench-only
setEngineMode('bench')                                  // already called at startup

type NpcMoveChoice = { kind: 'stay' } | { kind: 'move'; toCol; toRow }
```

`plannableAttacks` was added for this change
(`track-web:dungeon-engine-plannable-attacks`): `commitNpcTurn` validates an
attack from the enemy's **post-move** position, and without a query for that set
a designer would pick a destination and then guess at targets.

## Goals / Non-Goals

**Goals**

- The designer can author an enemy's turn, mix that freely with the AI, and see
  what is still unplanned.
- A locked telegraph can be retargeted mid-round, retroactively.

**Non-Goals**

- **Any engine change.** The surface is complete. If this change wants one, that
  is a finding to report.
- **Authoring PC turns.** PCs are played, not planned.
- **Changing how the AI decides.**

## Decisions

### Planning is a two-step selection, mirroring how a PC acts

The designer picks the enemy, then its destination (from `validMoveDests`, or
stay), then its attack (from `plannableAttacks` for that destination). The plan
commits on the second choice.

This mirrors selecting a PC and seeing reachable tiles, which the bench already
does — the designer is doing the same kind of thing for the other side, so it
should feel the same. It also means the destination is chosen before attack
targets are shown, which is the only order `plannableAttacks` can answer for.

Attack is optional: committing with no attack tile plans a move-only turn.

### Turn order is planning order, and there is no reorder control

The engine resolves telegraphs in the order enemies were planned, so choosing
who to plan next *is* choosing the order. Adding a separate reorder step would
be a second way to express the same thing, and the two could disagree.

The consequence worth surfacing in the UI: the order enemies appear in the
unplanned list is the AI's preferred order (`unplannedNpcs`), not a commitment.

### Authorship is tracked by the bench, not the engine

`GameState` records *that* an enemy is planned (`npcPlannedThisRound`), not *who*
planned it. Provenance is presentation — it changes nothing about the round — so
the bench keeps its own per-round map of unit id → `'designer' | 'ai'`, cleared
when the round ends.

It must be part of the timeline frame, or scrubbing back would show the right
board with the wrong attribution.

### Amendment rewrites history in place

The requirement is that an amended telegraph reads as though it had been planned
that way from the start. So amending rewrites `npcPlans` for that unit **in every
frame from the one that locked it through the current cursor**, rather than
appending a "changed their mind" frame.

Safe because nothing reads `npcPlans` between lock and resolution — verified in
the engine: no reads in `actions.ts`, `pc.ts`, or `pathfinding.ts`. A telegraph
is display-only until resolution walks it, so rewriting it across those frames
invalidates nothing derived from it.

**Which frames.** Walk back from the cursor while the frame's state still has
that unit in `npcPlannedThisRound` and not in `npcPlansResolved` — that window is
exactly "after locked, before resolved" expressed in frames. Stop at the first
frame outside it.

The four semantics from the plan's §6, restated as behaviour:

| Case | Behaviour |
|---|---|
| Rewind to before the plan, re-plan | Amendment gone — it belonged to a plan that no longer exists |
| Rewind to at-or-after the lock | Amended target shows |
| Enemy died since planning | Refused by the engine |
| Any amendment | Never alters the enemy's position |

### The engine still validates; the bench never pre-filters

`plannableAttacks` decides which tiles the UI offers, and `commitNpcTurn` decides
whether a commit is legal. The bench does not check either itself. Where the two
could drift, the engine's own tests already assert they agree — the bench relies
on that rather than re-deriving.

## Risks / Trade-offs

**Planning five enemies by hand is a lot of clicks.** Mitigated by "AI for all
remaining" staying one press, and by hand-planning being for the one or two
enemies a designer actually cares about. If it becomes the common path rather
than the interesting one, the UI is wrong.

**The retroactive rewrite is the first thing to mutate stored frames.** Everything
else appends. A bug here corrupts history rather than producing a visibly wrong
board, which makes it the least self-evident failure in the bench — worth heavier
test coverage than its size suggests.

**Provenance can drift from the plan** if the bench's map and the engine's
`npcPlannedThisRound` are updated in different places. Keep them written
together.

## Open Questions

None.
