## Why

Presentations commonly need embedded images and the ability to rotate or
fade objects (e.g. angled labels, watermark-style overlays, subtle
de-emphasis). Neither exists in the deck harness today: objects are
axis-aligned and fully opaque, and there is no way to place an image at
all.

## Dependencies

`add-deck-styling-elements` has landed (archived as
`2026-08-16-add-deck-styling-elements`, specs synced), so this change is no
longer blocked. It builds directly on what that change established:
`DeckObject` is now a discriminated union (`TextBoxObject | BoxObject |
EllipseObject | LineObject | ArrowObject`) sharing a `BaseDeckObject { id,
zIndex }`, every object carries a persisted `zIndex` used for paint order
(`deck-canvas-display`'s "Objects paint in z-order" requirement), and
`deck-undo-redo` now wraps every content mutation in a shared history with
an exhaustive `UpdateAction` union. This change's new fields, actions, and
object type must fit all three of those mechanisms, not just the object
schema `add-deck-styling-elements` originally sketched.

## What Changes

- Add a new `image` object type: a `src` reference (uploaded/embedded
  image), an independent crop rectangle (source-image coordinates), and a
  destination width/height the cropped region is scaled to fit.
- Add `opacity` (0–1) to every object type (text box, `image`, and the
  `line`/`box`/`ellipse`/`arrow` shapes from `add-deck-styling-elements`),
  and `rotation` (degrees, about the object's center) to every
  bounding-box-shaped type — text box, `image`, `box`, `ellipse`.
  `line`/`arrow` are deferred: their geometry is already two independently
  positionable endpoints, so an angled line needs no extra `rotation`
  field, and rotating around a `boundsOf()`-derived center on top of that
  is redundant and easy to get wrong (endpoint edits and rotation would
  fight over the same visual angle). Revisit only if a concrete case
  (rotating a line together with other selected objects as a group) shows
  the endpoint model isn't enough.
- Give pi a dedicated tool for adding/editing images (set source, set crop,
  set destination size), mirroring `presentation_add_shape`'s pattern from
  `add-deck-styling-elements`. Rotation/opacity are cross-type fields, so
  expose them as new `presentation_update` actions (`setRotation`,
  `setOpacity`) rather than a bespoke tool — matching how that change made
  z-order and `setBorderColor` generic actions on the existing tool instead
  of new ones.
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
- `deck-canvas-display`: Rendering must apply per-object opacity for all
  object types and rotation for bounding-box types (text box, `image`,
  `box`, `ellipse`), and pointer interactions (click, drag, resize) must
  account for a rotated bounding box on those types rather than assuming
  axis-aligned objects.
- `presentation-editing`: `presentation_get_state`/`presentation_update`
  must report and accept `opacity` on every object type and `rotation` on
  bounding-box types, and gain image-specific actions (set source, set
  crop, set destination size).
- `deck-shape-elements` *(introduced by `add-deck-styling-elements`)*:
  `box`/`ellipse` gain `rotation` and `opacity` fields; `line`/`arrow` gain
  `opacity` only (see rotation deferral above) alongside their existing
  shape-specific styling.
- `deck-object-bounds`: slide-bounds clamping (`clampToSlide`) currently
  clamps an object's unrotated, axis-aligned `boundsOf()` box. A rotated
  object's true on-screen footprint can extend past that box's edges even
  when the stored geometry is fully clamped. `design.md` must state
  explicitly whether clamping stays keyed to unrotated stored geometry
  (simplest; rotated corners can visually cross the slide edge) or is
  changed to account for the rotated footprint — this change cannot ship
  without picking one.
- `deck-undo-redo`: the new `setRotation`/`setOpacity` actions and the
  image tool's create/set-source/set-crop/set-destination-size operations
  must extend `UpdateAction`, get `UPDATE_DESCRIPTIONS` entries, and get an
  explicit mergeable-or-not classification (a rotate-handle drag or an
  opacity-slider drag are natural `MERGEABLE_UPDATE_ACTIONS` candidates,
  matching `setPosition`/`setStrokeWidth`; image source/crop/destination
  changes are more likely discrete, one-entry-per-call actions).

## Impact

- `deck-harness-server/src/editor-state.ts`: add `opacity` (and, for
  bounding-box types, `rotation`) to the relevant object interfaces; add
  the `image` object type (participating in `BaseDeckObject`'s `zIndex`
  via `nextZIndex()` like every other type); add `setRotation`/`setOpacity`
  to the `UpdateAction` union with `UPDATE_DESCRIPTIONS` entries and a
  `MERGEABLE_UPDATE_ACTIONS` decision; decide (per the `deck-object-bounds`
  note above) whether `clampToSlide` needs to change for rotated objects.
- `deck-harness-server/src/pi-extensions/presentation-bridge.ts`: a new
  `presentation_add_image`-style tool for image creation/editing
  (mirroring `presentation_add_shape`), and `setRotation`/`setOpacity`
  added to `presentation_update`'s existing `ACTIONS` union.
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
