## Context

See proposal.md for motivation. Current state this design builds on:

- `DeckObject` (`deck-harness-server/src/editor-state.ts`) is a single flat
  interface — every object has `x/y/width/height/text/fillColor/borderColor/
  fontColor/fontSize` — with no `type` discriminator; every object today is
  implicitly a text box.
- `Slide` has no background field; the canvas hardcodes a white background
  (`bg-white` on the slide `<div>` in `DeckCanvas.tsx`).
- Paint order is implicit: `deckState.objects.map(...)` renders in array
  order, and later DOM elements naturally stack on top. There is no
  persisted ordering concept.
- `presentation_update` (`presentation-bridge.ts`) is one tool with a fixed
  `ACTIONS` union (`setPosition`, `setSize`, `setFillColor`, ...), each
  branch in `EditorStore.applyUpdate` assuming the flat `DeckObject` shape.
- The client renders every object through one component, `TextObjectBox`,
  which also owns rich-text editing (contentEditable, the bold/italic/list
  format toolbar). Drag-to-move and 4-corner resize-via-handles both operate
  directly on `x/y/width/height`.
- `deck-persistence.ts` sanitizes each persisted field independently with a
  fallback default, deliberately with no schema-version field (see its
  "Lenient loading" doc comment) — old/foreign shapes are dropped or
  defaulted, never migrated.

## Goals / Non-Goals

**Goals:**
- Introduce `line`, `box`, `ellipse`, `arrow` as first-class object types
  alongside the existing (now-named) `textBox` type, sharing the existing
  generic move/resize/select/remove machinery wherever the shape's geometry
  allows it.
- Give every object an explicit, persisted `zIndex` that determines paint
  order, independent of array order.
- Give the active slide a persisted `backgroundColor`.
- Dedicated pi tools for creating and styling shapes, plus generic z-order
  and slide-background actions usable on any object type.

**Non-Goals (deferred to `add-images-and-transforms`):**
- Rotation and opacity on any object type.
- Image objects.
- Curved/multi-point lines — every line and arrow in this change is a
  straight segment between exactly two points.
- Grouping, gradients/shadows, or text rendered inside a shape.

## Decisions

### `DeckObject` becomes a discriminated union, keyed by `type`
Each object gains a `type: 'textBox' | 'line' | 'box' | 'ellipse' |
'arrow'` field. `textBox` keeps its current fields unchanged. `box` and
`ellipse` keep `x/y/width/height` (their bounding box) and add
`borderWidth` (stroke thickness, independent of `borderColor`); `box`
additionally gets `cornerRadius` (default `0`). `line` and `arrow` drop
`x/y/width/height` in favor of explicit endpoints `x1/y1/x2/y2` (slide
coordinates) plus `strokeColor`/`strokeWidth`; `arrow` additionally gets
`arrowStart`/`arrowEnd` booleans (default `false`/`true`, i.e. single
arrowhead at the end).

**Alternative considered**: keep one flat interface with every field
optional (a "kitchen sink" object). Rejected — it would let a `line` object
carry a nonsensical `fillColor`, and every consumer would need its own ad
hoc validity checks instead of the compiler's exhaustiveness checking on a
`switch (obj.type)`.

**Why endpoints for `line`/`arrow` instead of a bounding box**: a bounding
box can't disambiguate a rising diagonal from a falling one, and the
existing per-object resize-via-handles model doesn't fit "drag either
endpoint" cleanly if the object's canonical fields are box-shaped. Storing
endpoints directly makes the geometry unambiguous and matches how the
canvas will let a user resize a line (drag one endpoint), per
`deck-shape-elements` spec's requirement.

### A `boundsOf(object)` helper unifies bounding-box logic across types
Slide-bounds clamping, `applyGridLayout`, and drag-translate all currently
operate directly on `x/y/width/height`. Rather than special-casing `line`/
`arrow` at every call site, a small helper computes a bounding box for any
object (`{x, y, width, height}` — literally those fields for box-like
types, `min/max` of the two endpoints for `line`/`arrow`) and a matching
"translate by (dx, dy)" that moves whichever fields the type actually has.
`clampToSlide` and `applyGridLayout` route through these instead of reading
`x/y/width/height` directly. Absolute `setPosition` for any type is
expressed as a translate: `dx = newX - boundsOf(obj).x`, so it works
uniformly across all five types without an `if (isLineLike)` branch in the
action handler itself.

### Resize is type-specific at the action/UI level
Corner-handle resize (existing `setSize` behavior, scaling `width`/
`height`) stays as-is for `textBox`/`box`/`ellipse`. `line`/`arrow` get a
new `setEndpoint` action (`{ which: 'start' | 'end', x: number, y: number
}`) instead — dragging a line's own endpoint handle is a closer match to
how users actually adjust a line than scaling a bounding box would be, and
it's what `deck-shape-elements` spec's requirement already commits to.
`setSize` on a `line`/`arrow` target is a no-op reported as an error, same
as any action/type mismatch (see "Lenient but type-checked args" below).

### Z-order: explicit `zIndex` on every object, rendered via CSS
Every object gets an integer `zIndex`. New objects default to
`(max existing zIndex on the slide) + 1` (on top). Reordering happens
through `presentation_update` actions — `setZIndex` (explicit value),
`bringForward`/`sendBackward` (swap with the next/previous object by
current zIndex), `bringToFront`/`sendToBack` (max+1 / min-1) — generic
across all object types, since z-order isn't a shape-specific concept.
`DeckCanvas.tsx` does not need to sort the objects array or change DOM
order: it passes each object's `zIndex` straight through as that object's
CSS `z-index` style, and the browser's normal stacking-context rules do the
rest. This means array order (and thus object-lookup logic elsewhere)
never has to track paint order at all.

