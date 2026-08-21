## 1. Prerequisite

- [x] 1.1 Confirm track-web's amended `dungeon-sequencer-guards` is implemented:
      `availableActions` refuses outside the `player` phase with no engine-mode
      condition, and refuses every `unit.kind === 'npc'`. Until it is, this repo's
      bench suites are red and nothing below can be verified.

## 2. The suite plays in the player phase

- [x] 2.1 Extend `startedWith` in `bench-store.test.ts` (or add a `playerPhase`
      helper beside it) so a test can ask for a started scenario that has reached
      the `player` phase: place the units, `startScenario()`, then plan **every**
      enemy by hand as `{ kind: 'stay' }` with no attack, then step until the
      phase is `player`.
- [x] 2.2 Say in its doc comment why it plans rather than letting the AI drive:
      `startScenario` lands in `npc-move`, so the enemies move before the
      player's first turn. Holding them keeps a test's assertions about tiles
      about the thing the test is testing.
- [x] 2.3 Re-aim the failing fixtures through it. Measured before the fix: 23
      failed / 105 passed of 128 across the bench suites. Most are fixtures; the
      three in task 3 are not.
- [x] 2.4 A test that wants an enemy to have moved or telegraphed now says so
      explicitly. Do not hide it back inside the fixture.

## 3. Three tests are re-aimed, not repaired

- [x] 3.1 `playing by hand > drives an NPC attack by hand against a PC` — re-aim
      onto `planEnemyByHand` and resolution: the same designer intent through the
      game's path, asserting the attack becomes a telegraph and lands only after
      the player's turn.
- [x] 3.2 `aiming is by tile > will not let a hand-driven enemy attack twice in a
      round` — the route it guards is gone. Replace with the refusal itself: an
      enemy's actions are unavailable, carrying the engine's reason.
- [x] 3.3 `reach and threat > drops a unit out of both fields once it has
      attacked` — the behaviour is real, the enemy it used is not drivable. Re-aim
      at a player unit. *(The plan was wrong here: the test already used a player
      unit as the actor — `melee` attacking a `short-range` — and only needed the
      player-phase fixture. The correction plan's §6 step 3 listed it among the
      three testing the removed capability; it was not one of them.)*
- [x] 3.4 **Do not weaken an assertion to make a test pass.** If one cannot be
      re-aimed without checking less than it did, stop and report it.
- [x] 3.5 Three tests whose names stopped describing why they pass. Found on
      review, after the suite was already green, and fixed:
      `refuses a move the engine says is out of reach` and
      `refuses an NPC target outside the engine footprint` both ran during
      `placement`, so the phase guard refused them before reach or footprint was
      ever consulted — they would have passed with those checks deleted. Both now
      run in the player phase with a PC actor and assert the engine's actual
      reason. `drives an NPC attack by hand against a PC` was correctly re-aimed
      onto planning by 3.1 but kept its old name; renamed to say what it tests.
      *(A test that passes for a reason its name does not give is the same
      species of stale sentence this whole change exists to delete.)*

## 4. The engine-mode comments

- [x] 4.1 Keep the file-level `beforeEach(() => setEngineMode('bench'))` in
      `bench-store.test.ts` and `intents.test.ts`. Change 2 made it structurally
      necessary — `new BenchStore()` authors a scenario, which is bench-only.
      (This reverses `phase-5-correction.md` §6 step 3, which predates change 2;
      see `design.md`.)
- [x] 4.2 Rewrite both files' header comments. They currently justify the setting
      by citing *"Both sides are played by hand"* and out-of-sequence play, which
      this change removes. The correct reason is narrow: authoring a scenario is
      bench-only, and `amendTelegraph` is bench-only. Say explicitly that bench
      mode buys **no** latitude over the round.
- [x] 4.3 `intents.test.ts`'s comment about "driving moves and attacks on both
      sides out of sequence" goes with it.

## 5. The agent's surface

- [x] 5.1 `bench-bridge.ts`, `dungeon_move_unit` — *"Works for both sides: driving
      the enemy by hand is the point of this bench"* is now false. Rewrite: it
      drives a player unit during the player phase, and point at
      `dungeon_plan_enemy_by_hand` / `dungeon_plan_enemy_by_ai` for an enemy.
- [x] 5.2 `dungeon_attack` — check its description for the same claim and correct
      it if present.
- [x] 5.3 `templates/agent-workspace/AGENTS.md` — retitle *"Playing — both sides,
      by hand"* and correct its bullets. **The rest of the file is already
      right**: it describes the enemy turn as the engine's round, describes the
      planning seat, and calls `amendTelegraph` the one deliberate departure. Only
      this older section contradicts it — do not rewrite what already agrees.

