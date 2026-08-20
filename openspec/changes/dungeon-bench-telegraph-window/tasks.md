## 1. Reproduce the defect first

- [x] 1.1 Add a failing test to `bench-store.test.ts` asserting that after the
      enemy turn is planned, telegraphs are reported AND no PC has lost HP from
      them. Against today's `runEnemyAi` this fails, because damage is already
      applied when the telegraphs appear. Keep it as regression coverage.

## 2. Split the enemy turn in the bench store

- [x] 2.1 Replace `BenchStore.runEnemyAi` with `planEnemyTurn()`: call
      `computeNpcTurns`, resolve **only** the moves through `resolveNpcAction`,
      and commit one frame with `npcPlans` set to the attack plans. Report the
      move count and what was telegraphed.
- [x] 2.2 Add `BenchStore.resolveTelegraphs()`: resolve each pending plan in
      `npcPlans` order through `resolveNpcAction`, **skipping any plan whose unit
      is no longer on the board** (as `runNpcAttackPhase` does), then commit one
      frame with `npcPlans` cleared. Report what landed via `describeChanges`.
- [x] 2.3 Refuse `planEnemyTurn` while `npcPlans` is non-empty, with a reason
      naming the pending telegraphs. Refuse `resolveTelegraphs` when `npcPlans`
      is empty. Keep the existing "no NPCs on the board" refusal on planning.
- [x] 2.4 Confirm the two frame labels read as halves of one turn on the
      timeline, since `label` is what the transport strip shows.

## 3. Wire the intents and the client

- [x] 3.1 Replace the `runEnemyAi` intent in `bench/intents.ts` with
      `planEnemyTurn` and `resolveTelegraphs`; update `intents.test.ts`.
- [x] 3.2 Mirror the same two intents in `client-dungeon/src/bench/types.ts`.
- [x] 3.3 Replace the single button in `BenchControls.tsx` with two controls that
      read as two halves of one enemy turn, and disable each when the store would
      refuse it — pending telegraphs known from the existing `telegraphs` field
      on bench state.

## 4. Agent surface

- [x] 4.1 Replace `dungeon_run_enemy_ai` in `bench-bridge.ts` with
      `dungeon_plan_enemy_turn` and `dungeon_resolve_telegraphs`, including the
      tool-name allowlist at the top of the file.
- [x] 4.2 Update `templates/agent-workspace/AGENTS.md` — both the structureless-
      board note (line ~34) and the tool list (line ~83) name the old tool.

## 5. Tests

- [x] 5.1 Rework the existing `runEnemyAi` assertions in `bench-store.test.ts`
      into planning and resolution tests, checking the original assertions
      survive rather than being weakened.
- [x] 5.2 Cover: telegraphs cleared after resolution; a PC that moves off a
      telegraphed tile inside the window is unharmed while the attack still
      resolves against the tile; an enemy killed inside the window does not land
      its attack.
- [x] 5.3 Cover the timeline: stepping back once from resolved telegraphs
      returns to the pending-telegraph board with no attack damage; stepping back
      twice returns to before the enemy moved, with no telegraphs.
- [x] 5.4 Cover the refusals from 2.3.
- [x] 5.5 Run `npm test` and `npm run typecheck`; both clean.

## 7. Pending-telegraph guard on ending the round

Found during review, not in the original task list: the engine's `endRound`
clears `npcPlans`, so ending a round mid-window silently discarded locked
attacks and reported success.

- [x] 7.1 Refuse `BenchStore.endRound` while telegraphs are pending, naming them
      in the reason; disable the End round control in the client while pending.
- [x] 7.2 Cover it in `bench-store.test.ts`, and record the requirement in the
      delta spec and `AGENTS.md`.

## 6. Verify in a browser

- [x] 6.1 Verified 2026-08-20. Loaded the "Melee vs sniper" bookmark, planned
      until the long-range NPC closed to range: one telegraph locked on the PC's
      tile `(5, 4)`, PC still at 3 HP. Resolving reported `melee-1 3→2 HP` and
      cleared the telegraph. Plan and End round both correctly disable while a
      telegraph is pending; Resolve shows its count and disables when empty.
- [x] 6.2 Verified 2026-08-20. Stepping back one frame from resolved telegraphs
      restores the pending-telegraph frame: telegraph count 1, label
      `long-range-2 → (5, 4)`, and the PC renders 3 HP pips against 2 in the
      frame after. Stepping forward returns to the damaged state.
- [x] 6.3 Verified 2026-08-20. The agent called `dungeon_plan_enemy_turn` →
      `dungeon_board_state` → `dungeon_resolve_telegraphs` → `dungeon_board_state`
      and reported: "One attack telegraph: long-range-2 → tile (5, 4). Tile
      (5, 4) is occupied by your PC melee-1 (2 HP). Nothing had been damaged yet
      — telegraphs were still pending," then "melee-1 took 1 damage: 2 HP → 1 HP.
      The telegraph list is now empty." It never reached for the old
      `dungeon_run_enemy_ai`.

      Note for whoever runs this next: the first reply took over two minutes.
      An earlier attempt was abandoned at ~95s and wrongly written up as a
      credentials failure — the harness agent does not use `~/.pi/agent/auth.json`
      and gets its key from the environment. Wait longer before concluding
      anything is broken.
