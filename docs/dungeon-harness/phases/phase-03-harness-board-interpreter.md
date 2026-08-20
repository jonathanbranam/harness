> # ⛔ STOPPED — superseded work, do not implement
>
> **This plan is stopped and has been fully backed out** (2026-08-18). The
> Gherkin-authoring dungeon-harness approach it belongs to put the LLM in
> the referee's chair for game rules, and the harness was never usable as a
> design tool. See [`../STATUS.md`](../STATUS.md) for why, what landed, and
> what happens to each piece, and [`../backout-plan.md`](../backout-plan.md)
> for the removal plan.
>
> **The replacement is the harness rebuild**
> ([`../harness-rebuild/phase-plan.md`](../harness-rebuild/phase-plan.md), the
> plan of record) — a design bench that plays a board through the real engine.
> Phases 1–4 shipped 2026-08-19. Its rules layer, a declarative unit language
> ([`../turn-machines/README.md`](../turn-machines/README.md)), is **still
> under evaluation and not approved**; only a scoped slice is planned, as
> phase 5.
>
> Kept for historical context only. The **Status** line below records what
> actually landed before the stop.

# Phase 03 — Harness board & local rules interpreter

**Repo:** `harness`
**Depends on:** 01
**Parallel with:** 02, 04, 05

**Status:** ✅ Complete, then ❌ **ALREADY REVERTED** — archived as
`2026-08-16-harness-board-interpreter`, then `board-engine/` was deleted wholesale by
`2026-08-16-dungeon-board-tool-enhancements`, which replaced every rule-aware tool with generic
drawing primitives. That trade is what caused the failure documented in
[`../board-rules-engine-exploration.md`](../board-rules-engine-exploration.md).
**Disposition:** Gone already. Its *intent* — a real rules engine behind the board — returns in the
replacement direction, but as a **shared** engine imported from the game, never a local re-port.

## Goal

Give the harness its own live game board, plus a local, pure
reimplementation of just enough of the movement/attack model to preview a
scenario's steps while the designer writes them.

## Decisions carried over from `proposal.md`

- **Reimplemented locally, not imported.** dungeon-harness never gets
  `write`/`edit`/import access to track-web's engine code (`pc.ts`/
  `npc.ts`/`attackFootprint.ts`/`pathfinding.ts`) — see `proposal.md`'s
  "The game board" section. This isn't just a boundary rule: the archetype
  system these scenarios will eventually describe isn't implemented in
  track-web's current engine at all, so there's no production-accurate
  code to import even if the boundary allowed it.
- **Scoped to today's existing unit shape, not the full spec.** Per
  `proposal.md`'s "Archetype scope" decision, round one (phase 08) targets
  the 4 existing units in their current simple `UnitDef` shape — direction
  targeting, single/line/plus propagation, plain range-based movement —
  **not** the full composable `movement.md`/`attack.md` model. Build only
  that much here; grow it once scenario work moves onto the real archetype
  system (future work, out of scope for this phase plan).

## Concrete steps

- New pure TS module in `dungeon-harness-server/src/board-engine/`:
  range-limited grid movement/pathing, and single/line/plus attack-footprint
  calculation with cardinal-direction targeting — a fresh, small
  implementation matching today's `UnitDef` shape's behavior, not a port of
  track-web's code.
- In-memory board store (own module, analogous to deck-harness's
  `editor-state.ts`): grid, terrain, unit placements.
- `pi-extensions/board-bridge.ts`: register `dungeon_get_board_state`,
  `dungeon_preview_movement`, `dungeon_preview_attack`,
  `dungeon_place_unit`, `dungeon_set_terrain` (per `proposal.md`'s tool
  sketch), operating on the board store.
- `client-dungeon`: a board canvas — **plain SVG/Canvas, not Phaser** (per
  `proposal.md`: client-deck already made this call for its own live-state
  view; do the same here) — rendering terrain, unit placement, and
  movement/attack previews.
- No Gherkin I/O in this phase — that's phase 05. This phase is purely the
  visual/interpreter half.

## Deliverable

In the browser, place units on a board and ask the agent to preview a
movement path or an attack's footprint; see the result rendered on the
board.

## Suggested OpenSpec capability

`dungeon-board-bridge`.