## 6. The designer's surface

- [x] 6.1 Verify in the browser that selecting an enemy shows both actions
      disabled with the engine's reason, through the path the bench already
      spec-binds (*"The engine decides which actions a unit may take"*). Expect no
      client change. **Confirmed by the driver at `localhost:5177`**: selecting the
      enemy leaves Move and Attack disabled, both carrying *"The short-range takes
      its turn by being planned, not by acting through the action surface"* as
      button tooltip and as inline text. No client change was needed for this;
      6.4 below is a separate break found in the same pass.
- [x] 6.2 If the reason is swallowed — a control that looks dead, or a click that
      silently does nothing — fix the rendering. **Do not** add a client-side
      "is this an enemy?" check; the answer belongs to the engine and a local copy
      would go stale.
- [x] 6.3 Leave the setup click model alone. It is wrong and it is the next
      change (`usability.md` §1); mixing it in here makes both harder to review.
- [x] 6.4 **Regression found in the browser and fixed.** Hand-planning an enemy
      lost its destination highlights: `BoardView` painted reach from the armed
      action's targets, which are now empty for an enemy, so the planning panel
      said "click a highlighted tile" with nothing highlighted. The click still
      worked — it reads `selection.moveDests` — so the flow was invisible rather
      than broken, which is worse. `BoardView` takes a `planningMoveTiles` prop
      alongside the existing `planningAttackTiles`, fed from the engine's
      `validMoveDests`; no rule is decided in the client, only which engine
      answer to paint.
- [x] 6.5 Note the coverage gap rather than closing it here: `vitest.config.mts`
      includes only the servers and `packages/ui`, so nothing in `client-dungeon`
      is under test and 6.4 was only catchable by hand. Worth its own decision,
      not a silent addition to this change.

## 7. The Purpose, and the record

- [x] 7.1 Edit `openspec/specs/dungeon-bench/spec.md`'s `## Purpose` directly — a
      delta cannot change it. Drop *"plays it through by hand from both sides"*
      and state the rule instead: the bench and the game play by the same rules,
      with exceptions added back one at a time and each argued on its own.
- [x] 7.2 `docs/dungeon-harness/STATUS.md` — record that
      `2026-08-19-dungeon-bench-action-adoption`'s Non-Goal (*"Phase enforcement.
      The bench drives both sides out of sequence on purpose"*) was a **deferral**
      taken when there was no sequencer, later misread as a design position. The
      archived change itself is not edited.
- [x] 7.3 `docs/dungeon-harness/harness-rebuild/phase-plan.md` item 6 (*"Play
      mode, both sides by hand… Enemies are driven the same way through
      `resolveNpcAction`"*) — mark it superseded, on both counts.
- [x] 7.4 `docs/dungeon-harness/harness-rebuild/usability.md` §2 — mark the three
      reported out-of-phase behaviours closed, naming this change.

## 8. Verify

- [x] 8.1 `npm test` and `npm run typecheck` clean in this repo.
- [x] 8.2 Browser (`localhost:5177`; **do not restart a dev server you did not
      start**): author a scenario, start it, plan an enemy by hand and another by
      AI, take a player turn, resolve the telegraphs. Confirm the three reported
      bugs are gone — an enemy cannot be driven mid-planning, a PC cannot act
      during the enemy phase, and no unit has movement left to spend after the
      telegraphs resolve. *(Driver, 2026-08-21. All three closed. Placement →
      start → enemy refused with the planning reason → PC refused during
      `npc-move` and again during `npc-attack` with the phase reason → planned by
      AI, stepped to `player`, moved the PC, ended the turn, resolved → round
      chained into the next `npc-move` and the PC was refused again. Also
      planned an enemy by hand end to end: destination, then telegraph.)*
- [x] 8.3 Confirm amending a locked telegraph still works. It is the one departure
      the bench keeps, and it shares the fence that changed meaning. *(Retargeted
      short-range-2's telegraph from (6, 4) to (4, 4) during the player phase. It
      worked, offered only legal tiles, and left the frame counter at 6/6 — no
      turn spent, no state changed, which is the whole basis for the exception.)*
- [x] 8.4 Drive the same round through the agent's tools, including a refused
      `dungeon_move_unit` against an enemy — check the refusal reads as an
      instruction, not just a denial. *(The agent was asked to move the enemy by
      hand. `dungeon_move_unit` returned the engine's refusal, and the agent
      worked out the replacement unprompted: "use `dungeon_plan_enemy_by_hand` to
      plan its turn" — then noticed the enemy was already planned this round and
      asked before undoing it.)*
- [ ] 8.5 Present both changes together — this one and track-web's amended
      `dungeon-sequencer-guards` — and wait for the developer before archiving
      either.
