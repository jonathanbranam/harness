## 1. Object model (`deck-harness-server/src/editor-state.ts`)

- [x] 1.1 Turn `DeckObject` into a discriminated union on `type`: `textBox` (unchanged fields), `box`/`ellipse` (`x/y/width/height`, `fillColor`, `borderColor`, `borderWidth`; `box` adds `cornerRadius`), `line`/`arrow` (`x1/y1/x2/y2`, `strokeColor`, `strokeWidth`; `arrow` adds `arrowStart`/`arrowEnd`)
- [x] 1.2 Add `zIndex: number` to every object type and `backgroundColor: string` to `Slide`
- [x] 1.3 Add `boundsOf(object)` and a translate-by-`(dx, dy)` helper that work across all five types (bounding box directly for box-like types, min/max of endpoints for `line`/`arrow`)
- [x] 1.4 Generalize `clampToSlide` to clamp via `boundsOf`/translate instead of reading `x/y/width/height` directly
- [x] 1.5 Generalize `applyGridLayout` to route through the same helpers so it still works when a `line`/`arrow` is among the targets
- [x] 1.6 Add `addShape` support to `EditorStore` (new object of a given type with type-appropriate defaults — `DEFAULT_STROKE_COLOR`, `DEFAULT_STROKE_WIDTH`, `DEFAULT_BORDER_WIDTH`, `DEFAULT_CORNER_RADIUS = 0`), assigning `zIndex = (max existing zIndex on the slide) + 1`; capture its own before/after and only `commitHistory` on success, following `applyUpdate`'s pattern (not `withHistory`), so a validation failure pushes no history entry (see design.md's "Undo/redo integration" decision)
- [x] 1.7 Add `setPosition`/`removeObject` support for the new types in `applyUpdate` (translate via the helpers from 1.3; `removeObject` is already type-agnostic — verify it stays so)
- [x] 1.8 Add a `setEndpoint` action (`{ which: 'start' | 'end', x, y }`) for `line`/`arrow`, clamped to slide bounds independently per endpoint
- [x] 1.9 Add `setStrokeStyle`/`setShapeStyle`-equivalent handling for `strokeWidth`, `borderWidth`, `cornerRadius`, `arrowStart`/`arrowEnd`, validated against the target's actual `type` (mismatched field/type reported in `errors`, same pattern as unknown target ids); add `strokeWidth`/`borderWidth`/`cornerRadius` to `MERGEABLE_UPDATE_ACTIONS` (stepper/slider-driven, like `setFontSize`)
- [x] 1.10 Add `setZIndex`, `bringForward`, `sendBackward`, `bringToFront`, `sendToBack` actions to `applyUpdate`, generic across all object types; add `setEndpoint` (task 1.8) to `MERGEABLE_UPDATE_ACTIONS` (endpoint-drag, like `setPosition`) but leave the z-order actions out of it (each is a discrete single step, like `addObject`/`removeObject`)
- [x] 1.10a Add an entry to `UPDATE_DESCRIPTIONS` for every new `UpdateAction` from 1.8–1.10 (`setEndpoint`, `setZIndex`, `bringForward`, `sendBackward`, `bringToFront`, `sendToBack`, and the shape-style action(s) from 1.9) — required for `UPDATE_DESCRIPTIONS`'s `Record<UpdateAction, ...>` to compile, and surfaced by `deck-undo-redo`'s history-inspection tool
- [x] 1.11 Add `setSlideBackgroundColor` to `EditorStore` (sets the active slide's `backgroundColor`); give `withHistory` an optional `mergeKey` parameter and pass one keyed on the active slide id here, so a dragged color-picker change coalesces into one undo step the same way `setFillColor` already does (see design.md's "Undo/redo integration" decision)
- [x] 1.12 Update `EditorStore.getState()`/`exportSnapshot()` to include `type`, `zIndex`, and the slide's `backgroundColor`

## 2. Persistence (`deck-harness-server/src/deck-persistence.ts`)

- [x] 2.1 Add `DEFAULT_SLIDE_BACKGROUND_COLOR = '#ffffff'` and default-fill `Slide.backgroundColor` when absent from a loaded snapshot
- [x] 2.2 Make `sanitizeObject` read `o.type` (defaulting to `'textBox'` when absent) and dispatch to a per-type sanitizer producing that type's exact field set with defaults
- [x] 2.3 Backfill `zIndex` from array position when absent on a loaded object, so pre-existing snapshots keep their current visual stacking order
- [x] 2.4 Add/update `deck-persistence.test.ts` cases: legacy snapshot with no `type`/`zIndex`/`backgroundColor` loads as before; each new shape type round-trips through save/load; malformed shape-specific fields fall back to defaults rather than dropping the object

## 3. pi tools (`deck-harness-server/src/pi-extensions/presentation-bridge.ts`)

