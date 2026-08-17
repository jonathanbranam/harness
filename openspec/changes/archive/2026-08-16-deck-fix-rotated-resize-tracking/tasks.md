## 1. Implement the anchor-pinning center-solve

- [x] 1.1 In `client-deck/src/components/DeckCanvas.tsx`'s
      `handlePointerDownResize`, capture the per-corner anchor sign
      (`ax = corner.includes('w') ? 1 : -1`, `ay = corner.includes('n') ? 1
      : -1`) once, outside `onMove`, since it's constant for the drag.
- [x] 1.2 In `onMove`, after `width`/`height` are finalized (including any
      `applyAspectRatioLock` adjustment) but before the existing
      `clampRectToSlide` call, replace the current local-frame `x`/`y`
      derivation and the "rotate the position delta back to slide-frame"
      step with design.md's six-step center-solve: compute `C0` from
      `originX`/`originY`/`originWidth`/`originHeight`, compute
      `anchorLocal0` from the original size, rotate it into `anchorScreen`,
      compute `anchorLocal1` from the new `width`/`height`, solve for `C1`,
      then convert `C1` back to top-left `x`/`y`.
- [x] 1.3 Feed the resulting `{ x, y, width, height }` into the existing
      `clampRectToSlide` call unchanged, and confirm `onUp`'s
      `setPosition`/`setSize` dispatch still reads from `latest` as before —
      no changes needed there per design.md's Non-Goals.

## 2. Verify in the browser

- [x] 2.1 Using `playwright-cli` against the already-running
      client-deck dev server, select a box (or ellipse/text/image) object,
      rotate it to a nonzero angle (e.g. 45°) via the rotate handle, then
      drag each of its four corner handles in turn and confirm the opposite
      corner's on-screen position does not visibly shift during the drag.
- [x] 2.2 Repeat the same corner-handle drags on an unrotated object (or
      one reset to `rotation: 0`) and confirm behavior is pixel-identical to
      before this change (anchor corner pinned via its local coordinates).
- [x] 2.3 Repeat a rotated-object corner drag while holding Shift
      (aspect-ratio lock) and confirm the anchor corner still stays visually
      fixed while width/height maintain the locked ratio.
- [x] 2.4 Confirm a rotated-object corner drag that would push the object
      past the slide edge still clamps to the slide bounds (existing
      `clampRectToSlide` behavior, now fed by the new `x`/`y`).
