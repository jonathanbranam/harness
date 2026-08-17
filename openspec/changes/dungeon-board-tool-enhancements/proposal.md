## Why

`dungeon-board-bridge`'s current tools (`dungeon_place_unit`, `dungeon_preview_movement`,
`dungeon_preview_attack`, ...) hardcode a fixed archetype catalog and a local
reimplementation of track-web's movement/attack math. That locks scenario
authoring to whatever this harness's copy of the game rules currently
covers, and every rule change in track-web (new archetype, new propagation
shape, a damage-formula tweak) requires updating this harness's duplicate
engine to match. The harness doesn't need to referee the game — it needs to
let the agent *draw* whatever the designer is describing (a unit, a
threat-range overlay, a proposed path) on a shared board surface. Replacing
the game-rule-aware tools with generic drawing primitives — shapes, lines,
overlays, cell fills, labels, all enumerable/movable/removable by id —
removes that duplication entirely and lets the agent represent any
scenario concept without the harness needing a matching rule.

## What Changes

- **BREAKING**: Remove the archetype catalog and all game-rule tools:
  `dungeon_place_unit` (fixed archetypes), `dungeon_preview_movement`,
  `dungeon_move_unit` (range/occupancy pathing), `dungeon_preview_attack`
  (footprint/penetration math). The harness no longer computes movement
  range, path validity, or attack footprints/hits.
- **BREAKING**: Replace `dungeon_set_terrain`'s fixed terrain enum with a
  generic per-cell fill color, so "terrain" is just a visual base layer the
  agent chooses, not a vocabulary the harness interprets.
- Add generic board-object primitives the agent can draw directly:
  - Shapes: a labeled circle or rectangle at a cell/position, with caller-chosen
    color and label text (covers what "place a unit" used to mean, plus
    anything else worth marking).
  - Lines/paths: a styled (solid/dashed) line or multi-point path between
    coordinates, with caller-chosen color (covers movement-path and
    connector annotations).
  - Overlays: a semi-transparent colored region over one or more cells
    (covers attack-footprint/movement-range/threat-range highlighting, or
    any other "highlight this area" need).
  - Cell fill: a base (non-transparent) color per cell, replacing the old
    terrain enum.
  - Text labels: freestanding text not attached to a shape.
- Add generic object lifecycle tools: list every object currently on the
  board (with type, position/geometry, color, label, id), move an object
  to a new position, update an object's style/label, and remove an object
  by id — all independent of what the object "means."
- Keep the existing board-dimensions/grid model, the clear-board tool, and
  the live WebSocket broadcast-on-change behavior; keep the board canvas
  rendering pipeline in `client-dungeon`, generalized to render arbitrary
  drawn objects (shapes, lines, overlays, fills, labels) instead of
  archetype-specific unit glyphs and enum-driven terrain colors.

## Capabilities

### New Capabilities
(none — this reshapes the existing board-tools capability rather than adding a new one)

### Modified Capabilities
- `dungeon-board-bridge`: replace every game-rule requirement (fixed
  archetype catalog, range-limited pathing, attack footprint/penetration
  math, terrain enum) with generic drawing-primitive requirements (shapes,
  lines, overlays, cell fills, labels, and id-based list/move/update/remove
  for any drawn object). Board initialization, live broadcast-on-change,
  and canvas rendering requirements carry forward, generalized to arbitrary
  objects instead of units/terrain-enum/preview overlays.

## Impact

- `dungeon-harness-server/src/pi-extensions/board-bridge.ts` (and its test):
  tool handlers rewritten from archetype/movement/attack logic to generic
  primitive CRUD.
- `dungeon-harness-server/src/board-state.ts` (and its test) and
  `dungeon-harness-server/src/board-engine/`: board-state shape changes from
  `{ dimensions, cells: {terrain}, units }` to `{ dimensions, cells: {fillColor}, objects }`;
  the movement/attack engine code in `board-engine/` is removed entirely
  (no longer needed once the harness stops computing paths/footprints).
- `dungeon-harness-server/src/session-store.ts`: tool allowlist updated to
  the new tool names, old ones removed.
- `client-dungeon/src/components/BoardCanvas.tsx`: rendering generalized
  from archetype-glyph/terrain-enum/preview-overlay drawing to
  generic shape/line/overlay/fill/label rendering.
- Out of scope, explicitly: every scenario-lifecycle capability —
  `dungeon-scenario-authoring` (`dungeon_read_feature`/`dungeon_write_feature`/
  `dungeon_write_implementation_notes`) and `dungeon-baseline-changeset`
  (`dungeon_load_baseline`, `dungeon_read_step_catalog`, and its changeset
  computation). `dungeon_load_baseline` takes an archetype name only as a
  plain string key to look up a `.feature` file path in track-web — it does
  not call into or depend on the board-bridge archetype catalog being
  removed here. Also no impact on `dungeon-agent-session`/
  `dungeon-tool-permission-gate`, which don't reference board tools at all.
