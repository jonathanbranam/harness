## 1. Bench store

- [x] 1.1 `selectionView()`: replace `attackByDir` with the engine's `availableActions`, keeping `moveDests` available to existing readers until the client migrates.
- [x] 1.2 Replace `moveSelectedTo` and `attackSelected(dir, target?)` with one `commitSelected(action, tile)` backed by `commitAction`, reporting the engine's rejection reason.
- [x] 1.3 Add `previewSelected(action, tile)` over the engine's `preview`.
- [x] 1.4 Delete `threatTilesFrom` and its documented approximation; `computeFields` uses the engine's `threatTiles`.
- [x] 1.5 Delete the local "mark a hand-driven NPC as spent" workaround — `commitAction` does it.
- [x] 1.6 `tweakDef` applies `reconcileHp` so a changed maximum moves units already on the board.
- [x] 1.7 Delete `DIRECTIONS` and the `Direction` import if nothing else needs them.

## 2. Wire protocol

- [x] 2.1 `intents.ts`: replace the move/attack intents with `{ kind: 'commit', action, tile }`, and add `{ kind: 'preview', action, tile }`.
- [x] 2.2 Mirror `ActionOption` / `ActionPreview` into `client-dungeon/src/bench/types.ts`; drop `Direction` and `DIRECTIONS` if unused.

## 3. Agent tools

- [x] 3.1 `dungeon_unit_options` → reports the engine's action list with availability, reasons, and targets.
- [x] 3.2 `dungeon_attack` takes a target tile; the direction parameter is removed.
- [x] 3.3 Add `dungeon_preview_action`.
- [x] 3.4 Update `AGENTS.md`: aim at a tile, never a direction; ask the engine what a unit may do.

## 4. Client

- [x] 4.1 `BenchControls.tsx`: an action row rendering the engine's list — enabled, or disabled with its reason — replacing the four direction buttons.
- [x] 4.2 `BoardView.tsx`: paint the active action's targets by its overlay hint; paint the hovered tile's preview.
- [x] 4.3 Clicking a target commits; clicking elsewhere cancels the action rather than acting.

## 5. Tests

- [x] 5.1 Availability: both actions offered; both unavailable after attacking, with reasons; move unavailable but attack live at zero budget.
- [x] 5.2 Aiming: a magic-user's off-axis arm is offered and resolves the cross containing it.
- [x] 5.3 Refusal: an aligned tile beyond reach is refused and damages nothing.
- [x] 5.4 Threat stops at a blocker (the behaviour the deleted approximation got wrong).
- [x] 5.5 A hand-driven NPC cannot attack twice, with the bench's own workaround gone.
- [x] 5.6 `tweakDef` lowering a maximum leaves a wounded unit alive at 1 HP.
- [x] 5.7 Preview reports damage and `hitsNothing` without changing the board.

## 6. Gates

- [x] 6.1 `npm test` and `npm run typecheck` clean.
- [x] 6.2 `npm run build:client-dungeon` clean.
- [x] 6.3 Browser check with playwright against dev servers I start and stop: select a unit, see both actions; aim a magic-user at an off-axis arm and watch the cross resolve; confirm a disabled action shows its reason; confirm the agent can drive the same bench through the new tools.

## 7. Found while implementing

- [x] 7.1 Browser testing caught a real defect: with an action armed, clicking a unit standing on a target tile **reselected that unit** instead of committing the attack, because unit clicks were routed to selection unconditionally. Aiming now takes precedence over selecting, as it does in the game.
- [x] 7.2 The threat-overlay blocking test as first written was wrong: a mobile unit simply walks around a blocker, so the field legitimately still covers the tile behind it. Blocking is asserted where it is observable — the tiles an attack is offered from one position — and the field's behaviour is documented in a second test so it does not read as a bug later.
- [x] 7.3 `AGENTS.md` sharpened after the agent described the blast as "centered on the aim tile": aiming at an arm resolves the cross containing it, and `dungeon_preview_action` is the way to know.
