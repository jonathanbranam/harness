## Why

Resizing a box, ellipse, text box, or image on the deck canvas today changes
width and height independently per axis, so there's no way to scale an
object proportionally without doing the math by hand. Most editors solve
this with a modifier key held during the resize drag; deck-harness has no
equivalent, making it easy to accidentally distort a shape or image while
resizing it.

## What Changes

- Holding a modifier key (Shift, matching the convention used elsewhere for
  this kind of drag-constraint in comparable editors) while dragging a
  corner resize handle constrains the resize to the object's aspect ratio
  at the start of the drag, instead of scaling width/height independently.
- The constraint is evaluated live during the drag (not just on release),
  so the visual feedback while dragging already shows the proportional
  result, and applies while the modifier is held down at any point during
  the drag — not only if it was held at pointer-down.
- Releasing the modifier mid-drag reverts to independent per-axis resizing
  for the rest of that drag.
- Existing slide-bounds clamping (deck-object-bounds) still applies after
  the aspect-ratio constraint is computed, so a proportional resize that
  would push the object off the slide is still clamped the same way an
  unconstrained resize is today.
- Applies to every corner-handle sizing interaction that has an independent
  width/height to preserve a ratio between: box and ellipse shapes, text
  boxes, an image's destination box, and an image's crop rectangle (its own
  independent aspect ratio, separate from the destination box's). Lines and
  arrows are out of scope — they're resized by dragging an endpoint, not a
  corner handle, and have no width/height pair for a ratio to apply to.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `deck-canvas-display`: adds a requirement that corner-handle resizing
  preserves the object's aspect ratio while a modifier key is held.

## Impact

- `client-deck/src/components/DeckCanvas.tsx`:
  - `handlePointerDownResize`'s `onMove` handler (destination-box resize for
    box/ellipse/text box/image) gains aspect-ratio-preserving math, gated on
    the pointer event's modifier-key state, before existing
    `clampRectToSlide` clamping is applied.
  - `handleCropResize`'s `onMove` handler (image crop-rectangle resize)
    gains the same modifier-gated aspect-ratio constraint, using the crop
    rectangle's own starting aspect ratio (independent of the destination
    box's, per existing "crop and destination are independent rectangles"
    behavior).
- No server-side or protocol changes — this is purely live-drag editor
  behavior; the committed `setPosition`/`setSize`/crop actions sent on
  pointer-up are unchanged in shape.