- [x] 3.1 Extend `presentation_update`'s `ACTIONS` and description with `setZIndex`, `bringForward`, `sendBackward`, `bringToFront`, `sendToBack`, and `setEndpoint`
- [x] 3.2 Add the `presentation_add_shape` tool (`type`, type-appropriate geometry, and style args; returns the new object's id), with a description spelling out which args apply to which `type`
- [x] 3.3 Add the `presentation_style_shape` tool (`strokeColor`/`strokeWidth` for line/arrow, `borderWidth`/`cornerRadius` for box, `borderWidth` for ellipse) applied to target ids
- [x] 3.4 Add the `presentation_set_slide_background` tool (`{ color: string }`, active slide, no `targetIds`)
- [x] 3.5 Update `presentation_get_state`'s description and the `before_agent_start` context injection to mention `type`, `zIndex`, and the slide's `backgroundColor`

## 4. Canvas rendering (`client-deck/src/components/DeckCanvas.tsx`)

- [x] 4.1 Add a `ShapeObjectBox` component for `box`/`ellipse` (absolutely-positioned `<div>`; `border-radius: 50%` for ellipse, `cornerRadius`px for box; `borderWidth`/`borderColor`/`fillColor` styling; transparent fill/border handled like `TextObjectBox` already does)
- [x] 4.2 Extend `ShapeObjectBox` (or a sibling) to render `line`/`arrow` as an absolutely-positioned `<svg>` sized to their bounding box plus stroke-width padding, containing a `<line>` and, for `arrow`, `<marker>` defs wired to `arrowStart`/`arrowEnd` via `marker-start`/`marker-end`
- [x] 4.3 Dispatch on `obj.type` in the objects map (`TextObjectBox` for `textBox`, `ShapeObjectBox` for the rest) instead of always rendering `TextObjectBox`
- [x] 4.4 Pass each object's `zIndex` through as its wrapper's CSS `z-index` style (no array sorting needed)
- [x] 4.4a Give the selection/editing overlay `<div>` added by `fix-selection-tools-zorder` an explicit `z-index` above any value an object's `zIndex` can reach (e.g. a fixed constant like `9999`), since it currently relies on DOM order alone and would otherwise end up visually behind any object once objects carry explicit `z-index` (see design.md's "Interaction with `fix-selection-tools-zorder`'s overlay" decision)
- [x] 4.5 Render the active slide's `backgroundColor` on the slide container instead of the hardcoded `bg-white` — as a literal color value with no `dark:` variant, since deck content stays unthemed per `deck-theme-toggle`'s "Deck content unaffected by theme" requirement (see design.md's "Slide background color is deck content" decision)

## 5. Canvas interaction (`client-deck/src/components/DeckCanvas.tsx`)

- [x] 5.1 Wire drag-to-move for `box`/`ellipse` through the existing `handlePointerDownMove` path (already generic via `x/y`)
- [x] 5.2 Add endpoint-drag handles for selected `line`/`arrow` objects (two draggable points instead of four corner handles), sending `setEndpoint` on release
- [x] 5.3 Add corner-handle resize for `box`/`ellipse` via the existing `handlePointerDownResize` path
- [x] 5.4 Add toolbar buttons ("+ Line", "+ Box", "+ Ellipse", "+ Arrow") that create each shape type at a sensible default position/size and select it, mirroring `addTextBox`
- [x] 5.5 Verify selection (click/shift-click/clear) and delete already work unmodified for the new types (they key off `id` only)

## 6. Toolbar controls (`client-deck/src/components/DeckCanvas.tsx`)

- [x] 6.1 Add "bring forward" / "send backward" buttons, enabled when the selection is non-empty, sending the corresponding `presentation_update` action for `deckState.selection`, styled with the same `dark:`-variant Tailwind classes already used by the existing toolbar buttons (this is editor chrome, unlike the slide content itself — see design.md's "Slide background color is deck content" decision)
- [x] 6.2 Add a slide-background color control (color input + reuse pattern from the existing fill/border controls) that calls the new set-background action, themed like the rest of the toolbar
- [x] 6.3 Add stroke/border-thickness and corner-radius controls to the toolbar when the selection's first object is a shape type that supports them, themed like the rest of the toolbar

## 7. Verification

- [x] 7.1 `npm run typecheck` passes with the `DeckObject` union in place (fix any remaining call sites TypeScript's exhaustiveness checking surfaces)
- [x] 7.2 `npm test` passes, including the new/updated `editor-state.test.ts` and `deck-persistence.test.ts` cases
- [x] 7.3 Manually verify via `playwright-cli` against the running dev client: create each shape type, set corner radius, transparent fill/border, drag/resize (including line/arrow endpoints), z-order via both the toolbar and an agent tool call, and slide background color
- [x] 7.4 Manually verify undo/redo integration via `playwright-cli`: undo/redo a shape creation, a z-order change, and a slide-background-color change each push/pop exactly one history entry; a dragged endpoint or background-color change collapses into a single undo step; a failed `presentation_add_shape` call (invalid args) pushes no history entry; the history-inspection tool's descriptions read sensibly for the new action types
- [x] 7.5 Manually verify via `playwright-cli` that toggling client-deck's light/dark theme changes only the toolbar/chrome (including the new z-order, background-color, and stroke/corner-radius controls), leaving the rendered slide background and shape colors unchanged
- [x] 7.6 Manually verify via `playwright-cli`: create two overlapping shapes, select the one with the lower `zIndex` (behind), and confirm its selection outline/resize handles are still fully visible on top of the front object — regression coverage for the `fix-selection-tools-zorder` overlay interaction
