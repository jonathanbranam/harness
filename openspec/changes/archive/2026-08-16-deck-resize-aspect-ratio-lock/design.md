## Context

Corner-handle resize logic lives entirely in
`client-deck/src/components/DeckCanvas.tsx`, in two structurally similar
`onMove` handlers set up on `pointerdown`:

- `handlePointerDownResize` — box/ellipse/text-box/image destination-box
  resize. Computes a raw pointer delta, rotates it into the object's local
  (unrotated) frame, derives `width`/`height` per axis from `corner`
  (`n`/`s`/`e`/`w` membership), derives the anchor-corner `x`/`y` shift from
  the width/height delta, rotates that shift back to slide-frame, then runs
  the result through `clampRectToSlide`.
- `handleCropResize` — an image's crop rectangle. Same per-axis corner math,
  applied to the crop rect's own coordinate space, independent of the
  destination box.

Both currently derive width and height independently per axis with no
concept of aspect ratio. See proposal.md for why that's a problem.

## Goals / Non-Goals

**Goals:**
- Add a modifier-gated (Shift) aspect-ratio constraint to both resize paths
  above, live during the drag.
- Keep the existing rotation-local-frame transform and anchor-corner math
  unchanged — aspect ratio is a post-process layered on top, not a rewrite.

**Non-Goals:**
- No persistent per-object "lock aspect ratio" setting — this is a
  transient, modifier-held gesture only, per proposal.md.
- No change to line/arrow endpoint-drag resize.
- No server/protocol changes; `setPosition`/`setSize`/crop actions committed
  on pointer-up keep their existing shape.

## Decisions

**Modifier key: Shift.** Matches the convention in every comparable editor
(PowerPoint, Keynote, Figma, Google Slides all use Shift for
proportional/constrained resize). Alt/Option is deliberately left unused
here rather than repurposed, in case a future change wants it for
center-anchored resize — a different, unrelated constraint.

**Ratio math is a post-process step on top of the existing per-axis
computation, not a replacement.** In both handlers, keep computing the
unconstrained per-axis `width`/`height` exactly as today, then — only when
the modifier is held — override whichever of `width`/`height` corresponds
to the axis the dragged corner does *not* primarily determine, deriving it
from the other axis's delta and the origin aspect ratio (`originWidth /
originHeight`, captured once at drag start, same place `originWidth`/
`originHeight` are already captured today). Concretely: pick the axis whose
raw delta (`dx` or `dy`, already available post-rotation) is larger in
magnitude relative to the object's origin size as the "driving" axis, and
derive the other dimension from it via the ratio. This keeps the anchor
corner (the one opposite the dragged handle) fixed, since the existing
`x`/`y` derivation from `width`/`height` deltas (lines computing `x`/`y`
from `corner.includes('w')`/`'n'`) is untouched — it just now runs against
ratio-adjusted `width`/`height`.

Alternative considered: always derive both dimensions from a single axis
(e.g. always `dx`). Rejected — it would make the object stop tracking the
pointer on whichever axis was chosen as "wrong," which feels broken during
a diagonal drag. Picking the larger-magnitude axis as driving, dominant-axis
style, is what Figma/Keynote/PowerPoint do and matches user expectations
carried over from those tools.

**Ratio is captured fresh per drag, not stored on the object.** Read
`originWidth`/`originHeight` (already in scope) at the same point they're
already captured; no new object field or persisted state.

**Rotation handling needs no new logic.** `handlePointerDownResize` already
rotates the raw pointer delta into the object's local frame before doing
per-axis math (`rotateVector(rawDx, rawDy, -rotation)`); the aspect-ratio
post-process runs on those already-local `dx`/`dy` and the local
`width`/`height`, so it composes with rotation for free.

**`clampRectToSlide` still runs last, unchanged.** The aspect-ratio
adjustment happens before the existing clamp call in both handlers, exactly
where the unconstrained width/height/x/y were previously passed in — same
precedence as today's resize-to-slide-edge behavior, just fed
ratio-adjusted input.

**`MIN_SIZE` floor applies before the ratio derivation borrows a dimension's
value**, same as it does today for the driving axis, so a ratio-derived
dimension can still be pushed below `MIN_SIZE` in extreme cases (see Risks).

## Risks / Trade-offs

[Reusing Shift, which is already read elsewhere in `DeckCanvas.tsx` for
click-to-multi-select] → No conflict: multi-select reads `e.shiftKey` off a
`click`/`pointerdown` on the object/background, a different gesture from a
resize-handle drag already in progress. The resize handlers read the
modifier off the `pointermove`/`pointerdown` events within their own
listener scope.

[Aspect-ratio-preserving resize combined with slide-bounds clamping can
silently break the exact ratio right at a slide edge] → Accepted and
called out explicitly in the spec (deck-canvas-display "Aspect-ratio
constraint still respects slide-bounds clamping"). Same precedence
unconstrained resize already has at the slide edge today, so this isn't a
new category of surprise.

[Deriving the non-driving dimension from the ratio could push it below
`MIN_SIZE` when the driving axis is dragged to a very small size] →
Low-severity edge case (a barely-visible object); accept for now rather
than adding asymmetric clamping logic that would itself distort the ratio
it's trying to preserve.
