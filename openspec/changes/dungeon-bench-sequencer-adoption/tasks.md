## 1. Engine mode and state plumbing

- [ ] 1.1 Call `setEngineMode('bench')` once where `dungeon-harness-server`
      starts, and cover it with a test asserting the bench process is in bench
      mode. Nothing in 3a depends on it, but 3b's `amendTelegraph` does and it
      belongs with the process that is the bench.
- [ ] 1.2 Stop pinning `phase: 'player'` at bench construction
      (`bench-store.ts:202`). A new board starts where the engine's round starts.
- [ ] 1.3 Surface `phase`, the next step from `nextAction`, and pending
      telegraphs on the bench state the client already receives.

## 2. Replace the bench's sequencing with the engine's

- [ ] 2.1 Add `BenchStore.step()`: one `advance` call, committing one frame
      labelled from the returned `SequencerStep`. Surface a refusal verbatim.
- [ ] 2.2 Reimplement `planEnemyTurn()` as `advance` until the phase leaves
      `npc-move`, committing **one frame per step** — not one for the whole
      composite. Same for `resolveTelegraphs()` until the phase leaves
      `npc-attack`.
- [ ] 2.3 Add `endPlayerTurn()`: the host-owned `player` → `npc-attack`
      transition, matching `handleConfirmEndTurn` in the game. This is the only
      phase transition the bench performs itself.
- [ ] 2.4 Delete `BenchStore.endRound` and its intent. The engine ends the round
      as the `npc-attack` transition; there is no longer a way to end one with
      telegraphs pending, so phase 1's guard is not reimplemented.
- [ ] 2.5 Delete the bench's own plan/resolve guards where the engine now
      refuses. Do not re-derive or reword an engine refusal — forward it.

## 3. Bookmarks

- [ ] 3.1 Normalise state on `loadBookmark`: default missing
      `npcPlannedThisRound`/`npcPlansResolved` to empty and a missing `phase` to
      `'player'`. Every bookmark on disk predates this change, so an un-normalised
      load throws inside `advance` — this is the normal path, not an edge case.
- [ ] 3.2 Test loading a bookmark shaped like a pre-3a one (no round-progress
      fields) and then stepping the round, which is the case that would throw.

## 4. Telegraph legibility

- [ ] 4.1 Replace the telegraph marker in `BoardView.tsx` so it reads at normal
      zoom over every terrain and structure fill. A brighter red is not
      sufficient — see design.md.
- [ ] 4.2 Check it with both reach and threat fields switched on over the same
      tile, which is the condition that ruled out a purely chromatic fix.

## 5. Client and agent surface

- [ ] 5.1 Mirror the new intents in `client-dungeon/src/bench/types.ts`;
      remove `endRound`.
- [ ] 5.2 `BenchControls.tsx`: show the current phase and the upcoming action,
      and offer Step, Plan enemy turn, Resolve telegraphs, and End turn — each
      enabled only when the engine would accept it.
- [ ] 5.3 Agent tools follow: a step tool, the two composites, end-turn, and
      queries for phase and next action. Remove `dungeon_end_round`. Every tool
      stays a thin wrapper over an engine call.
- [ ] 5.4 Update `templates/agent-workspace/AGENTS.md`: the enemy turn is the
      engine's round now, `dungeon_end_round` is gone, and the agent can see the
      next step before taking it.

## 6. Tests

- [ ] 6.1 A full round through the bench: enemies plan one at a time, phase
      moves to `player`, ending the turn moves to `npc-attack`, telegraphs
      resolve, the round ends and the next enemy phase begins.
- [ ] 6.2 `nextAction` agrees with what `step()` then does, and querying it
      repeatedly changes nothing.
- [ ] 6.3 The timeline: one frame per engine step, stepping back lands inside
      the enemy phase, and stepping back from resolved telegraphs restores the
      pending-telegraph board undamaged (phase 1's coverage, on the new path).
- [ ] 6.4 Refusals come from the engine and are forwarded unchanged.
- [ ] 6.5 Existing bench coverage still passes — placement, def tweaks,
      bookmarks, fields — against a bench that now moves through phases.
- [ ] 6.6 `npm test` and `npm run typecheck` clean.

## 7. Verify in a browser

- [ ] 7.1 Play a full round in the browser: step through the enemy phase one
      enemy at a time, confirm the upcoming-action display matches what each
      step does, end the turn, resolve, and confirm the round chains.
- [ ] 7.2 Scrub back into the middle of the enemy phase and confirm the board
      shows that partial state. Judge whether one frame per step makes the
      timeline unusable — if it does, report it rather than silently regrouping.
- [ ] 7.3 Confirm telegraph legibility on the real board, including with both
      field overlays on. Attach or describe what it looks like.
- [ ] 7.4 Load a bookmark saved before this change and step the round.
- [ ] 7.5 Drive the same sequence from chat. The agent's first reply can take
      over two minutes — wait before concluding anything is broken.
