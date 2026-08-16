## Context

See proposal.md for motivation. Current state this design builds on (see
`add-deck-styling-elements`'s own design.md for how it got here):

- `DeckObject` (`deck-harness-server/src/editor-state.ts`) is a
  discriminated union on `type`, each variant extending
  `BaseDeckObject { id, zIndex }`. `boundsOf(obj)`/`translateObject(obj, dx,
  dy)` give type-agnostic bounding-box and move helpers; `clampToSlide`
  routes through them for slide-bounds enforcement.
- Client-side `DeckCanvas.tsx` duplicates `boundsOf`/`isLineLike` (per
  CLAUDE.md's "no `packages/` tier yet"). Objects render as absolutely
  positioned `<div>`/`<svg>` elements inside a `transform: scale(...)`
  container, each with an explicit CSS `z-index` matching its stored
  `zIndex`. A separate overlay `<div>` painted last, pinned to
  `SELECTION_OVERLAY_Z_INDEX = 9999`, renders the selection outline,
  resize/endpoint handles, and format toolbar — unrotated `<div>`s
  positioned from the same `rect.x/y/width/height` the object itself uses.
- Drag-to-move (`handlePointerDownMove`) translates `x/y` by a slide-axis
  `(dx, dy)` computed from raw pointer movement. Corner-handle resize
  (`handlePointerDownResize`) anchors the opposite corner and recomputes
  `x/y/width/height` from slide-axis `dx/dy`. Both clamp live feedback via
  `clampRectToSlide` (client) before the committed value is re-clamped
  server-side via `clampToSlide`.
- `presentation-bridge.ts` exposes one generic `presentation_update` tool
  (`ACTIONS` union) plus dedicated tools for shape creation/styling
  (`presentation_add_shape`, `presentation_style_shape`) and slide
  background (`presentation_set_slide_background`).
- `deck-persistence.ts` sanitizes the snapshot type-by-type, dispatching on
  `o.type` with `'textBox'` as the pre-migration default, defaulting
  `zIndex` to array position when absent.
- `editor-state.ts`'s undo/redo history stores whole-state before/after
  snapshots per entry; `applyUpdate`/`addShape` capture their own
  before/after (since a call can fail validation and produce no change),
  while structural mutations use the `withHistory` wrapper.
- Every WS/tool payload (`presentation_get_state`, the `before_agent_start`
  context injection, `getState()`'s broadcast) serializes the *entire*
  active slide's objects as JSON on every read and before every agent
  turn — there is no field-level pagination or truncation.

## Goals / Non-Goals

**Goals:**
- Add `image` as a sixth `DeckObject` variant with independent crop and
  destination geometry.
- Add `opacity` to every object type and `rotation` to the four
  bounding-box types (`textBox`, `image`, `box`, `ellipse`), rendered and
  hit-tested correctly on the canvas.
- Keep slide-bounds clamping simple: it operates on unrotated stored
  geometry only (per `deck-object-bounds`'s new "Slide-bounds clamping
  uses unrotated stored geometry" requirement) — rotation never triggers
  or participates in clamping.
- Resolve where uploaded image bytes live, without bloating the
  per-turn/per-`get_state` JSON payload every object field currently rides
  in.
- Make it structurally impossible to stretch/squish an image: every write
  path (creation, `setSize`, `setCrop`, `setImageSource`, corner-drag,
  slide-bounds clamping) preserves the crop rectangle's aspect ratio.

**Non-Goals:**
- Rotation on `line`/`arrow` (see `deck-shape-elements`'s "Lines and
  arrows do not support rotation" requirement — their endpoint model
  already expresses angle).
- Group rotation (rotating multiple selected objects together about a
  shared pivot) — each object rotates only about its own center; a
  multi-select rotate-handle drag applies the same delta-angle to each
  selected object independently.
- Non-rectangular (freeform/lasso) image cropping — the crop rectangle is
  axis-aligned in source-image coordinates.
- Orphaned-image cleanup (an uploaded file whose object is later deleted,
  or an image deck-persistence snapshot that's no longer loaded) — this is
  a single-user local dev tool per CLAUDE.md's "meant to run locally for
  many iterations," not a hosted multi-tenant service; manual deletion
  from `data/images/` is an acceptable interim answer.

## Decisions

### `image` joins the `DeckObject` union with its own geometry shape
```ts
interface ImageObject extends BaseDeckObject {
  type: 'image'
  src: string          // see "Image storage" below
  x: number            // destination position (slide coordinates)
  y: number
  width: number        // destination size
  height: number
  cropX: number         // crop rectangle, in the *source image's own*
  cropY: number         // pixel coordinates — independent of destination
  cropWidth: number      // geometry
  cropHeight: number
  rotation: number
  opacity: number
}
```
`x/y/width/height` are the destination box, so `image` participates in
`boundsOf`/`translateObject` exactly like `box`/`ellipse` — no
special-casing needed in either helper (`clampToSlide` *does* need an
`image`-specific branch — see "Aspect-locked resize and clamping" below).
The crop rectangle is deliberately a sibling, not nested (`crop:
{x,y,width,height}`), matching this codebase's existing flat-field style
for every other object type (no object ever carries a nested geometry
sub-object) and letting `presentation_update`'s existing "flat args bag"
pattern set it directly.

`width/height` and `cropWidth/cropHeight` are stored as four independent
fields, but every write path is required to keep `width/height`'s ratio
equal to `cropWidth/cropHeight`'s ratio — see "Aspect-locked resize and
clamping" below for how that's enforced structurally rather than trusted
to each caller.

**Alternative considered**: store the crop as a fraction (0–1) of the
source image's dimensions instead of source pixels. Rejected — the canvas
crop UI needs the source image's natural pixel dimensions to draw crop
handles at a sensible screen size regardless of zoom, and computing back
and forth between fractional and pixel coordinates on every interaction is
more error-prone than storing pixels once, read from the image's natural
size when it's first loaded client-side.

### `rotation`/`opacity` land on `BaseDeckObject` conditionally, not universally
`opacity` moves onto `BaseDeckObject` (every type gets it — no
type-specific logic needed anywhere `opacity` is read). `rotation` stays
on the four bounding-box interfaces individually (`TextBoxObject`,
`ImageObject`, `BoxObject`, `EllipseObject`) rather than on `BaseDeckObject`,
so `LineObject`/`ArrowObject` structurally cannot carry a `rotation` field
— the type system enforces `deck-shape-elements`'s "Lines and arrows do
not support rotation" requirement instead of relying on a runtime check
alone. `isLineLike`/`hasFillStyle`-style type guards get a sibling
`hasRotation(obj): obj is TextBoxObject | ImageObject | BoxObject |
EllipseObject` used by `applyActionToTarget`'s `setRotation` branch and by
the client's rotation-rendering dispatch.

### `presentation_update` gains `setOpacity`/`setRotation`; a new `presentation_add_image` tool mirrors `presentation_add_shape`
Per proposal.md's tool-shape decision: `setOpacity` (any type) and
`setRotation` (rejected via the existing "type mismatch → errors" pattern
for `line`/`arrow`, same as `setSize`'s existing rejection for those types)
join `UpdateAction`/`ACTIONS`. A new `presentation_add_image` tool takes
`src`, destination `x/y/width/height`, and optional crop fields
(defaulting to the full source image — see `deck-image-elements`'s "Crop
defaults to the full source image" requirement), returning the new
object's id — structurally identical to `presentation_add_shape`'s
`addShape`/`createShape` pair in `editor-state.ts` (`addImage`/
`createImage`, same "capture own before/after, only commit history on
success" shape). Setting an image's `src`/crop/destination fields after
creation reuses `presentation_update`: `setImageSource` (also resets crop
to the new source's full extent, per `deck-image-elements`'s "Agent
changes an image's source" scenario), `setCrop` ({cropX?, cropY?,
cropWidth?, cropHeight?} — see "Aspect-locked resize and clamping" below
for how a partial call derives the omitted size field).
`setPosition`/`setSize` already work on `image` for free once it has
`x/y/width/height` — no new action needed for moving/resizing the
destination box, though `setSize` gets the same aspect-derivation
treatment as `setCrop`.

### Rotation rendering: CSS `transform: rotate()`, not manual geometry
Each rotatable object's wrapper element gets `transform: rotate(${obj.rotation}deg)` with `transformOrigin: 'center'`, applied *inside* the
existing per-object `left/top/width/height` positioning (which stays
unrotated — the CSS transform rotates the already-positioned box in place,
composing cleanly with the outer canvas's `transform: scale(...)`).
`opacity` is a plain CSS `opacity: obj.opacity` on the same element — no
interaction with rotation or z-index.

**Why this resolves most of `deck-canvas-display`'s rotated-hit-testing
requirement for free**: browser pointer-event hit-testing (`onPointerDown`/
`onClick` on the actual DOM element) already respects CSS `transform`,
including `rotate()` — a click inside the visually rotated shape but
outside its unrotated axis-aligned box hits the element; a click inside
the unrotated box but outside the rotated shape does not. This means
*rendering* and *click hit-testing* both fall out of one CSS property with
no bespoke geometry code, satisfying deck-canvas-display's "Clicking a
rotated object" / "Clicking outside a rotated object's rotated footprint"
scenarios directly.

### Drag-to-move needs no rotation-awareness; resize does
Translating a rotated object (`handlePointerDownMove`) is rotation-
invariant — moving `x/y` by a slide-axis `(dx, dy)` keeps the object at the
same rotation, just recentered, so this code path is unchanged. Corner-
handle resize is not: today's `handlePointerDownResize` computes
`width/height/x/y` from a slide-axis pointer delta assuming the object's
edges run parallel to the slide's own axes. For a rotated object, a corner
drag should resize along *that object's own* (rotated) edges — matching
`deck-canvas-display`'s "Dragging and resizing use the object's own
rotated axes" requirement. The fix: before applying the existing
corner-resize math, rotate the raw pointer delta by `-obj.rotation`
degrees into the object's local (unrotated) frame, run the existing
per-corner width/height/x/y logic unchanged in that local frame, then
rotate the resulting position delta back by `+obj.rotation` to get the
slide-coordinate `x/y` to commit. `clampRectToSlide`'s live-drag clamp and
the server's `clampToSlide` both keep operating on the final unrotated
`x/y/width/height`, per the `deck-object-bounds` decision — clamping is
untouched by any of this.

### Selection chrome rotates with its object; the rotate handle is a new element in that same overlay
The per-object selection outline and resize-handle wrapper (currently an
unrotated `<div>` positioned at `rect.x/y/width/height`, painted in the
`SELECTION_OVERLAY_Z_INDEX` overlay) gets the same `transform:
rotate(${obj.rotation}deg)` / `transformOrigin: center` as the object
itself, so the outline and corner handles visually track the rotated
shape and each corner handle's resize drag can use the local-frame
transform described above. A new rotate handle renders just outside the
rotated bounding box's top edge (offset outward along the object's own
rotated "up" direction, so it stays visually above the shape at any
rotation) — dragging it computes `atan2` of the pointer position relative
to the object's center, converts to degrees, and issues `setRotation`.
Only rendered for `hasRotation` object types, consistent with `rotation`
not existing on `line`/`arrow`.

### Image storage: server-local URL, not an embedded data URI
**Decision**: `src` is a URL string — either an external `http(s)://` URL
the browser fetches directly, or a server-local `/api/images/:id` produced
by a new small upload endpoint. Uploaded bytes are written to
`deck-harness-server/data/images/` (gitignored, alongside `data/workspace/`
but *not* inside the agent's sandboxed workspace — this is user-supplied
binary content, not something `bash`/`write`/`edit` should read or write,
so it stays outside the permission-gate's jail entirely). `POST
/api/images` (reusing the existing cookie-session auth middleware) accepts
a multipart upload, writes it under a random id preserving the original
extension, and returns `{ id, url }`; `GET /api/images/:id` serves the
bytes with the stored content-type. The canvas's image-insert control
uploads through this endpoint and calls `presentation_add_image`/
`setImageSource` with the returned `url`.

**Why not a data URI embedded in the object** (the alternative proposal.md
flagged): every object field currently round-trips through
`presentation_get_state`'s JSON response *and* the `before_agent_start`
context-injection message stringified into every agent turn (see Context
above) — an embedded multi-hundred-KB base64 image would multiply into
every single turn's prompt, not just the turn that created it, which is a
severe and unnecessary token/context cost for a field pi almost never
needs to inspect the bytes of. A URL keeps the deck-state JSON (and thus
every turn's context and every `presentation_get_state` call) at the same
small-string cost as any other field, while the actual bytes are fetched
by the `<img>` tag exactly once per client render, out of band from the
agent loop entirely.

### Crop UI is a distinct interaction mode, entered like text-edit mode
Normal selection on an image shows the same corner resize handles as
`box`/`ellipse` (operating on destination `width/height`, per
`deck-image-elements`'s "Images are draggable, resizable, and selectable
like other objects"). A toolbar button (or double-click, mirroring text
boxes' "double-click enters edit mode" pattern) enters crop mode: the
selection chrome swaps to crop handles positioned against the *source
image's natural dimensions* (fetched once client-side via a hidden
`<img>` load to read `naturalWidth`/`naturalHeight`), independent of the
object's on-slide destination size/scale. Dragging a crop handle updates
local state only; leaving crop mode (clicking away, same as text-edit's
commit-on-blur) commits the final rectangle via `setCrop`. This mirrors
`edit-text-boxes`' precedent for a canvas-only interaction mode that
doesn't need a new selection concept, just a new local UI state
(`croppingId`, parallel to the existing `editingId`).

### Undo/redo: `setOpacity`/`setRotation` are mergeable; image tool calls are not
`setOpacity` and `setRotation` join `MERGEABLE_UPDATE_ACTIONS` (an opacity
slider or rotate-handle drag fires many intermediate values that should
collapse into one undo step, same rationale as `setPosition`/
`setStrokeWidth`). `presentation_add_image` follows `addShape`'s pattern
exactly (own before/after capture, commit only when an object was actually
created — `deck-undo-redo`'s "A failed image-creation call is not
captured" scenario). `setImageSource`/`setCrop` are **not** mergeable:
unlike a drag, there's no natural rapid-fire burst of intermediate values
for either (source is set once per call; a crop-mode drag commits a single
final rectangle on mode-exit rather than streaming intermediate `setCrop`
calls the way position/rotation drags stream `setPosition`/`setRotation`).
Every new action gets a `UPDATE_DESCRIPTIONS` entry (e.g. `setRotation: (n)
=> \`Rotated ${n} object${n === 1 ? '' : 's'}\``) — required by
`UPDATE_DESCRIPTIONS`'s `Record<UpdateAction, ...>` type, which won't
compile until every `UpdateAction` variant has one.

### Persistence: new type-sanitizer, `rotation`/`opacity` default per existing branch
`deck-persistence.ts` gets `sanitizeImageObject` (mirroring
`sanitizeBoxLikeObject`'s shape) dispatched from `sanitizeObject`'s
existing `o.type` switch. `opacity` defaults to `1` and (for the four
bounding-box sanitizers) `rotation` defaults to `0` when absent — the same
"old snapshot missing a field written before that field existed" case
`zIndex`'s fallback already handles, so a deck saved before this change
loads with every object fully opaque and unrotated, identical to its
current on-screen appearance.

## Risks / Trade-offs

- **[Risk]** Rotating the resize-handle math into the object's local frame
  is the single most fiddly piece of new client code in this change (sign
  errors in the ±rotation transform are easy to introduce) → Mitigation:
  land it as its own reviewable unit separate from the CSS
  rendering/rotate-handle work, and hand-test all four corners at several
  rotation angles (0°, 45°, 90°, 170°) before wiring up the rotate handle
  itself.
- **[Risk]** A rotated object's corners can render outside the visible
  slide bounds (accepted trade-off from the `deck-object-bounds` decision)
  → Mitigation: none needed functionally, but worth a quick manual check
  that nothing else (e.g. overflow clipping on the slide container)
  accidentally hard-clips a rotated object's corners at the slide edge,
  which would look like a bug even though it isn't one per spec.
- **[Risk]** `data/images/` grows unboundedly since nothing deletes a file
  when its object or deck is removed → Mitigation: explicitly a Non-Goal
  (see above); acceptable for a local single-user tool, revisit only if it
  becomes a real annoyance.
- **[Trade-off]** Server-local image URLs mean a deck snapshot isn't fully
  portable by itself (moving `data/state.json` to another machine without
  `data/images/` breaks image references) → accepted, matches this
  project's existing "no schema-version, no migration, lenient loading"
  persistence philosophy (an image that fails to load client-side just
  renders broken, same as any other stale reference would).
