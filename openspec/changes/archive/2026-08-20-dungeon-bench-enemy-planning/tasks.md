## 1. Authoring an enemy's turn

- [x] 1.1 `BenchStore.planEnemyByHand(unitId, move, attackTile?)` over
      `commitNpcTurn`. Forward the engine's refusal verbatim; do not pre-check.
- [x] 1.2 `BenchStore.planEnemyByAi(unitId)` over `advanceNpc`, so one named
      enemy can be handed to the AI while others are hand-planned.
- [x] 1.3 Expose the choices the designer needs: legal destinations from
      `validMoveDests`, and legal attack tiles from `plannableAttacks` for a
      *prospective* destination — the query exists precisely so the designer is
      not guessing.
- [x] 1.4 Report unplanned enemies from `unplannedNpcs`, in the order it gives.

## 2. Provenance

- [x] 2.1 Track per-round authorship (unit id → designer or AI) in the bench,
      not the engine — `GameState` records that an enemy is planned, not who
      planned it. Clear it when the round ends.
- [x] 2.2 Carry it in the timeline frame, so scrubbing back shows the right
      attribution alongside the right board. Write it wherever the plan is
      written, so the two cannot drift.

## 3. The retroactive amendment

- [x] 3.1 `BenchStore.amendTelegraph(unitId, tile)` over the engine's
      `amendTelegraph`, which is bench-gated — the mode is already set at
      startup, so confirm rather than re-set it.
- [x] 3.2 Rewrite `npcPlans` for that unit in every frame from the one that
      locked it through the cursor. Identify that window by walking back while
      the frame's state has the unit in `npcPlannedThisRound` and not in
      `npcPlansResolved`; stop at the first frame outside it.
- [x] 3.3 **This is the first code that mutates stored frames** — everything else
      appends. Keep the rewrite in one place, and do not let it touch anything
      but that unit's telegraph entry.

## 4. Client

- [x] 4.1 Mirror the new intents in `client-dungeon/src/bench/types.ts`.
- [x] 4.2 Planning UI for `npc-move`: select an enemy, see its legal
      destinations, pick one, see legal attack tiles from there, commit — the
      same shape as selecting a PC and seeing where it can go.
- [x] 4.3 Show which enemies are unplanned and, for planned ones, who chose it.
- [x] 4.4 An amend affordance on a pending telegraph during the player phase.

## 5. Agent surface

- [x] 5.1 Tools for hand-planning an enemy, AI-planning one named enemy, the
      prospective-destination queries, and amending a telegraph. Each a thin
      wrapper; no tool computes or describes a rule outcome itself.
- [x] 5.2 Update `templates/agent-workspace/AGENTS.md`: the agent can now plan
      the enemy side rather than only run it, and can amend a locked telegraph —
      including that amending is retroactive and deliberately not something the
      game allows.

## 6. Tests

- [x] 6.1 Hand-authored and AI-authored plans produce the same result for the
      same decision, and both resolve identically.
- [x] 6.2 An enemy planned into a tile is accounted for when the next enemy is
      planned.
- [x] 6.3 An all-`stay` round is accepted.
- [x] 6.4 Planning order determines resolution order.
- [x] 6.5 Refusals — already planned, illegal move, illegal attack — come from
      the engine and are forwarded unchanged.
- [x] 6.6 `plannableAttacks` drives what the bench offers, and everything it
      offers commits successfully.
- [x] 6.7 **Amendment, heavily.** The amended target shows in the locking frame
      and every frame after it; rewinding to before the plan and re-planning
      discards it; a dead enemy is refused; position is never altered; and no
      frame outside the window is touched.
- [x] 6.8 Provenance survives a step back and is cleared when the round ends.
- [x] 6.9 `npm test` and `npm run typecheck` clean.

## 7. Verify in a browser

- [x] 7.1 Verified 2026-08-20 in the browser: per-enemy "Plan by hand" / "Hand
      to AI", hand-planning highlights legal destinations then legal attack
      tiles, and authorship shows as "planned by designer" / "planned by ai".
- [x] 7.2 Covered by the all-`stay` server test plus the browser's "Every enemy
      is planned — press Step or Plan enemy turn to move on" prompt.
- [x] 7.3 Verified 2026-08-20 via the agent: telegraph retargeted from (4, 1) to
      (3, 0), and at the frame where it was locked the telegraph reads the
      **amended** target — the retroactive promise, confirmed on real frame data.
- [x] 7.4 Verified 2026-08-20. The agent drove `dungeon_clear_units`,
      `dungeon_place_unit`, `dungeon_round_status`, `dungeon_end_turn`,
      `dungeon_step`, `dungeon_amend_telegraph`, `dungeon_step_to` and reported
      the result correctly.
- [x] 7.5 Both harness traps hit again and are recorded: stale refs, and small
      SVG targets ignoring synthetic clicks. Driving the bench through the agent
      turned out to be the more reliable verification path.

## 8. Found while verifying

- [x] 8.1 `clearUnits`/`removeUnit` left telegraphs and round records naming
      units that no longer existed, so the UI listed a phantom telegraph and its
      Amend refused with "No unit ... on the board". Round records now follow the
      units they name, and a telegraph is not reported once its owner has left
      the board. Regression tests added.
