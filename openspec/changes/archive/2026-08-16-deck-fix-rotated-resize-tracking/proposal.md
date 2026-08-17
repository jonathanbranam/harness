## Why

Resizing a rotated box, ellipse, text box, or image via a corner handle
doesn't keep the opposite (anchor) corner visually pinned in place, even
though that's exactly what happens for an unrotated object today.
`handlePointerDownResize` (`client-deck/src/components/DeckCanvas.tsx`)
keeps the anchor corner's *unrotated local* x/y unchanged during the drag,
then lets the existing rotate-about-center rendering apply on top. Since an
object's rotation pivot is its own center, and that center shifts whenever
width/height change, holding the anchor's *local* coordinates fixed does
not hold its *on-screen* position fixed once the object is rotated — the
whole shape visibly drifts and swims during the drag instead of growing
predictably from a fixed point. (Worked example: a 100×100 box rotated 45°,
dragged 100px straight down on its bottom/`se` handle, computes correctly
in local space, but its "anchored" `nw` corner drifts about 38px on screen
during that single drag — it is not actually anchored.) This is what reads
as "scaling from the original orientation" or "resize applied before
rotation": the object's rotation is right, its *width/height* growth
direction is right, but the position math re-centers the shape around a
point that isn't where the user's mental anchor corner actually is on
screen.

## What Changes

- `handlePointerDownResize`'s position (`x`/`y`) derivation changes from
  "the anchor corner's local coordinates are unchanged" to "the anchor
  corner's on-screen (slide-logical) position is unchanged": compute the
  anchor corner's pre-drag screen position from the object's origin
  center/rotation, then solve for the new center such that, after applying
  the *new* width/height and the *same* rotation, the anchor corner lands
  back on that exact screen position.
- For an unrotated object (`rotation === 0`) this reduces to exactly
  today's behavior — the fix only changes anything once rotation is
  nonzero, so unrotated resize (covered by `deck-object-bounds` and the
  existing `deck-canvas-display` pointer-interaction requirements) is
  unaffected.
- Composes with the just-shipped Shift-held aspect-ratio-lock modifier
  (`deck-resize-aspect-ratio-lock`): the anchor stays pinned regardless of
  whether the resize is unconstrained or ratio-locked, since the fix only
  changes how position is derived from a final width/height, not how that
  width/height is computed.
- Out of scope: the image crop-rectangle's own corner-handle resize
  (`handleCropResize`) — the crop rectangle is defined in the image's
  source-pixel space and is never itself rotated (only the image's
  destination box can be), so it has no anchor-drift problem to fix.
- Out of scope: drag-to-move and the rotate handle — neither resizes the
  object, so neither is affected by this fix.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `deck-canvas-display`: the existing "Pointer interactions account for
  object rotation" requirement area gains a requirement that corner-handle
  resizing of a rotated object keeps the opposite corner visually anchored
  on screen, matching the precedent already established for unrotated
  objects.

## Impact

- `client-deck/src/components/DeckCanvas.tsx`: `handlePointerDownResize`'s
  `onMove` handler — replace the anchor-corner position derivation with a
  center-solve that pins the anchor corner's on-screen position, applied
  after width/height (including any aspect-ratio-lock adjustment) are
  finalized, before the existing `clampRectToSlide` call.
- No server-side or protocol changes — this is purely live-drag editor
  math; the committed `setPosition`/`setSize` actions keep their existing
  shape.
