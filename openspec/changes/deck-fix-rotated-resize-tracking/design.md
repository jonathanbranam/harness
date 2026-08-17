## Context

`handlePointerDownResize` (`client-deck/src/components/DeckCanvas.tsx`)
stores each object's position as its unrotated bounding box's top-left
`x`/`y`; rotation is applied at render time about that box's center
(`bounds.x + bounds.width/2`, `bounds.y + bounds.height/2`). The existing
`onMove` handler:

1. Rotates the raw slide-frame pointer delta into the object's local
   (unrotated) frame via `rotateVector(rawDx, rawDy, -rotation)`.
2. Derives `width`/`height` from that local delta per corner, then
   optionally applies `applyAspectRatioLock`.
3. Derives `x`/`y` in the local frame by holding the anchor corner's
   *local* offset from the origin `x`/`y` fixed (e.g. `corner.includes('w')`
   shifts `x` right by `originWidth - width`).
4. Rotates the resulting `(x - originX, y - originY)` position delta back
   into the slide frame and adds it to `originX`/`originY`.

Step 3 pins the anchor corner's offset from the *top-left* corner, not its
offset from the *center* — and rotation is applied about the center. Once
`width`/`height` change, the center moves, so pinning a local top-left-
relative offset doesn't pin the anchor corner's actual on-screen position.
See proposal.md's worked example for the resulting drift.

## Goals / Non-Goals

**Goals:**
- Make the anchor corner's on-screen (slide-frame) position exactly
  invariant during a corner-handle resize, for any `rotation` value.
- Preserve the exact output of steps 1–2 above (local dx/dy, width/height,
  aspect-ratio lock) — only the position derivation (steps 3–4) changes.

**Non-Goals:**
- Changing how `width`/`height` are computed, including aspect-ratio lock.
- Touching `handleCropResize` or the rotate/move handlers (see proposal.md's
  "Out of scope").
- Changing the stored object shape (`x`/`y` stays top-left of the unrotated
  box; rotation stays center-pivoted).

## Decisions

**Replace the local-frame position derivation with a screen-space
center-solve**, computed once `width`/`height` for this move event are
final:

1. Compute the *original* center: `C0 = (originX + originWidth/2, originY
   + originHeight/2)`.
2. Compute the anchor corner's offset from `C0` in the *unrotated* local
   frame, using the *original* size: `anchorLocal0 = (ax * originWidth/2,
   ay * originHeight/2)`, where `ax = corner.includes('w') ? 1 : -1` and
   `ay = corner.includes('n') ? 1 : -1` (the anchor sits on the side
   opposite the dragged corner on each axis).
3. Rotate that offset into the slide frame and add it to `C0` to get the
   anchor's fixed on-screen position: `anchorScreen = C0 +
   rotateVector(anchorLocal0.x, anchorLocal0.y, rotation)`.
4. Compute the anchor's offset from center again, this time using the
   *new* `width`/`height` from steps 1–2: `anchorLocal1 = (ax * width/2,
   ay * height/2)`.
5. Solve for the new center that keeps the anchor on `anchorScreen` after
   rotation: `C1 = anchorScreen - rotateVector(anchorLocal1.x,
   anchorLocal1.y, rotation)`.
6. Convert back to the stored top-left representation: `x = C1.x -
   width/2`, `y = C1.y - height/2`. Feed that into the existing
   `clampRectToSlide({ x, y, width, height })` call, unchanged.

For `rotation === 0`, `rotateVector` is the identity, so `anchorScreen =
C0 + anchorLocal0` and the solve reduces algebraically to today's
`originX + (originWidth - width)` / `originY + (originHeight - height)`
formulas — no behavior change for unrotated objects (matches proposal.md's
"What Changes" and the `deck-canvas-display` delta spec's "Unrotated
resize behavior is unchanged" scenario).

Alternative considered: keep the existing local-frame delta approach and
add a post-hoc correction that measures the anchor's drift and subtracts
it. Rejected — it's the same amount of trig, but as a correction layered
on the existing (already-wrong-for-rotation) derivation rather than a
direct solve, which is harder to verify against the worked example and
easier to get subtly wrong at the boundary where `rotation` crosses 0.

**Where this replaces existing code**: steps 3–4 of `onMove` (`x`/`y`
derivation and the "rotate the position delta back to slide-frame" step)
are replaced by the six-step solve above. Steps 1–2 (local dx/dy,
width/height, aspect-ratio lock) are untouched, so the solve consumes
their output (`width`, `height`) as-is.

## Risks / Trade-offs

- [Extra per-move-event trig (two more `rotateVector` calls) inside a
  pointermove handler] → Negligible: `rotateVector` is already called once
  per move event today, and corner resize handlers aren't a per-frame
  animation loop — this stays well within pointermove budget.
- [Floating-point drift accumulating in `originX`/`originY` across a long
  drag] → Not a new risk: `origin*` values are captured once at
  pointer-down and reused unchanged for every move event (both today and
  after this change), so there's no accumulation — each move event
  recomputes from the same fixed origin.
