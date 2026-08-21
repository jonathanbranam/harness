## 1. Authoring an enemy's turn

- [ ] 1.1 `BenchStore.planEnemyByHand(unitId, move, attackTile?)` over
      `commitNpcTurn`. Forward the engine's refusal verbatim; do not pre-check.
- [ ] 1.2 `BenchStore.planEnemyByAi(unitId)` over `advanceNpc`, so one named
      enemy can be handed to the AI while others are hand-planned.
- [ ] 1.3 Expose the choices the designer needs: legal destinations from
      `validMoveDests`, and legal attack tiles from `plannableAttacks` for a
      *prospective* destination — the query exists precisely so the designer is
      not guessing.
- [ ] 1.4 Report unplanned enemies from `unplannedNpcs`, in the order it gives.

## 2. Provenance

- [ ] 2.1 Track per-round authorship (unit id → designer or AI) in the bench,
      not the engine — `GameState` records that an enemy is planned, not who
      planned it. Clear it when the round ends.
- [ ] 2.2 Carry it in the timeline frame, so scrubbing back shows the right
      attribution alongside the right board. Write it wherever the plan is
      written, so the two cannot drift.

## 3. The retroactive amendment

- [ ] 3.1 `BenchStore.amendTelegraph(unitId, tile)` over the engine's
      `amendTelegraph`, which is bench-gated — the mode is already set at
      startup, so confirm rather than re-set it.
- [ ] 3.2 Rewrite `npcPlans` for that unit in every frame from the one that
      locked it through the cursor. Identify that window by walking back while
      the frame's state has the unit in `npcPlannedThisRound` and not in
      `npcPlansResolved`; stop at the first frame outside it.
- [ ] 3.3 **This is the first code that mutates stored frames** — everything else
      appends. Keep the rewrite in one place, and do not let it touch anything
      but that unit's telegraph entry.

## 4. Client

- [ ] 4.1 Mirror the new intents in `client-dungeon/src/bench/types.ts`.
- [ ] 4.2 Planning UI for `npc-move`: select an enemy, see its legal
      destinations, pick one, see legal attack tiles from there, commit — the
      same shape as selecting a PC and seeing where it can go.
- [ ] 4.3 Show which enemies are unplanned and, for planned ones, who chose it.
- [ ] 4.4 An amend affordance on a pending telegraph during the player phase.

## 5. Agent surface

- [ ] 5.1 Tools for hand-planning an enemy, AI-planning one named enemy, the
      prospective-destination queries, and amending a telegraph. Each a thin
      wrapper; no tool computes or describes a rule outcome itself.
- [ ] 5.2 Update `templates/agent-workspace/AGENTS.md`: the agent can now plan
      the enemy side rather than only run it, and can amend a locked telegraph —
      including that amending is retroactive and deliberately not something the
      game allows.

## 6. Tests

- [ ] 6.1 Hand-authored and AI-authored plans produce the same result for the
      same decision, and both resolve identically.
- [ ] 6.2 An enemy planned into a tile is accounted for when the next enemy is
      planned.
- [ ] 6.3 An all-`stay` round is accepted.
- [ ] 6.4 Planning order determines resolution order.
- [ ] 6.5 Refusals — already planned, illegal move, illegal attack — come from
      the engine and are forwarded unchanged.
- [ ] 6.6 `plannableAttacks` drives what the bench offers, and everything it
      offers commits successfully.
- [ ] 6.7 **Amendment, heavily.** The amended target shows in the locking frame
      and every frame after it; rewinding to before the plan and re-planning
      discards it; a dead enemy is refused; position is never altered; and no
      frame outside the window is touched.
- [ ] 6.8 Provenance survives a step back and is cleared when the round ends.
- [ ] 6.9 `npm test` and `npm run typecheck` clean.

## 7. Verify in a browser

- [ ] 7.1 Hand-plan one enemy and let the AI take the rest; confirm the board
      updates as each is planned and the unplanned list shrinks.
- [ ] 7.2 Plan every enemy to hold, and confirm the round accepts it.
- [ ] 7.3 Amend a telegraph mid-round, then scrub back to the frame that locked
      it and confirm it reads as though planned that way.
- [ ] 7.4 Drive the same sequence from chat. The agent's first reply can take
      over two minutes — wait before concluding anything is broken.
- [ ] 7.5 Note: element refs change on every re-render; re-snapshot before each
      click. A small button may also ignore a synthetic click — if a control
      seems dead, try clicking it via JS before reporting a bug.
