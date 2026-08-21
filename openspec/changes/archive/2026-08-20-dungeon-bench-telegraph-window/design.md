## Context

`BenchStore.runEnemyAi` (`bench-store.ts:551-566`) does this:

```ts
const { moves, attackPlans } = computeNpcTurns(this.state)
for (const move of moves) next = resolveNpcAction(next, move)
for (const plan of attackPlans) next = resolveNpcAction(next, plan)   // attacks land
this.commit({ ...next, npcPlans: attackPlans }, ...)                   // telegraphs set
```

Attacks resolve at line 559; the same plans are then stored as `npcPlans` at
562, and `BoardView.tsx:156` paints a red X on each target tile. The marker
means "incoming" and the attack has already landed.

The engine already supports the split. `computeNpcTurns` returns moves and
attack plans separately, and `resolveNpcAction` applies one action in isolation
— the shipped game uses exactly these two calls across its own two phases
(`runNpcMovePhase` / `runNpcAttackPhase`). Nothing new is needed from
`@repo/dungeon-engine`; the bench simply stopped using the seam that was there.

## Goals / Non-Goals

**Goals**

- The telegraph window exists in the bench, and telegraph markers mean what they
  show.
- Each half of the enemy turn is its own timeline frame.
- The bench's enemy turn matches the shipped game's round shape.

**Non-Goals**

- Engine-side enforcement of the round. `advance`, the round ledger, and the
  refusal set are phase 2 of the sequencer plan; this change keeps the bench as
  the sequencer and only makes it sequence correctly.
- Bench phase tracking. The bench still pins `phase: 'player'`; real
  `TurnPhase` handling arrives in phase 3.
- Designer authoring of individual enemy plans, and amending a locked telegraph.
  Phase 3 and §6 of the plan.
- Any change to `@repo/dungeon-engine` or the sibling track-web repo.

## Decisions

### Pending telegraphs live in `GameState.npcPlans`, not beside it

`npcPlans` is already the field the game uses for exactly this, it is already
part of `GameState`, and `GameState` is what the timeline snapshots. Storing
pending telegraphs anywhere else would break stepping back into the window,
because frames restore `state`, `map`, and `defOverrides` and nothing else
(`restore`, `bench-store.ts:276-285`).

The lifecycle inverts from today's: `npcPlans` is **set when planning** and
**cleared when resolving**, rather than set after resolution.

### Two methods, and planning refuses while telegraphs are pending

`planEnemyTurn()` and `resolveTelegraphs()`.

Planning while `npcPlans` is non-empty is refused rather than silently
overwriting. Overwriting would discard locked attacks the designer is looking
at, which is precisely the kind of quiet wrongness this change exists to remove.
The designer can always step back if they want to re-plan.

This is a bench-local guard. Phase 2 moves the equivalent rule into the engine,
at which point this check is replaced rather than duplicated.

### A dead enemy's telegraph is skipped, not resolved

The game already does this — `runNpcAttackPhase` checks
`if (!stateRef.current.units.some(u => u.id === plan.unitId))` before resolving
each plan. The bench must match, or killing an enemy inside the window would
still let it hit.

### Resolution is one frame, not one frame per attack

The window is the interval worth scrubbing into; individual attacks within
resolution are not separately interesting, and a frame per attack would bury the
timeline on a board with six enemies. This matches how the current code commits
one frame for the whole AI turn.

Per-attack stepping is available later through phase 2's `advance`, which
resolves one telegraph per call by construction.

### Two tools, replacing one

`dungeon_run_enemy_ai` becomes `dungeon_plan_enemy_turn` and
`dungeon_resolve_telegraphs`. Renaming rather than keeping the old name for one
half avoids an agent carrying over the old single-step mental model — the tool
list is the agent's documentation of what the bench can do.

`AGENTS.md` in the agent workspace template describes the enemy turn and needs
the same update, or the agent will keep asking for a tool that no longer exists.

## Risks / Trade-offs

**The designer must now take two actions where one used to do.** Mitigated by
this being the point: the interval between them is the thing being added. The
controls should read as two halves of one turn rather than two unrelated
buttons.

**Bench and game still have separate sequencers after this change.** Accepted
and temporary — closing that is phase 2's whole purpose. This change deliberately
does not attempt it, so the misleading overlay can be fixed without waiting on
cross-repo work.

**`runEnemyAi`'s existing test coverage will be split.** The current test asserts
moves and attacks in one call; it becomes two tests plus new coverage for the
window itself. Worth checking that the existing assertions survive rather than
being quietly weakened.

## Migration Plan

Not applicable — nothing persists `npcPlans` across sessions. Bookmarks store
board, units, and definition tweaks; a bookmark saved mid-window restores with
whatever `npcPlans` its `GameState` carried, which is correct by construction.

## Open Questions

None. The engine seam is already proven by the shipped game using it.
