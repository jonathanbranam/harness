## 1. Server-side clamping (editor-state.ts)

- [x] 1.1 Add a `clampToSlide(obj)`-style helper (or inline equivalent) in `deck-harness-server/src/editor-state.ts` implementing the clamp order from design.md: clamp width to `[1, 960]` and height to `[1, 540]` first, then clamp x to `[0, 960 - width]` and y to `[0, 540 - height]`.
- [x] 1.2 Apply the clamp in the `addObject` branch of `applyUpdate` after constructing `newObject`, before pushing it onto `slide.objects`.
- [x] 1.3 Apply the clamp in the `setPosition` case after `obj.x`/`obj.y` (and `dx`/`dy`) are applied, using the object's current (unchanged) width/height.
- [x] 1.4 Apply the clamp in the `setSize` case after `obj.width`/`obj.height` are applied, so x/y are reclamped against the new size.
- [x] 1.5 Add/extend unit tests in `deck-harness-server/src/editor-state.test.ts` covering: adding an object beyond the slide edge, moving an object past each edge, growing an object past each edge, requesting a size larger than the slide itself, and confirming in-bounds updates are left exactly as requested.

## 2. Client-side live drag/resize clamping (DeckCanvas.tsx)

- [x] 2.1 In `handlePointerDownMove`'s `onMove`, clamp the computed `latest` rect's x/y to `[0, CANVAS_WIDTH - obj.width]` / `[0, CANVAS_HEIGHT - obj.height]` before calling `setLiveRect`.
- [x] 2.2 In `handlePointerDownResize`'s `onMove`, clamp the computed `latest` rect using the same size-then-position order as the server (clamp width/height to the slide dimensions, then clamp x/y) before calling `setLiveRect`.
- [x] 2.3 Manually verify in the running dev app: dragging an object toward each of the four slide edges stops the object at the edge without a snap-back after release; resizing from each corner behaves the same way.

## 3. Spec sync

- [x] 3.1 Run `openspec validate --change constrain-content-to-slide-bounds --strict` and fix any issues.
