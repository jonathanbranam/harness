## Why

The bench tells the designer something false about the board. `runEnemyAi`
resolves enemy moves, then resolves enemy attacks, then stores those same
already-resolved attacks as `npcPlans` telegraphs — and `BoardView` draws a red
X on every telegraphed tile. After running the AI, the designer sees "incoming
attack" markers for strikes that already landed.

Underneath the wrong marker is a structural divergence. The shipped game's round
is: enemies move and **lock** their attacks as telegraphs → the player acts
knowing what is coming → the telegraphs resolve. That telegraph window is the
game's core tension, and it is the exact interval a designer needs to judge
threat. The bench collapses it to nothing, so a unit tuned on the bench is tuned
against a round the game does not have.

This is phase 1 of `docs/dungeon-harness/harness-rebuild/turn-sequencer-plan.md`.
It is deliberately scoped to the harness alone — no engine change — so the
misleading overlay stops today rather than waiting on the engine work that
phases 2-5 depend on.

## What Changes

- **BREAKING** (bench API): `runEnemyAi` is replaced by two operations rather
  than one. Nothing outside the bench depends on it.
- **Plan the enemy turn** — enemy moves resolve and their attacks lock as
  telegraphs, without the attacks landing. The board shows what is coming.
- **Resolve the telegraphs** — the locked attacks play out, in the order they
  were planned.
- The designer acts between the two, which is what the telegraph window *is*.
- Each is its own frame on the transport strip, so the window is a scrubbable
  interval rather than an instant.
- Both are exposed to the agent as tools, replacing the single
  `dungeon_run_enemy_ai`.
- Telegraph markers now mean what they show: an attack that has not happened
  yet. A telegraph is cleared once it resolves.

Out of scope, and deliberately left to later phases of the sequencer plan:
engine-side enforcement of the round, phase tracking in the bench, designer
authoring of individual enemy plans, and amending a locked telegraph. This
change makes the bench's existing AI-driven enemy turn honest; it does not yet
move the round into the engine.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dungeon-bench`: "The game's own AI can take the enemy turn" currently
  requires resolving moves **and** attacks in one step. It becomes a two-step
  enemy turn with a telegraph window between the halves, and gains requirements
  for what a telegraph means and how the two steps interact with the timeline.

## Impact

- `dungeon-harness-server/src/bench/bench-store.ts` — `runEnemyAi` split into
  two methods; telegraph lifecycle (`npcPlans`) corrected so plans are stored
  before resolution and cleared after.
- `dungeon-harness-server/src/bench/bench-store.test.ts` — coverage for the
  window, including that telegraphs do not damage until resolved.
- `dungeon-harness-server/src/pi-extensions/bench-bridge.ts` — the enemy-AI tool
  becomes two tools.
- `client-dungeon/src/bench/types.ts` and the bench controls — one control
  becomes two, with the pending-telegraph state visible.
- No change to `@repo/dungeon-engine`, and no change to the sibling track-web
  repo.
