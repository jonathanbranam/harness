## Why

The bench holds one invariant above all others: **the engine referees every
rule, and the harness derives none of its own.** Every play operation obeys it.
Setup never did:

```ts
// bench-store.ts, placeUnit
if (this.state.units.some((u) => u.col === col && u.row === row)) return fail('… already occupied')
if (this.state.cells[row][col].hasStructure)                      return fail('… holds a structure')
const unit: Unit = { id: `${unitType}-${++this.unitSeq}`, …, hp: hp ?? def.maxHp }
```

"A structure blocks a tile", "two units cannot share a tile", "a fresh unit
starts at its archetype's max HP", and how a unit id is formed are engine facts,
implemented here. `BenchStore` also hand-rolls `emptyState()` — a second,
independent construction of a `GameState` beside the engine's own. Setup got
waved through as "not gameplay".

It is also the last thing standing between the bench and the game's rules. The
strict phase guard (correction plan §9, change 3) breaks bench setup outright: a
fresh board starts in `npc-move` and the designer edits it freely, because
nothing ever refused. Setup has to become an explicit phase with an explicit
engine surface first.

The engine side lands as `dungeon-bench-setup-surface` in the sibling track-web
repo. This change adopts it.

## What Changes

- **A bench scenario begins in `placement`.** A new or regenerated board starts
  in setup, and the designer starts the scenario explicitly — through the
  engine's `startScenario`, the same transition the game uses. The client's
  existing setup/play toggle stops being a local UI mode and becomes what phase
  the round is in.
- **Every setup operation becomes a wrapper.** `placeUnit`, `removeUnit`,
  `relocateUnit`, `setUnitHp`, `clearUnits`, and the fresh-board state all call
  the engine's scenario surface and forward its refusal. `emptyState`,
  `nextSeqFrom`, the `unitSeq` counter, and every local rule check are deleted.
- **Setup is refused once the scenario has started**, with the engine's reason.
  To edit a running scenario the designer steps back through the timeline to a
  frame before it started — no new "back to setup" transition is added.
- **Structures can be placed, moved, and removed**, by the designer and by the
  agent. The bench cannot do this today at all: structures arrive only by
  generating a board or authoring exact rows.
- **Unit-definition tweaks stay available at any time.** They are not game
  state, and changing a number mid-round to see what happens is what the bench is
  for. (Designer's call, 2026-08-21; revisited with the turn-machine replacement
  for unit definitions.)
- **Setting a unit's current HP becomes placement-only**, since current HP *is*
  game state. (Designer's call, 2026-08-21; may return later as an argued bench
  exception.)
- New agent tools: `dungeon_place_structure`, `dungeon_remove_structure`,
  `dungeon_move_structure`, `dungeon_start_scenario`. The setup tools'
  descriptions say when they work.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `dungeon-bench`: **The designer can set up any board state** — setup is now
  refereed by the engine rather than by the bench, is reachable only during the
  placement phase, and covers structures as well as units. A scenario is set up
  and then started, rather than being editable at any moment.

## Impact

- `dungeon-harness-server/src/bench/bench-store.ts` — setup section becomes
  wrappers; `emptyState`, `nextSeqFrom`, `unitSeq` deleted; a `startScenario`
  operation added.
- `dungeon-harness-server/src/bench/intents.ts` and
  `client-dungeon/src/bench/types.ts` — intents for structures and for starting
  the scenario.
- `dungeon-harness-server/src/pi-extensions/bench-bridge.ts` and
  `session-store.ts` — four new tools, and the allowlist entry each needs.
- `dungeon-harness-server/templates/agent-workspace/AGENTS.md` — how setup works
  now.
- `client-dungeon` — setup affordances follow the phase; a structure palette; a
  Start scenario control.
- Depends on track-web `dungeon-bench-setup-surface`. Neither is finished
  without the other.
- Saved bookmarks are unaffected: the `GameState` shape does not change, and a
  position saved mid-round is still a position the round can be in.
