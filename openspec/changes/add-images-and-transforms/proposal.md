## Why

Presentations commonly need embedded images and the ability to rotate or
fade objects (e.g. angled labels, watermark-style overlays, subtle
de-emphasis). Neither exists in the deck harness today: objects are
axis-aligned and fully opaque, and there is no way to place an image at
all.

## Dependencies

This change depends on `add-deck-styling-elements` (shape object types —
`line`, `box`, `ellipse`, `arrow` — and their JSON representation) landing
first. Rotation and opacity are being added as generic fields on every
object type, including those new shapes, so this change's delta specs for
`deck-canvas-display` and `presentation-editing` build on the object model
and canvas rendering that change establishes. Do not start `specs`/`design`
for this change until `add-deck-styling-elements` has reached at least its
own `design` artifact (object schema stable), and prefer implementing this
change after that one has merged.

## What Changes

- Add a new `image` object type: a `src` reference (uploaded/embedded
  image), an independent crop rectangle (source-image coordinates), and a
  destination width/height the cropped region is scaled to fit.
- Add `rotation` (degrees, about the object's center) and `opacity` (0–1)
  fields to every object type — text box, and the `line`/`box`/`ellipse`/
  `arrow` shapes from `add-deck-styling-elements` — not just images.
- Give pi dedicated tools for adding/editing images (set source, set crop,
  set destination size) and for setting rotation/opacity on any target
  object(s).
- Add canvas UI for the user to insert an image, crop it interactively,
  drag a rotate handle on a selected object, and adjust opacity.
- Extend canvas rendering and hit-testing (click, drag, resize) to account
  for a rotated bounding box, and to composite objects at their set
  opacity.
- Persist the new fields (image source/crop/destination size, rotation,
  opacity) through the existing deck-persistence snapshot mechanism.

## Capabilities

### New Capabilities
- `deck-image-elements`: The `image` object type — its JSON representation
  (source reference, crop rectangle, destination size), the pi tools and
  canvas UI for inserting, cropping, and scaling images.

### Modified Capabilities
- `deck-canvas-display`: Rendering must apply per-object rotation and
  opacity for all object types (including images), and pointer
  interactions (click, drag, resize) must account for a rotated bounding
  box rather than assuming axis-aligned objects.
- `presentation-editing`: `presentation_get_state`/`presentation_update`
  must report and accept `rotation` and `opacity` on every object type, and
  gain image-specific actions (set source, set crop, set destination size).
- `deck-shape-elements` *(introduced by `add-deck-styling-elements`)*:
  `line`/`box`/`ellipse`/`arrow` gain `rotation` and `opacity` fields
  alongside their existing shape-specific styling.

## Impact

- `deck-harness-server/src/editor-state.ts`: add `rotation`/`opacity` to
  the shared object shape, add the `image` object type and its fields.
- `deck-harness-server/src/pi-extensions/presentation-bridge.ts`: new tools
  for image creation/editing, and `rotation`/`opacity` actions usable
  against any object type.
- `deck-harness-server/src/deck-persistence.ts`: snapshot schema gains the
  new fields; needs a compatible read path for decks saved before this
  change (and before `add-deck-styling-elements`).
- Image storage: needs a decision (in `design.md`) on where uploaded image
  bytes live — e.g. on-disk under the deck harness's workspace vs. a data
  URI embedded directly in object JSON — with tradeoffs for snapshot size
  and portability.
- `client-deck/src/components/DeckCanvas.tsx`: render images (crop +
  scale) and rotated/opacity-composited objects of every type; rotated
  hit-testing for click/drag/resize; a rotate handle on the selection UI.
- `client-deck` UI: image insert/upload control, crop interaction, opacity
  control.
- `client-deck/src/hooks/useDeckSocket.ts`: wire new object fields through
  to state updates.