**Toolbar scope**: the canvas toolbar ships forward/backward buttons only
(matching `presentation-editing` spec's toolbar scenarios exactly).
Front/back stay pi-tool-only for this change — four more buttons in an
already-dense toolbar is a cost the spec didn't commit to; add them later
if the forward/backward buttons turn out to be tedious for multi-step
reordering.

### New pi tools vs. extending `presentation_update`
Z-order actions and `setPosition`/`removeObject` extend `presentation_update`'s
existing `ACTIONS` union — they're generic, cross-type operations that
belong with the other generic actions. Two new dedicated tools handle what
`presentation_update` can't express generically:
- `presentation_add_shape`: `type` (`line`/`box`/`ellipse`/`arrow`) plus
  type-appropriate geometry and style args in one call, returning the new
  object's id — mirrors `addObject`'s existing shape but as its own tool
  (rather than a fifth `addObject` variant with a sprawling optional-args
  surface) so its description can spell out exactly which args apply to
  which shape type.
- `presentation_style_shape`: sets `strokeColor`/`strokeWidth` (line/arrow),
  `borderWidth`/`cornerRadius` (box), or `borderWidth` (ellipse) on target
  ids — reuses the existing `setFillColor`/`setBorderColor` actions on
  `presentation_update` for color (already generic and type-agnostic), so
  this tool only needs to cover the fields those can't.
- `presentation_set_slide_background`: `{ color: string }` (or
  `"transparent"`... no — background is always a real color; use the
  slide's stored default when the user wants to "clear" it) for the active
  slide. Kept as its own tool rather than an `applyUpdate` action because
  it isn't object-scoped (no `targetIds`), unlike every existing action.

**Lenient but type-checked args**: `presentation_style_shape` and the
z-order/`setSize` actions validate the target's actual `type` before
applying a field — e.g. setting `cornerRadius` on a `line` id is reported
in the result's `errors` (mirrors the existing "unknown target id" error
pattern) rather than silently no-op'd or crashing.

### Client rendering: a second per-object component, not one mega-component
`TextObjectBox` keeps owning `type: 'textBox'` unchanged (it already
carries a lot — contentEditable, the bold/italic/list toolbar). A new
`ShapeObjectBox` component handles `box`/`ellipse`/`line`/`arrow`: `box`/
`ellipse` render as an absolutely-positioned `<div>` (border-radius `50%`
for ellipse, `cornerRadius`px for box); `line`/`arrow` render as an
absolutely-positioned `<svg>` sized to their bounding box (plus stroke-width
padding) containing a `<line>` and, for `arrow`, `<marker>` defs referenced
via `marker-start`/`marker-end`. Both components render inside the same
already-`transform: scale(...)`'d canvas container as today, so shape
geometry needs no separate scale math. `DeckCanvas.tsx`'s object map
becomes a small `switch (obj.type)` dispatch between the two components.

### Persistence: type-aware sanitizing, non-breaking for existing decks
`deck-persistence.ts`'s `sanitizeObject` reads `o.type`, defaulting to
`'textBox'` when absent (every object saved before this change), and
dispatches to a per-type sanitizer producing that type's exact field set
with defaults. `zIndex` defaults to the object's position in its slide's
`objects` array when absent, so a snapshot saved before this change
restores with its current visual stacking preserved. `Slide.backgroundColor`
defaults to `#ffffff` when absent, matching the canvas's current hardcoded
white — so existing decks render identically until someone changes it.

## Risks / Trade-offs

- **Broad refactor surface**: moving `DeckObject` from one flat interface
  to a 5-way union touches every function that assumed flat access
  (`clampToSlide`, `applyGridLayout`, `plainTextOf` callers, the client's
  drag/resize handlers) → Mitigation: route shared logic through `boundsOf`/
  translate helpers immediately, and lean on TypeScript's exhaustiveness
  checking (`switch (obj.type)` with no `default`) to surface every
  remaining call site that still assumes the old flat shape as a compile
  error rather than a runtime bug.
- **Two new tools plus extended `presentation_update` actions is more
  surface for pi to learn** → Mitigation: `presentation_add_shape`'s and
  `presentation_style_shape`'s descriptions spell out exactly which args
  apply to which `type`, matching the existing style of `presentation_update`'s
  own action-by-action description.
- **Equal `zIndex` values on two objects** (e.g. both default to the same
  value from a hand-edited snapshot) → resolved by DOM/array order as a
  stable tiebreak, same as the browser's native behavior for equal
  `z-index`; not worth a uniqueness constraint for a single-user local tool.
- **No forward-compatible snapshot format**: an older server build reading
  a snapshot saved by this change would see unrecognized `type`/`zIndex`/
  shape-specific fields → accepted, consistent with `deck-persistence.ts`'s
  existing no-schema-version stance and this project's "runs locally for
  many iterations" nature (see root `CLAUDE.md`), not a shared production
  service.

## Migration Plan

No live-deployment migration is needed (in-memory single-session server,
per root `CLAUDE.md`'s "Never kill or restart the dev servers" — the user
restarts it themselves when picking up a changed build). Implementation
order: server-side object model + persistence first (so shapes are
representable and durable), then `presentation-bridge.ts` tools, then
client rendering/interaction, then the toolbar z-order controls last (they
depend on the z-order actions already existing). Verify interactively via
`playwright-cli` against the already-running dev client per `CLAUDE.md`,
covering: creating each shape type, corner radius, transparent fill/border,
z-order via both the agent tools and the toolbar, and slide background
color. Rollback is a plain revert — there is no persisted-format migration
to unwind.
