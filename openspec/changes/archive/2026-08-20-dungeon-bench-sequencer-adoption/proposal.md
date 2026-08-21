## Why

The bench sequences the round itself. It pins `phase: 'player'` at construction
and never leaves it, and `dungeon-bench-telegraph-window` had to add its own
plan/resolve guards — including refusing `endRound` while telegraphs are
pending — because nothing below the bench enforced any of it.

`dungeon-turn-sequencer` (track-web) moves the round into
`@repo/dungeon-engine`: an enemy's turn is planned once, its move executing and
its attack locking as a telegraph, and the locked attacks later resolve in the
order they were planned. The engine now owns the order, the per-enemy
accounting, and the phase transitions. **This change makes the bench run on
that**, replacing its own sequencing rather than duplicating it.

Phase 3a of `docs/dungeon-harness/harness-rebuild/turn-sequencer-plan.md`. It
deliberately ships no new authoring UI — the designer's planning pass is 3b.
The bench adopts before the game because it has no animation pipeline, so the
engine's API gets exercised cheaply and shape problems surface before the
riskier migration.

## What Changes

- **The bench becomes phase-aware.** It tracks the engine's `TurnPhase` and
  moves through it via the engine, instead of sitting in `player` forever. The
  current phase is visible to the designer.
- **Round progress comes from the engine.** The bench's own plan/resolve guards
  are replaced by the engine's refusals, surfaced verbatim rather than
  re-derived — including the `endRound` guard added in the previous change.
- **The existing AI-driven enemy turn is preserved** and runs through the
  engine's round. Planning the enemy turn and resolving the telegraphs remain
  two designer-visible steps with the window between them.
- **The upcoming action is shown** — what the round will do next, visible before
  it happens and while scrubbing the timeline.
- **Telegraph markers become legible.** They currently render as a dark X that
  is nearly invisible at normal zoom, which matters because the telegraph is the
  thing a designer reads *during* the window. Fixed here rather than in 3b,
  since 3b paints more overlay content into the same tiles.
- Agent tools follow the same operations, each a thin wrapper over an engine
  call.

Out of scope, and deliberately left to 3b: the designer's planning UI,
hand-planning an enemy, running the AI for a single named enemy, and amending a
locked telegraph.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dungeon-bench`: the enemy-turn and telegraph requirements move from the bench
  sequencing the round itself to the engine sequencing it, and gain requirements
  for the visible phase, the upcoming action, and telegraph legibility.

## Impact

- `dungeon-harness-server/src/bench/bench-store.ts` — the bench's own sequencing
  (`planEnemyTurn`/`resolveTelegraphs` guards, the pinned phase, the `endRound`
  guard) gives way to the engine's round operations.
- `dungeon-harness-server/src/bench/intents.ts` and
  `dungeon-harness-server/src/pi-extensions/bench-bridge.ts` — intents and agent
  tools follow.
- `client-dungeon/src/bench/types.ts`, `BenchControls.tsx`, `BoardView.tsx` —
  phase and upcoming-action display, and the telegraph marker's rendering.
- `dungeon-harness-server/templates/agent-workspace/AGENTS.md` — the enemy turn
  is now the engine's round.
- Depends on `dungeon-turn-sequencer` having landed in the sibling track-web
  repo, since `@repo/dungeon-engine` is consumed over a relative `file:` path.
