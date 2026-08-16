## Context

`DeckCanvas.tsx` renders the slide as a `<div ref={canvasRef} style={{ width: 960, height: 540 }}>` with no background, positioned inside a `relative flex-1 bg-gray-950 overflow-auto` pane next to the fixed-width chat column (`DeckPage.tsx`'s `grid-cols-[1fr_380px]`). Object positions (`x`/`y`/`width`/`height`) are logical pixel values in that 960x540 space; `TextObjectBox` renders each object at its literal logical coordinates with no scaling applied anywhere today. `slide_view` (see `slide-visual-inspection` capability) also depends on the canvas's DOM staying at exactly 960x540 so its screenshot capture is consistent regardless of object count — see proposal.md's "Why".

There is currently no default background on the canvas div itself, so it shows through to the pane's `bg-gray-950`, which is why there's no visible slide/margin contrast today even before considering sizing.

## Goals / Non-Goals

**Goals:**
- Scale the slide's *visual presentation* to fit the available editing area, tracking window/pane resizes live.
- Leave the slide's logical coordinate space (and therefore `slide_view`, object data, and all existing position/size math) completely untouched.
- Guarantee the margin-vs-slide contrast structurally, not by hoping object fill colors differ from the pane background.

**Non-Goals:**
- Changing the slide's fixed logical size (960x540) or adding a per-slide/per-deck background color field to the data model.
- Zoom/pan controls, multiple zoom levels, or user-adjustable scale — this is purely automatic scale-to-fit.
- Touch/pinch gesture support.

## Decisions

**Scale via CSS transform on the existing fixed-size div, not by recomputing object coordinates.**
Wrap the untouched `width:960 height:540` canvas div in an outer container sized to the *scaled* dimensions (`960*scale` x `540*scale`), and apply `transform: scale(scale)` with `transform-origin: top left` to the inner div. The outer container reserves the correct scaled space in the flex layout; the inner div and everything in it (objects, borders) render exactly as they do today, just visually scaled as a unit.
Alternative considered: multiply every object's `x`/`y`/`width`/`height`/`fontSize` by `scale` in `TextObjectBox`'s render. Rejected — it would touch every rendering and hit-testing path, risk drift from server-confirmed logical values, and still require the same pointer-math correction below, for no benefit over a single transform.

**Track available size with `ResizeObserver` on the editing pane, not `window.resize`.**
The pane can change size for reasons other than the browser window resizing (e.g. future chat panel width changes), so observe the pane element directly. Compute `scale = Math.min(availWidth / 960, availHeight / 540)` on every observed size change.

**`DeckCanvas`'s root needs explicit `min-w-0 min-h-0`, on both axes, not just the one that seemed relevant.**
`DeckCanvas`'s root div is the grid item for `DeckPage`'s `1fr` column *and* its single implicit (`auto`-sized) row. Its default `overflow: visible` means `min-width`/`min-height: auto` resolve to its content's min-content size in that axis (the CSS "automatic minimum size" rule) — and since the scaled canvas wrapper below has an *explicit pixel* width/height derived from `scale`, that content size ratchets the grid track's minimum up on every render and never lets it back down, only up. This was caught live during implementation as two separate bug reports — first horizontal ("growing works, shrinking doesn't"), fixed with `min-w-0`; then vertical ("not fully visible vertically"), which turned out to be the exact same failure mode on the other axis, requiring the matching `min-h-0`. Both are now set together on `DeckCanvas`'s root (`h-full min-w-0 min-h-0 flex flex-col`) — this pairs with the pane div's own `min-w-0 min-h-0` (belt-and-suspenders at the next containment boundary) and mirrors `DeckPage.tsx`'s pre-existing `min-h-0` on the grid *container*, which only protects the container's own sizing, not the item within it.

**Give the slide canvas an explicit default white background; keep the surrounding pane dark.**
Today the canvas has no background, so "margin contrasts with slide background" has nothing reliable to contrast against — object fills vary per-slide and can't be relied on to differ from the pane color. Set the canvas div's own background to white (matching the common slide-editor convention of a white canvas on dark surrounding chrome), and keep the pane's existing dark background as the margin. This guarantees contrast unconditionally rather than depending on slide content.
Alternative considered: derive the margin color dynamically from slide content (e.g. inverse of average fill color). Rejected as unnecessary complexity for no real benefit over a fixed, predictable convention.

**Center the scaled canvas in the pane with flex centering; the surrounding flex space *is* the margin.**
`items-center justify-center` on the pane, with the scaled-size outer container as its only flex child. No extra margin/padding math needed — whatever space `scale-to-fit` leaves over on the shorter axis is naturally the gap, and it's already symmetric on both sides.

**Apply the border to the inner (pre-transform) div.**
A 1-2px border on the 960x540 div is included in the `transform: scale()` along with everything else, so it always traces the slide's exact rendered edge at any scale, rather than needing separate positioning.

**Pointer math: divide screen-space deltas by the current scale factor.**
`handlePointerDownMove` and `handlePointerDownResize` currently compute `dx = ev.clientX - startClientX` and apply it directly as a logical-pixel delta. With the canvas visually scaled, on-screen pixel movement no longer equals logical-pixel movement 1:1. Both handlers divide `dx`/`dy` by the scale factor in effect at drag-start before applying them to the object's logical `x`/`y`/`width`/`height`. The scale factor is read from a ref (kept current by the `ResizeObserver` effect) so a mid-drag resize of the window doesn't jump the object.

## Risks / Trade-offs

- **Border can get visually thin at very small scale factors** (e.g. a very narrow window) → acceptable at the window sizes this harness is actually used at (a desktop browser alongside a 380px chat column); not worth scale-compensating the border width for an edge case.
- **New default white slide background is a visible behavior change beyond exactly what was requested** → mitigated by choosing a neutral, conventional default (white canvas, dark chrome) rather than an arbitrary color; no data model change, purely a client-side default.
- **`ResizeObserver` must be cleaned up on unmount** → standard effect cleanup (`observer.disconnect()`), same pattern already used elsewhere in this codebase for browser APIs.
