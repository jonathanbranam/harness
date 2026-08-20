## 1. Reproduce the defect first

- [ ] 1.1 Add a failing test to `bench-store.test.ts` asserting that after the
      enemy turn is planned, telegraphs are reported AND no PC has lost HP from
      them. Against today's `runEnemyAi` this fails, because damage is already
      applied when the telegraphs appear. Keep it as regression coverage.

## 2. Split the enemy turn in the bench store

- [ ] 2.1 Replace `BenchStore.runEnemyAi` with `planEnemyTurn()`: call
      `computeNpcTurns`, resolve **only** the moves through `resolveNpcAction`,
      and commit one frame with `npcPlans` set to the attack plans. Report the
      move count and what was telegraphed.
- [ ] 2.2 Add `BenchStore.resolveTelegraphs()`: resolve each pending plan in
      `npcPlans` order through `resolveNpcAction`, **skipping any plan whose unit
      is no longer on the board** (as `runNpcAttackPhase` does), then commit one
      frame with `npcPlans` cleared. Report what landed via `describeChanges`.
- [ ] 2.3 Refuse `planEnemyTurn` while `npcPlans` is non-empty, with a reason
      naming the pending telegraphs. Refuse `resolveTelegraphs` when `npcPlans`
      is empty. Keep the existing "no NPCs on the board" refusal on planning.
- [ ] 2.4 Confirm the two frame labels read as halves of one turn on the
      timeline, since `label` is what the transport strip shows.

## 3. Wire the intents and the client

- [ ] 3.1 Replace the `runEnemyAi` intent in `bench/intents.ts` with
      `planEnemyTurn` and `resolveTelegraphs`; update `intents.test.ts`.
- [ ] 3.2 Mirror the same two intents in `client-dungeon/src/bench/types.ts`.
- [ ] 3.3 Replace the single button in `BenchControls.tsx` with two controls that
      read as two halves of one enemy turn, and disable each when the store would
      refuse it — pending telegraphs known from the existing `telegraphs` field
      on bench state.

## 4. Agent surface

- [ ] 4.1 Replace `dungeon_run_enemy_ai` in `bench-bridge.ts` with
      `dungeon_plan_enemy_turn` and `dungeon_resolve_telegraphs`, including the
      tool-name allowlist at the top of the file.
- [ ] 4.2 Update `templates/agent-workspace/AGENTS.md` — both the structureless-
      board note (line ~34) and the tool list (line ~83) name the old tool.

## 5. Tests

- [ ] 5.1 Rework the existing `runEnemyAi` assertions in `bench-store.test.ts`
      into planning and resolution tests, checking the original assertions
      survive rather than being weakened.
- [ ] 5.2 Cover: telegraphs cleared after resolution; a PC that moves off a
      telegraphed tile inside the window is unharmed while the attack still
      resolves against the tile; an enemy killed inside the window does not land
      its attack.
- [ ] 5.3 Cover the timeline: stepping back once from resolved telegraphs
      returns to the pending-telegraph board with no attack damage; stepping back
      twice returns to before the enemy moved, with no telegraphs.
- [ ] 5.4 Cover the refusals from 2.3.
- [ ] 5.5 Run `npm test` and `npm run typecheck`; both clean.

## 6. Verify in a browser

- [ ] 6.1 Against the already-running dev servers (do not start or restart them),
      drive the bench with `playwright-cli`: generate a board with a power center
      and enemies, plan the enemy turn, confirm telegraph markers appear with no
      damage dealt, move a PC, resolve, and confirm the markers clear.
- [ ] 6.2 Scrub back into the window and confirm the board shows pending
      telegraphs with the PCs undamaged.
- [ ] 6.3 Drive the same sequence from chat to confirm both agent tools work and
      the agent is not still reaching for `dungeon_run_enemy_ai`.
