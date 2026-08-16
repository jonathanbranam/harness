## 1. Scale-to-fit sizing

- [x] 1.1 Add a `ResizeObserver`-backed hook/effect in `DeckCanvas.tsx` that measures the editing pane's available width/height and computes `scale = Math.min(availWidth / 960, availHeight / 540)`, keeping the latest value in state and a ref (for pointer handlers to read without stale closures).
- [x] 1.2 Restructure the canvas markup: an outer container sized to `960*scale` x `540*scale`, wrapping the existing untouched `width:960 height:540` inner div with `transform: scale(scale)` / `transform-origin: top left` applied to the inner div.
- [x] 1.3 Center the scaled outer container in the editing pane (`items-center justify-center`) so leftover space forms a symmetric margin on all sides.
- [x] 1.4 Clean up the `ResizeObserver` on unmount.

## 2. Visual boundary (margin + border)

- [x] 2.1 Give the inner canvas div an explicit default white background (currently transparent), so it visually contrasts with the pane's dark background regardless of object content.
- [x] 2.2 Add a subtle but clearly visible border to the inner canvas div, applied pre-transform so it scales with the slide and always traces its exact edge.
- [x] 2.3 Verify the pane's existing dark background reads as a clear, contrasting margin against the new white slide background at typical window sizes.

## 3. Pointer interaction accuracy

- [x] 3.1 Update `handlePointerDownMove` to divide `dx`/`dy` by the current scale factor (read from the ref from 1.1) before applying them to the dragged object's logical `x`/`y`.
- [x] 3.2 Update `handlePointerDownResize` to divide `dx`/`dy` by the current scale factor before computing the resized object's logical `width`/`height`/`x`/`y`.
- [x] 3.3 Manually verify drag and resize land on the exact logical position/size at a few different window sizes (scaled up, scaled down, ~1:1).

## 4. Verification

- [x] 4.1 Resize the browser window through a range of sizes/aspect ratios and confirm the slide stays maximized within the editing area without overlapping the chat panel, rescaling live.
- [x] 4.2 Confirm `slide_view`'s rendered screenshot output is unaffected by display scale (still captures the fixed 960x540 frame).
- [x] 4.3 Confirm click-to-select and double-click-to-edit still work correctly on objects at non-1:1 scale.
