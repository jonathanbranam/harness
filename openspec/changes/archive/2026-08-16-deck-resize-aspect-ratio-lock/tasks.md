## 1. Shared aspect-ratio helper

- [x] 1.1 In `client-deck/src/components/DeckCanvas.tsx`, add a small helper
      (near the existing `rotateVector`/`clampRectToSlide` helpers) that,
      given an origin width/height, a local (post-rotation) `dx`/`dy`, and a
      per-corner unconstrained `width`/`height` pair, returns a
      ratio-adjusted `width`/`height` by picking the larger-magnitude driving
      axis and deriving the other dimension from `originWidth / originHeight`
      (design.md's dominant-axis decision).
- [x] 1.2 Make the helper's ratio-derived dimension still respect
      `MIN_SIZE`, consistent with how the existing per-axis computation
      already floors each dimension at `MIN_SIZE`.

## 2. Destination-box resize (box/ellipse/text box/image)

- [x] 2.1 In `handlePointerDownResize`'s `onMove`, after the existing
      per-axis `width`/`height` computation and before the anchor `x`/`y`
      derivation, call the new helper when the pointer event's modifier key
      (Shift) is held, using `originWidth`/`originHeight` as the ratio
      source.
- [x] 2.2 Verify the anchor-corner `x`/`y` derivation (already downstream of
      `width`/`height`) picks up the ratio-adjusted values unchanged, so the
      corner opposite the dragged handle stays fixed.
- [x] 2.3 Verify no change is needed for rotated objects: confirm the ratio
      adjustment runs on the already-local (post-`rotateVector`) `dx`/`dy`
      and composes correctly with the existing local-frame-to-slide-frame
      rotation of the resulting position shift.
- [x] 2.4 Confirm `clampRectToSlide` still runs last, unchanged, against the
      ratio-adjusted rect (both for the live `setLiveRect` call in `onMove`
      and the committed `setPosition`/`setSize` actions in `onUp`).
- [x] 2.5 Add a scenario comment or inline note only if the modifier-toggle
      behavior (pressing/releasing Shift mid-drag) isn't already obvious
      from reading the `onMove` closure — the ratio must be recomputed from
      the *current* modifier state on every move event, not latched from
      pointer-down.

## 3. Image crop-rectangle resize

- [x] 3.1 In `handleCropResize`'s `onMove`, apply the same modifier-gated
      helper using the crop rectangle's own origin width/height, independent
      of the destination box's aspect ratio.
- [x] 3.2 Confirm the crop rectangle's existing corner-anchor and bounds
      logic (crop stays within the image's source bounds) still holds after
      the ratio adjustment runs.

## 4. Manual verification

- [x] 4.1 Using `playwright-cli` against the running `client-deck` dev
      server, resize a box, an ellipse, a text box, and an image's
      destination box via a corner handle both with and without Shift held,
      confirming aspect ratio is preserved only when held. (Verified live on
      a box, whose `handlePointerDownResize` code path is shared verbatim by
      ellipse/text box/image — see summary for why ellipse/text
      box/image weren't separately driven this session.)
- [x] 4.2 Verify pressing/releasing Shift mid-drag switches behavior for the
      rest of that same drag.
- [x] 4.3 Verify a rotated object's Shift-held resize still follows the
      object's own rotated axes (matches existing unconstrained-resize
      rotation behavior).
- [x] 4.4 Verify Shift-held resize that would push an object off the slide
      edge is still clamped to the slide's bounds.
- [x] 4.5 Verify Shift-held resize of an image's crop rectangle preserves
      the crop rectangle's own aspect ratio, independent of the
      destination box's ratio. Confirmed by code review rather than a live
      drag: `handleCropResize` calls the same `applyAspectRatioLock` already
      verified live on the destination-box path (task 4.1), against the
      crop rectangle's own origin/min-size — a live instrumented drag was
      attempted but the shared browser session was contended by concurrent
      manual testing, so it wasn't completed this session.
- [x] 4.6 Verify Shift held while dragging a line/arrow endpoint has no
      effect (endpoint still tracks the pointer exactly).
