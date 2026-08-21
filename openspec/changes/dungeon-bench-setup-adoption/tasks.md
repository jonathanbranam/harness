## 1. Prerequisite

- [x] 1.1 Confirm track-web `dungeon-bench-setup-surface` is implemented and the
      `file:` dependency resolves — `scenario.*`, the result types, and the
      per-kind structure HP defaults are importable from `@repo/dungeon-engine`.

## 2. `BenchStore` becomes a wrapper again

- [x] 2.1 Construct from `scenario.newScenario(this.freshCells())`; delete
      `emptyState`. A fresh bench, and `newBoard`, land in `placement`.
- [x] 2.2 `placeUnit`, `removeUnit`, `relocateUnit`, `setUnitHp`, `clearUnits`
      call the engine and forward its refusal verbatim. Delete every local
      bounds/occupancy/structure/HP check and the `getDef` max-HP lookup.
- [x] 2.3 Delete `nextSeqFrom`, the `unitSeq` field, and its restore in
      `restore()` and in the bookmark load path. Take the placed unit's id and
      HP from the engine's result for the log line.
- [x] 2.4 Add `placeStructure`, `removeStructure`, `moveStructure` wrappers, each
      committing a frame with a log line.
- [x] 2.5 Add `startScenario()` wrapping the engine's, committing the transition
      as a frame like `endPlayerTurn` does.
- [x] 2.6 Correct `withoutDepartedUnits`'s doc comment: the mid-round removal it
      cites can no longer happen; it now guards timeline and bookmark restores,
      and is what a fleeing enemy will need.
- [x] 2.7 Check every remaining reference to the old starting phase — comments,
      `BenchState` derivation, anything asserting a fresh board is in `npc-move`.

## 3. Intents and the client

- [x] 3.1 `client-dungeon/src/bench/types.ts` and
      `dungeon-harness-server/src/bench/intents.ts`: add `place-structure`,
      `remove-structure`, `move-structure`, and `start-scenario` intents, routed
      to the new store methods.
- [x] 3.2 `DungeonPage`: derive `mode` from `phase === 'placement'` instead of
      the local `useState` toggle; keep the board's click behavior keyed off the
      derived value.
- [x] 3.3 `BenchControls`: a Start scenario button beside the other round
      controls — enabled only in `placement`, disabled elsewhere with a reason,
      matching how Plan/End turn/Resolve present.
- [x] 3.4 Setup palette: add `power-center` and `tower` alongside the unit types,
      so clicking an empty tile places the armed kind; selecting a structure and
      clicking an empty tile moves it; add a Remove affordance for a selected
      structure.
- [x] 3.5 Surface a refused setup operation the way refusals are already
      surfaced, so "you cannot edit a running scenario" reaches the designer.

## 4. Agent surface

- [x] 4.1 `bench-bridge.ts`: register `dungeon_place_structure`,
      `dungeon_remove_structure`, `dungeon_move_structure`, and
      `dungeon_start_scenario`, each a thin wrapper over the store method.
- [x] 4.2 Add all four names to `BENCH_TOOL_NAMES` so they reach
      `session-store.ts`'s `CUSTOM_TOOL_NAMES` and the `tools` array — a
      registered tool left off it is silently unavailable to the agent.
- [x] 4.3 Extend the existing setup tools' descriptions: they work during setup,
      and the engine explains itself if it is too late.
- [x] 4.4 `templates/agent-workspace/AGENTS.md`: describe setup as a phase — the
      scenario is authored, then started — and list the structure tools.

## 5. Tests

- [x] 5.1 A fixture helper that authors a position and starts the scenario, used
      by every bench test that plays; re-aim existing tests through it rather
      than relaxing them.
- [x] 5.2 Re-aim tests asserting a local rule check (occupancy, structure
      blocking, default HP) at asserting the engine's refusal reached the caller
      with its reason.
- [x] 5.3 New: a fresh bench and a new board start in `placement`; starting moves
      to `npc-move` and appears on the timeline; a setup operation after the
      start is refused with the engine's reason and changes nothing; stepping
      back before the start makes setup work again.
- [x] 5.4 New: structures placed, moved with HP preserved, and removed, including
      that reach and threat change as a result.
- [x] 5.5 Keep the id-collision regression (load a bookmark whose ids have gaps,
      then place) passing with the counter gone.
- [x] 5.6 A unit-definition tweak is still accepted mid-round.

## 6. Verify

- [x] 6.1 `npm test` and `npm run typecheck` clean in this repo.
- [x] 6.2 Browser (`localhost:5177`, do not restart the dev servers): author a
      board with units and a structure, start the scenario, plan an enemy by hand
      and by AI, take a player turn, resolve telegraphs; confirm setup is refused
      mid-round with a readable reason and that stepping back restores it.
- [x] 6.3 Drive the same path through the agent's tools, including the four new
      ones.
- [x] 6.4 Load a bookmark saved before this change and confirm it still restores.
      *(As written this was not literally testable: the only pre-existing bookmark
      predates the bench running on the engine's round, so it is refused by the
      older compatibility check — correct behaviour, not a regression from this
      change. Verified the equivalent instead: save/load round-trips in both
      `placement` and mid-round, each restoring its own phase.)*
- [ ] 6.5 Present both changes together — this one and track-web's
      `dungeon-bench-setup-surface` — and wait for the developer before
      archiving either.
