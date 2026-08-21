## Context

The engine change (track-web `dungeon-sequencer-guards`, amended) makes two
refusals unconditional:

- a unit's actions are unavailable outside the `player` phase, in every host;
- an enemy's actions are unavailable in every phase, because its route into a
  round is planning.

The bench relied on both holes. Measured 2026-08-21 by applying both guards and
running the bench suites: **23 failed / 105 passed of 128**. That number is the
shape of the change.

## Goals / Non-Goals

**Goals**

- The `dungeon-bench` spec stops asserting a capability the bench must not have.
- The suite plays in the player phase, because that is when play happens.
- The designer and the agent are told what replaced the gesture they lost.

**Non-Goals**

- **The engine.** Every refusal in this change comes from track-web; the harness
  adds none of its own. If something here needs a rule the engine does not give
  it, that is a finding to report, not a check to write locally.
- **The setup-usability rework.** The phase guard changes what a selected unit
  shows during placement — it will stop showing a movement range — and that is
  the hinge the usability change turns on (`usability.md` §1). It is the next
  change, deliberately not this one.
- **Removing the engine mode.** It still fences `amendTelegraph` and the
  scenario-authoring surface, and after change 2 it is required merely to
  *construct* a `BenchStore`.

## Decisions

### The file-level `setEngineMode('bench')` stays — the correction plan is out of date here

`phase-5-correction.md` §6 step 3 says to delete the file-level
`beforeEach(() => setEngineMode('bench'))` from `bench-store.test.ts` and
`intents.test.ts` and scope it to the amendment block, on the grounds that
blanket-setting it is what let ordering violations pass unnoticed.

That was true when it was written and is no longer. Change 2 moved scenario
authoring behind the same fence, so `new BenchStore()` — which calls
`scenario.newScenario` — now *requires* bench mode. Every test needs it to build
a board at all.

The concern behind the instruction is still real, and it is answered differently:
with the phase guard unconditional, bench mode no longer buys any latitude over
the round, so setting it can no longer hide an ordering violation. What must
change is the **comments**, which currently explain the setting by citing the
requirement this change removes. Left alone they would be the same trap one layer
down — a stale justification that reads like a design position.

### One fixture that reaches the player phase, planning every enemy to hold

Change 2 already added `startedWith(bench, units)` — place, then start — and its
own comment anticipates this change's `playerPhase()`. Extend rather than add a
parallel path.

The subtlety: `startScenario` lands the round in `npc-move`, so **every enemy
takes its turn before the player's first**. That is the game's round, not an
artifact. A fixture that stepped through it with the AI driving would move
enemies to positions the test did not choose, and assertions about tiles would
start failing for reasons unrelated to what they test.

So the fixture plans each enemy **by hand, to `{ kind: 'stay' }` with no attack**,
then steps to the `player` phase. Positions stay exactly where the test put them,
the round is real, and the path exercised is the one the designer now uses.

A test that wants an enemy to have actually moved or telegraphed says so
explicitly — which is clearer than the old implicit "nothing had happened yet".

### Three tests are re-aimed, not repaired

- *"drives an NPC attack by hand against a PC"* — the capability being deleted.
  Re-aim onto `planEnemyByHand` plus resolution, which is the same designer
  intent through the game's path, and assert the telegraph window exists.
- *"will not let a hand-driven enemy attack twice in a round"* — asserts a guard
  against a route that no longer exists. Replace with the refusal itself: an
  enemy has no action surface.
- *"reach and threat > drops a unit out of both fields once it has attacked"* —
  the behaviour is real; only the enemy it used to demonstrate it with is not
  drivable. Re-aim at a player unit.

Nothing here is fixed by relaxing an assertion. If a test cannot be re-aimed
without weakening what it checks, report it.

### The client already has the right shape

`select` returns the engine's `ActionOption[]`, and the bench already spec-binds
itself to render an unavailable action disabled with the engine's reason (*"The
engine decides which actions a unit may take"*). So an enemy's refusal should
reach the designer with no client change at all.

Verify that it does, in a browser, and fix only what swallows it. Do not add a
client-side "is this an enemy?" test — that is the harness deriving a rule, and
it would go stale the moment the engine's answer changed.

## Risks / Trade-offs

**A designer loses a gesture.** Clicking an enemy and moving it was fast, and
planning it is more clicks. The replacement is strictly more faithful, but the
first session after this lands will feel slower. The reason text is what carries
that — it must name the planning seat, not merely refuse.

**The window between the two repos is red.** Nothing in the harness passes
between the engine change landing and this one. They are one unit of work in two
repos; land them together.

**The removed requirement's scenarios could be lost.** Two of them are about the
round, not about driving an enemy, and the delta carries them forward explicitly.
Check that at archive time rather than trusting the removal to be clean.

## Migration Plan

Land track-web's amended `dungeon-sequencer-guards` first; this change is
unverifiable before it. No data migration — bookmarks are unaffected, since
`GameState`'s shape does not change.

## Open Questions

None.
