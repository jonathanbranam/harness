## Why

The deck harness currently only supports text-box objects and has no
concept of a slide background color or non-text shapes. Presentations
routinely need basic shapes (lines, boxes, ellipses/circles, arrows) for
diagrams, dividers, and emphasis, and a colored slide background for visual
identity. Both pi and the user need to be able to create and style these
elements, and to control which elements draw on top of which (z-order).

## What Changes

- Add a `backgroundColor` field to `Slide`, settable by pi and the user, defaulting to the slide's current implicit background.
- Add new shape object types alongside the existing text box: `line` (straight, with thickness), `box` (rectangle, with an optional corner radius), `ellipse` (including circles as an equal-width/height special case), and `arrow` (a straight line with an arrowhead at one or both ends).
- Add a `zIndex`-style ordering to slide objects (persisted in each object's JSON) that determines paint/stacking order, with sensible defaults for newly added objects (on top of existing objects).
- Give pi dedicated tools for creating and editing shapes, including line style (color, thickness, dash — as applicable per shape) and fill options (color or transparent, as applicable per shape), and for changing an object's z-order (bring forward/backward/to front/to back or an explicit index).
- Add toolbar controls for the user to move a selected object forward/backward in z-order (and likely to front/back) from the canvas UI.
- Extend the canvas renderer to draw the new shape types and the slide's background color, respecting z-order for all objects (including existing text boxes).
- Persist the new fields (background color, shape type/geometry, z-order) through the existing deck-persistence snapshot mechanism.

## Capabilities

### New Capabilities
- `deck-shape-elements`: Shape object types (line, box, ellipse/circle, arrow), their JSON representation, line/fill styling, corner radius (`box` only), z-order semantics, and the pi tools/canvas UI for creating, editing, and reordering them.

### Modified Capabilities
- `deck-canvas-display`: Canvas rendering must draw the slide's background color and paint all objects (existing text boxes and new shapes) in z-order rather than array order.
- `presentation-editing`: `presentation_get_state` must report `zIndex` (and slide `backgroundColor`) so pi's context reflects stacking order and background; the shared-state/live-sync requirements extend to the new shape object types.
- `deck-management`: deck/slide state now includes a per-slide `backgroundColor`, and slide creation must define its default value.
- `deck-undo-redo`: shape creation/removal, z-order changes, shape styling, and slide background color changes are content mutations and must be captured in the shared undo/redo history like every other edit (this capability didn't exist yet when this change was first proposed — see design.md's "Undo/redo integration" decision).

## Impact

- `deck-harness-server/src/editor-state.ts`: extend `DeckObject`/`Slide` types, `applyUpdate` actions, and default object construction; extend `UPDATE_DESCRIPTIONS`/`MERGEABLE_UPDATE_ACTIONS` for the new actions and give `withHistory` an optional merge key so `setSlideBackgroundColor` gets the same history capture as the rest (see design.md's "Undo/redo integration" decision).
- `deck-harness-server/src/pi-extensions/presentation-bridge.ts`: new/extended tool definitions for shape creation, shape-specific styling, and z-order changes.
- `deck-harness-server/src/deck-persistence.ts`: snapshot schema gains the new fields (background color, shape fields, zIndex) — needs a compatible read path for existing saved decks that predate this change.
- `client-deck/src/components/DeckCanvas.tsx`: render slide background color; render shape types; sort objects by `zIndex` before painting; add UI affordance(s) for creating each shape type; give `fix-selection-tools-zorder`'s selection/editing overlay an explicit `z-index` so it keeps outranking objects once they carry their own (see design.md's "Interaction with `fix-selection-tools-zorder`'s overlay" decision).
- `client-deck` toolbar UI: add move-forward/move-backward (and front/back) controls for the current selection.
- `client-deck/src/hooks/useDeckSocket.ts`: wire any new WS message fields through to state updates if the existing `object_update`/state broadcast shape needs new fields.
