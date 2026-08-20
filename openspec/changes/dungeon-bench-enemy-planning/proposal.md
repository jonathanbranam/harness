## Why

The bench can hand the enemy turn to the AI or watch it play out, but it cannot
*author* one. A designer judging whether a unit is well-tuned needs to ask "what
if the enemies played this line instead" — including lines the AI would never
choose, like every enemy holding position. Today the only way to see a different
enemy turn is to keep re-running the AI until it happens to do something else.

`dungeon-turn-sequencer` made planning a decision the engine validates rather
than owns: an enemy's turn is planned once, and the engine checks the move and
the telegraph are legal without caring whether the AI or a person chose them.
This change gives the designer that seat.

Phase 3b of `docs/dungeon-harness/harness-rebuild/turn-sequencer-plan.md`,
following 3a's adoption of the engine's round.

## What Changes

- **The designer plans the enemy turn**, one enemy at a time, taking the seat the
  AI occupies in the game. Each enemy's move executes as it is planned, so the
  next enemy is planned against a board that already reflects it.
- **Three ways to fill any enemy's plan**, mixable within one round: author it by
  hand, hand that one enemy to the AI, or let the AI take every enemy still
  unplanned.
- **Turn order is the order the designer plans in** — choosing who to plan next
  is choosing the order, and the telegraphs later resolve in it.
- **Planning state is visible**: which enemies are still unplanned, and for those
  already planned, whether the designer or the AI chose it.
- **A locked telegraph can be amended** during the player phase — **the one place
  the bench deliberately breaks a game rule.** In the game a telegraph is locked
  and the player cannot change it; that is the round's core tension. A designer
  who spots a bad enemy plan halfway through the PC turn should not have to
  rewind the whole turn to fix it.
- **The amendment is retroactive.** It changes the plan *and* the outcome, so on
  replay the session reads as though the designer had planned it that way from
  the start. There is no "changed their mind" event in the history.
- Agent tools for each, one-to-one over the engine's operations.

Out of scope: authoring PC turns (PCs are played, not planned), amending an
executed move (movement is immutable once planned — only the telegraph is
amendable), and any change to how the AI decides.

## Capabilities

### New Capabilities

None. This extends how the bench's existing enemy turn is authored rather than
adding a separate capability.

### Modified Capabilities

- `dungeon-bench`: the enemy turn stops being something only the AI can produce.
  Gains requirements for designer-authored plans, mixed authorship within a
  round, designer-chosen turn order, visible planning state, and the retroactive
  telegraph amendment with its rewind semantics.

## Impact

- `dungeon-harness-server/src/bench/bench-store.ts` — per-enemy planning
  operations over the engine's planning API; the amendment and its retroactive
  rewrite across timeline frames.
- `dungeon-harness-server/src/bench/intents.ts` and
  `dungeon-harness-server/src/pi-extensions/bench-bridge.ts` — intents and agent
  tools follow.
- `client-dungeon` — the planning pass is the largest piece of UI in this change
  and has no counterpart in the game: per-enemy intent, unplanned-enemy state,
  plan provenance, and the amendment affordance.
- `dungeon-harness-server/templates/agent-workspace/AGENTS.md` — the agent can
  now plan the enemy side, not only run it.
- The retroactive rewrite touches the timeline's stored frames, which nothing
  else currently rewrites — worth care, and the reason this is its own change.
- Depends on `dungeon-bench-sequencer-adoption` (3a).
