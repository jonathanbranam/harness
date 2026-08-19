## Why

The bench presents four direction buttons — up / down / left / right — to aim an attack. The game does not work that way: it highlights every tile an attack could cover and lets the player choose one, inferring the direction. For a melee unit the two look equivalent. For the magic-user they are not: its attack is a cross centred two tiles away, so the tiles to either side of that centre are targetable and a direction picker cannot express them.

A designer reasoning about the magic-user in the bench has therefore been reasoning about a control scheme the game does not have — in a tool whose entire purpose is to tell them the truth about unit behaviour.

The bench also reconstructs "what can this unit hit" from definition fields, because the engine's targeting scan used to be private. It documented itself as an upper bound that ignores blocking. Both gaps are closed by `dungeon-engine-action-surface`, already adopted by the game in `dungeon-game-action-adoption`.

## What Changes

- The bench drives every action through the engine's `availableActions` / `preview` / `commitAction`. **The four direction buttons are removed.**
- The designer picks an action — Move or Attack — and then a **tile**. Both actions are always listed; an unavailable one is disabled with the engine's reason instead of vanishing.
- Hovering a candidate tile previews what the action would do: the tiles it covers, what it would damage, and whether it would hit nothing.
- The threat overlay uses the engine's `threatTiles` instead of the bench's band approximation, so it accounts for blocking and no longer overstates reach.
- Session definition tweaks apply the engine's `reconcileHp`, so a lowered maximum wounds units in play as it does in the game instead of leaving them untouched.
- **Agent tools change shape**: `dungeon_unit_actions` reports what a unit may do; `dungeon_attack` takes a target tile rather than a direction. The agent aims exactly as the designer does.
- The bench's own workaround marking a hand-driven NPC as spent is dropped — the engine does it now.

## Capabilities

### Modified Capabilities
- `dungeon-bench`: actions and their legal targets come from the engine's action surface; aiming is by tile; the threat overlay is engine-derived; definition changes reconcile HP.

## Impact

- `dungeon-harness-server/src/bench/`: `bench-store.ts` (selection view, move/attack, fields, def tweaks), `intents.ts`.
- `dungeon-harness-server/src/pi-extensions/bench-bridge.ts`: tool surface.
- `dungeon-harness-server/templates/agent-workspace/AGENTS.md`.
- `client-dungeon/src/`: `bench/types.ts`, `components/BenchControls.tsx`, `components/BoardView.tsx`.
- **Breaking for the agent**: `dungeon_attack`'s arguments change. Nothing is persisted in that shape, so no migration — saved bookmarks store board state, not actions.
- Depends on `dungeon-engine-action-surface` in the sibling track-web repo, consumed through the existing `file:` dependency.
