## 1. Bench store

- [ ] 1.1 `selectionView()`: replace `attackByDir` with the engine's `availableActions`, keeping `moveDests` available to existing readers until the client migrates.
- [ ] 1.2 Replace `moveSelectedTo` and `attackSelected(dir, target?)` with one `commitSelected(action, tile)` backed by `commitAction`, reporting the engine's rejection reason.
- [ ] 1.3 Add `previewSelected(action, tile)` over the engine's `preview`.
- [ ] 1.4 Delete `threatTilesFrom` and its documented approximation; `computeFields` uses the engine's `threatTiles`.
- [ ] 1.5 Delete the local "mark a hand-driven NPC as spent" workaround — `commitAction` does it.
- [ ] 1.6 `tweakDef` applies `reconcileHp` so a changed maximum moves units already on the board.
- [ ] 1.7 Delete `DIRECTIONS` and the `Direction` import if nothing else needs them.

## 2. Wire protocol

- [ ] 2.1 `intents.ts`: replace the move/attack intents with `{ kind: 'commit', action, tile }`, and add `{ kind: 'preview', action, tile }`.
- [ ] 2.2 Mirror `ActionOption` / `ActionPreview` into `client-dungeon/src/bench/types.ts`; drop `Direction` and `DIRECTIONS` if unused.

## 3. Agent tools

- [ ] 3.1 `dungeon_unit_options` → reports the engine's action list with availability, reasons, and targets.
- [ ] 3.2 `dungeon_attack` takes a target tile; the direction parameter is removed.
- [ ] 3.3 Add `dungeon_preview_action`.
- [ ] 3.4 Update `AGENTS.md`: aim at a tile, never a direction; ask the engine what a unit may do.

## 4. Client

- [ ] 4.1 `BenchControls.tsx`: an action row rendering the engine's list — enabled, or disabled with its reason — replacing the four direction buttons.
- [ ] 4.2 `BoardView.tsx`: paint the active action's targets by its overlay hint; paint the hovered tile's preview.
- [ ] 4.3 Clicking a target commits; clicking elsewhere cancels the action rather than acting.

## 5. Tests

- [ ] 5.1 Availability: both actions offered; both unavailable after attacking, with reasons; move unavailable but attack live at zero budget.
- [ ] 5.2 Aiming: a magic-user's off-axis arm is offered and resolves the cross containing it.
- [ ] 5.3 Refusal: an aligned tile beyond reach is refused and damages nothing.
- [ ] 5.4 Threat stops at a blocker (the behaviour the deleted approximation got wrong).
- [ ] 5.5 A hand-driven NPC cannot attack twice, with the bench's own workaround gone.
- [ ] 5.6 `tweakDef` lowering a maximum leaves a wounded unit alive at 1 HP.
- [ ] 5.7 Preview reports damage and `hitsNothing` without changing the board.

## 6. Gates

- [ ] 6.1 `npm test` and `npm run typecheck` clean.
- [ ] 6.2 `npm run build:client-dungeon` clean.
- [ ] 6.3 Browser check with playwright against dev servers I start and stop: select a unit, see both actions; aim a magic-user at an off-axis arm and watch the cross resolve; confirm a disabled action shows its reason; confirm the agent can drive the same bench through the new tools.
