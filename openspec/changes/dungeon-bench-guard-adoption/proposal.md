## Why

The bench's spec still says the designer takes turns *"for **either** side —
moving and attacking with enemy units exactly as with player units"*. That
sentence was written in August 2026, when the engine had no round to be in
sequence with. Rebuild phases 1–4 built the correct model — the designer's seat
for the enemy is the **planning** seat, the same one the AI sits in — but nobody
retired the sentence, and last week `dungeon-sequencer-guards` hit the
contradiction between the new model and the old requirement and let the
requirement win. A deferral hardened into a design position.

Driving an enemy through the action surface is not the game's rule at a different
time. `commitAction`'s attack **resolves damage immediately**, where the game's
enemy attack is always a telegraph — locked in `npc-move`, resolved in
`npc-attack`, with the player's turn in between. So the bench was showing the
designer an attack the game can never produce, in a tool whose entire purpose is
showing what the game does.

The designer met all three consequences by hand on 2026-08-21 and reported them
as bugs (`docs/dungeon-harness/harness-rebuild/usability.md` §2): an enemy driven
mid-planning landing damage on the spot, a PC acting during the enemy phase, and
a unit spending movement after the telegraphs had already resolved.

This is the harness half of `phase-5-correction.md` §9 change 3; the engine half
is track-web's amended `dungeon-sequencer-guards`, which must land first.

## What Changes

- **The bench plays the game's round, in the game's order.** The requirement
  *"Both sides are played by hand"* is **REMOVED**, superseded by *"The designer
  can plan an enemy's turn"* — which already exists, produces a real telegraph,
  and gives the designer the same intent through the game's own path.
- **BREAKING for the designer:** clicking an enemy and moving or attacking with
  it stops working, in every phase. Planning it — by hand or by AI — replaces it.
- **BREAKING for the agent:** `dungeon_move_unit` and `dungeon_attack` no longer
  drive an enemy. `dungeon_plan_enemy_by_hand` and `dungeon_plan_enemy_by_ai` are
  the route, and the tool descriptions say so.
- **The Purpose paragraph** stops saying the bench is played *"by hand from both
  sides"*, and states the rule the rebuild is being corrected back onto: the
  bench and the game play by the same rules, with exceptions added back one at a
  time and each argued on its own.
- **Test fixtures reach the player phase before playing.** Most of the suite
  never did, and nothing stopped it.

The one departure the bench keeps is amending a locked telegraph, already spec'd
and unaffected.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dungeon-bench`: removes *"Both sides are played by hand"*; adds *"The bench
  plays the game's round, in the game's order"*, which carries forward the two
  rules from the removed requirement that are about the round rather than about
  driving an enemy (an attack is committal; ending a round refreshes both sides).

## Impact

- **Depends on** track-web's amended `dungeon-sequencer-guards`. Nothing here can
  be verified before it lands, and the bench suites are red in between.
- `dungeon-harness-server/src/bench/bench-store.test.ts`,
  `intents.test.ts` — a `playerPhase()` fixture; three tests re-aimed off the
  removed capability; the file-level `beforeEach(setEngineMode('bench'))` **stays**
  (change 2 made it structurally necessary) but its comments, which cite the
  removed requirement as the reason, are rewritten.
- `dungeon-harness-server/src/pi-extensions/bench-bridge.ts` —
  `dungeon_move_unit`'s description.
- `dungeon-harness-server/templates/agent-workspace/AGENTS.md` — the *"Playing —
  both sides, by hand"* section. The rest of the file is already correct.
- `client-dungeon/src/pages/DungeonPage.tsx`, `BenchControls.tsx` — confirm an
  enemy's refusal reaches the designer as a sentence rather than a dead control.
- `docs/dungeon-harness/STATUS.md` — record that the archived Non-Goal was a
  deferral, so the next reader does not re-derive the design position from it.
- `docs/dungeon-harness/harness-rebuild/phase-plan.md` — item 6 is superseded.
