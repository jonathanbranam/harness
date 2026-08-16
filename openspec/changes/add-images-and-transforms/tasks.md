## 1. Server: object model and geometry helpers (`deck-harness-server/src/editor-state.ts`)

- [x] 1.1 Add `opacity: number` to `BaseDeckObject`; add `rotation: number` individually to `TextBoxObject`, `BoxObject`, `EllipseObject` (not to `LineObject`/`ArrowObject`, per design.md's "rotation stays on the four bounding-box interfaces individually").
- [x] 1.2 Add the `ImageObject` interface (`type: 'image'`, `src`, destination `x/y/width/height`, crop `cropX/cropY/cropWidth/cropHeight`, `rotation`, `opacity`) and add it to the `DeckObject` union; update `cloneObject` if `image` needs any non-shallow clone handling (it doesn't carry nested arrays like `text`, so a shallow spread suffices — confirm and note why in a comment if it's a no-op).
- [x] 1.3 Add a `hasRotation(obj): obj is TextBoxObject | ImageObject | BoxObject | EllipseObject` type guard alongside `isLineLike`/`hasFillStyle`.
- [x] 1.4 Confirm `boundsOf`/`translateObject` handle `image` for free via its `x/y/width/height` (no code change expected — add a test case, see 1.10).
- [x] 1.5 Add `deriveImageSize(current: ImageObject, requested: { width?: number; height?: number })` and `deriveCropSize(current: ImageObject, requested: { cropWidth?: number; cropHeight?: number })`: single-field input derives the other from the current aspect ratio; both fields with a mismatched ratio → the width/cropWidth field wins and the other is recomputed. This is the one place `ImageObject.width`/`.height` or `.cropWidth`/`.cropHeight` may be computed from a caller's request (design.md's "Aspect-locked resize and clamping").
- [x] 1.6 Add an `image`-only branch to `clampToSlide`: when destination width/height would exceed `SLIDE_WIDTH`/`SLIDE_HEIGHT`, scale both down together by the limiting factor (not independently) before the existing translate/position clamp step.
- [x] 1.7 Add `createImage`/`addImage` (mirrors `createShape`/`addShape`'s validation + own before/after history-capture pattern): required `src` and destination `x/y/width/height` (or width/height derived via 1.5 if only one given); optional crop fields default to the full source image's extent — note in a comment that "full source extent" requires the *caller* (the tool layer) to supply the source's natural dimensions, since the store has no way to inspect image bytes itself (see task 5.2).
- [x] 1.8 Extend `UpdateAction` with `setOpacity`, `setRotation`, `setImageSource`, `setCrop`; add each to `UPDATE_DESCRIPTIONS`.
- [x] 1.9 Add corresponding branches to `applyActionToTarget`: `setOpacity` (any type, clamp 0–1), `setRotation` (`hasRotation` types only, else type-mismatch error matching `setSize`'s existing `isLineLike` rejection pattern), `setSize` for `image` routes through `deriveImageSize` before `clampToSlide`, `setImageSource` (image only — sets `src`, resets crop to full source extent, recomputes destination height from existing width via `deriveImageSize`), `setCrop` (image only — routes width/height fields through `deriveCropSize`, leaves `cropX`/`cropY` untouched unless given).
- [x] 1.10 Add `setOpacity`, `setRotation` to `MERGEABLE_UPDATE_ACTIONS`; leave `setImageSource`/`setCrop` out (per design.md's non-mergeable rationale).
- [x] 1.11 Add/extend unit tests in `editor-state.test.ts`: image creation (with and without explicit crop), `deriveImageSize`/`deriveCropSize` single-field and conflicting-field cases, `setRotation` rejected on `line`/`arrow`, `clampToSlide`'s aspect-preserving image branch, undo/redo coverage for the four new actions (including the "failed image creation pushes no history entry" case).

## 2. Server: persistence (`deck-harness-server/src/deck-persistence.ts`)

- [x] 2.1 Add `sanitizeImageObject` (mirrors `sanitizeBoxLikeObject`'s shape: required numeric fields default to 0/100-style fallbacks, `src` defaults to an empty string) and dispatch to it from `sanitizeObject`'s `o.type` switch.
- [x] 2.2 Default `opacity` to `1` in every existing per-type sanitizer; default `rotation` to `0` in the `textBox`/`box`/`ellipse` sanitizers (not `line`/`arrow`, which don't carry the field).
- [x] 2.3 Extend `deck-persistence.test.ts`: a pre-change snapshot (no `opacity`/`rotation`/image objects) still loads and renders identically (defaults applied); a snapshot containing an `image` object round-trips its fields correctly; a malformed `image` entry (missing `src`) degrades per the existing "lenient loading" fallback rules instead of throwing.

## 3. Server: image upload/serving endpoint

- [x] 3.1 Add `deck-harness-server/data/images/` to `.gitignore` alongside `data/workspace/`.
- [x] 3.2 Add a new route module (e.g. `deck-harness-server/src/images-route.ts`) registering `POST /api/images` (multipart upload, cookie-session auth reused from the existing auth middleware, writes to `data/images/<random-id>.<ext>`, returns `{ id, url }`) and `GET /api/images/:id` (serves the file with its stored content-type, 404 for an unknown id).
- [x] 3.3 Wire the new route into the server's Hono app setup (wherever existing routes are registered, e.g. `index.ts`).
- [x] 3.4 Confirm the upload endpoint is *not* reachable through `permission-gate.ts`'s tool-call jail (it's a plain HTTP route hit by the browser, not a pi tool) — no code change expected, just a design confirmation worth a one-line comment at the route definition.

## 4. Server: pi tool surface (`deck-harness-server/src/pi-extensions/presentation-bridge.ts`)

- [x] 4.1 Add `setOpacity`, `setRotation`, `setImageSource`, `setCrop` to the `ACTIONS` array and document each in `presentation_update`'s description string (including the "width/cropWidth wins on a mismatched pair" derivation behavior from design.md, so pi isn't surprised by a silently-overridden field).
- [x] 4.2 Add a `presentation_add_image` tool (mirrors `presentation_add_shape`'s structure): parameters `src`, destination `x/y/width/height`, optional `cropX/cropY/cropWidth/cropHeight`; calls `editorStore.addImage`; same `isError` result-shape convention as the other tools.
- [x] 4.3 Update `presentation_get_state`'s tool description and the `before_agent_start` context-injection message to mention `opacity` (every type), `rotation` (bounding-box types only), and the `image` type's fields (`src`, destination geometry, crop geometry), matching the existing style that documents field sets per type.
- [x] 4.4 Add/extend tests if this module has existing test coverage; otherwise verify via `presentation_get_state`/`presentation_add_image` manual tool calls during end-to-end testing (task 8).

## 5. Client: types and state plumbing (`client-deck/src/hooks/useDeckSocket.ts`)

- [x] 5.1 Mirror the server-side `DeckObject` union changes: `opacity` on the shared base, `rotation` on `TextBoxObject`/`BoxObject`/`EllipseObject`, the new `ImageObject` type, and the `UpdateAction` union additions (`setOpacity`, `setRotation`, `setImageSource`, `setCrop`).
- [x] 5.2 Add a small client-side helper (or inline logic in the image-insert control) that loads an uploaded image once via a hidden `<img>` to read `naturalWidth`/`naturalHeight` before calling `presentation_add_image`/the `addObject`-equivalent WS action, so the initial crop/destination default to the source's actual full extent and aspect ratio (per design.md — the server has no way to inspect image bytes itself).

## 6. Client: rendering (`client-deck/src/components/DeckCanvas.tsx`)

- [x] 6.1 Add `opacity: obj.opacity` to every object wrapper's inline style (`TextObjectBox`, `ShapeObjectBox`, and the new image component) — applies uniformly, no per-type branching needed.
- [x] 6.2 Add `transform: rotate(${obj.rotation}deg)` / `transformOrigin: 'center'` to the wrapper of every `hasRotation` object type's rendered element, layered inside the existing `left/top/width/height` positioning.
- [x] 6.3 Add an `ImageObjectBox` component (parallel to `ShapeObjectBox`): renders an `<img>` (or a `background-image`-styled `<div>`) clipped/positioned so only the crop rectangle is visible, scaled to the destination `width/height`; dispatch to it from the object-type switch alongside `TextObjectBox`/`ShapeObjectBox`.
- [x] 6.4 Extend `boundsOf`'s client-side duplicate to treat `image` like `box`/`ellipse` (already covered if it falls through to the default branch — confirm, don't assume).

## 7. Client: rotated interactions

- [x] 7.1 In `handlePointerDownResize`, rotate the raw pointer delta by `-obj.rotation` before applying the existing per-corner width/height/x/y math, then rotate the resulting position delta back by `+obj.rotation` before committing — per design.md's local-frame transform. Hand-test all four corners at 0°/45°/90°/170° rotation (per the design's flagged risk) before moving on.
- [x] 7.2 Give `image` objects a distinct uniform-scale resize branch in `handlePointerDownResize`: derive one scale factor from the larger-magnitude local-frame axis delta (after 7.1's rotation transform) and apply it to both width and height from the anchored corner, instead of the independent per-axis math `box`/`ellipse` use.
- [x] 7.3 Apply the same `transform: rotate(...)` to the per-object selection-outline/resize-handle wrapper in the `SELECTION_OVERLAY_Z_INDEX` overlay so it visually tracks a rotated object.
- [x] 7.4 Add a rotate handle (rendered only for `hasRotation` types) positioned outside the rotated bounding box's top edge; dragging it computes the pointer's angle relative to the object's center via `atan2` and issues `setRotation`.

## 8. Client: image-specific UI

- [x] 8.1 Add an image-insert control to the canvas toolbar: file picker → `POST /api/images` → `presentation_add_image`-equivalent WS action with the returned URL and the source's natural dimensions (via 5.2).
- [x] 8.2 Add crop-mode entry (double-click or a toolbar button while an image is selected, mirroring text boxes' edit-mode pattern): new local state (e.g. `croppingId`) parallel to `editingId`.
- [x] 8.3 Render crop-mode handles positioned against the source image's natural dimensions (read via 5.2's hidden-`<img>` load), independent of the object's on-slide display scale; dragging updates local state only.
- [x] 8.4 Commit the crop rectangle via the `setCrop` WS action on crop-mode exit (click-away), matching text-edit's commit-on-blur pattern.
- [x] 8.5 Add a control to change an image's source on an existing object (re-upload/re-pick), issuing `setImageSource`.
- [x] 8.6 Add a remove-image affordance (reuses the existing generic object-delete path — confirm it already works for `image` with no changes needed).

## 9. End-to-end verification

- [x] 9.1 Run `npm run typecheck` and `npm test` from the repo root; fix any fallout.
- [x] 9.2 Using `playwright-cli` against the already-running dev client (per CLAUDE.md — do not start a second instance), manually verify: inserting an image, resizing its destination box (stays proportional), zooming/panning its crop independently, rotating a box/ellipse/textBox/image via the rotate handle, setting opacity on each object type, an oversized image clamping without distortion at the slide edge, and that undo/redo correctly steps through each of these as individual entries.
- [x] 9.3 Verify pi's tool surface end-to-end via a chat prompt exercising `presentation_add_image`, `setCrop` (pan-only and zoom-only calls), `setRotation` (including the expected rejection on a `line`/`arrow` target), and `setOpacity`.

## 10. Decouple crop rectangle and destination box aspect ratios

Follow-up from manual review: the first implementation aspect-locked the
crop rectangle and destination box together, which made the crop-mode
popup's resize handles unable to actually reshape the crop. See
design.md's "Crop and destination are independent rectangles" (supersedes
the removed "Aspect-locked resize and clamping" section).

- [x] 10.1 Remove `deriveImageSize`/`deriveCropSize` from `editor-state.ts`; `setSize`/`setCrop`/`setImageSource` set whichever fields are given independently (no derivation, no field "winning" over another), matching every other type's generic field-assignment.
- [x] 10.2 Remove `clampToSlide`'s `image`-only branch; `image` clamps destination width/height independently to `SLIDE_WIDTH`/`SLIDE_HEIGHT`, same as `box`/`ellipse`.
- [x] 10.3 `ImageObjectBox`'s render switches to contain-fit letterboxing: `scale = Math.min(rect.width/cropWidth, rect.height/cropHeight)`, the scaled crop centered within the destination box (transparent on any leftover axis).
- [x] 10.4 Remove `handlePointerDownResize`'s `isImage` branch — image destination corner-drag becomes the same independent per-axis resize `box`/`ellipse` already use.
- [x] 10.5 Change `handleCropResize` from a single shift-locked scale factor to independent per-axis dragging (mirrors the destination resize math, in source-pixel space, clamped to the source's natural bounds) — so the crop rectangle's aspect ratio is freely adjustable in the popup.
- [x] 10.6 Update `presentation-bridge.ts`'s tool descriptions (`presentation_update`'s setSize/setCrop/setImageSource docs, `presentation_add_image`, `presentation_get_state`, `before_agent_start` context message) to describe crop and destination as independent rectangles reconciled via uniform-scale letterboxing, removing the "one field wins" language.
- [x] 10.7 Update the `deriveImageSize`/`deriveCropSize` unit tests and the affected `setSize`/`setCrop`/`setImageSource`/clamp tests in `editor-state.test.ts` to assert independent field-setting and independent-axis clamping instead of aspect-locked derivation.
- [x] 10.8 Update `deck-image-elements`/`deck-object-bounds` delta specs to match (drop the aspect-lock requirements/scenarios, add the independent-rectangles + uniform-scale-letterbox requirement).
- [x] 10.9 Run `npm run typecheck` and `npm test`; manually verify via `playwright-cli` against the running dev client — reshape a crop to a new aspect ratio in the popup, resize an image's destination box independently per axis, and confirm the mismatched-aspect render letterboxes instead of stretching or silently over-cropping.
