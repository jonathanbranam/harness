## 1. Object model (`deck-harness-server/src/editor-state.ts`)

- [ ] 1.1 Turn `DeckObject` into a discriminated union on `type`: `textBox` (unchanged fields), `box`/`ellipse` (`x/y/width/height`, `fillColor`, `borderColor`, `borderWidth`; `box` adds `cornerRadius`), `line`/`arrow` (`x1/y1/x2/y2`, `strokeColor`, `strokeWidth`; `arrow` adds `arrowStart`/`arrowEnd`)
- [ ] 1.2 Add `zIndex: number` to every object type and `backgroundColor: string` to `Slide`
- [ ] 1.3 Add `boundsOf(object)` and a translate-by-`(dx, dy)` helper that work across all five types (bounding box directly for box-like types, min/max of endpoints for `line`/`arrow`)
- [ ] 1.4 Generalize `clampToSlide` to clamp via `boundsOf`/translate instead of reading `x/y/width/height` directly
- [ ] 1.5 Generalize `applyGridLayout` to route through the same helpers so it still works when a `line`/`arrow` is among the targets
- [ ] 1.6 Add `addShape` support to `EditorStore` (new object of a given type with type-appropriate defaults — `DEFAULT_STROKE_COLOR`, `DEFAULT_STROKE_WIDTH`, `DEFAULT_BORDER_WIDTH`, `DEFAULT_CORNER_RADIUS = 0`), assigning `zIndex = (max existing zIndex on the slide) + 1`
- [ ] 1.7 Add `setPosition`/`removeObject` support for the new types in `applyUpdate` (translate via the helpers from 1.3; `removeObject` is already type-agnostic — verify it stays so)
- [ ] 1.8 Add a `setEndpoint` action (`{ which: 'start' | 'end', x, y }`) for `line`/`arrow`, clamped to slide bounds independently per endpoint
- [ ] 1.9 Add `setStrokeStyle`/`setShapeStyle`-equivalent handling for `strokeWidth`, `borderWidth`, `cornerRadius`, `arrowStart`/`arrowEnd`, validated against the target's actual `type` (mismatched field/type reported in `errors`, same pattern as unknown target ids)
- [ ] 1.10 Add `setZIndex`, `bringForward`, `sendBackward`, `bringToFront`, `sendToBack` actions to `applyUpdate`, generic across all object types
- [ ] 1.11 Add `setSlideBackgroundColor` to `EditorStore` (sets the active slide's `backgroundColor`)
- [ ] 1.12 Update `EditorStore.getState()`/`exportSnapshot()` to include `type`, `zIndex`, and the slide's `backgroundColor`

## 2. Persistence (`deck-harness-server/src/deck-persistence.ts`)

- [ ] 2.1 Add `DEFAULT_SLIDE_BACKGROUND_COLOR = '#ffffff'` and default-fill `Slide.backgroundColor` when absent from a loaded snapshot
- [ ] 2.2 Make `sanitizeObject` read `o.type` (defaulting to `'textBox'` when absent) and dispatch to a per-type sanitizer producing that type's exact field set with defaults
- [ ] 2.3 Backfill `zIndex` from array position when absent on a loaded object, so pre-existing snapshots keep their current visual stacking order
- [ ] 2.4 Add/update `deck-persistence.test.ts` cases: legacy snapshot with no `type`/`zIndex`/`backgroundColor` loads as before; each new shape type round-trips through save/load; malformed shape-specific fields fall back to defaults rather than dropping the object

## 3. pi tools (`deck-harness-server/src/pi-extensions/presentation-bridge.ts`)

- [ ] 3.1 Extend `presentation_update`'s `ACTIONS` and description with `setZIndex`, `bringForward`, `sendBackward`, `bringToFront`, `sendToBack`, and `setEndpoint`
- [ ] 3.2 Add the `presentation_add_shape` tool (`type`, type-appropriate geometry, and style args; returns the new object's id), with a description spelling out which args apply to which `type`
- [ ] 3.3 Add the `presentation_style_shape` tool (`strokeColor`/`strokeWidth` for line/arrow, `borderWidth`/`cornerRadius` for box, `borderWidth` for ellipse) applied to target ids
- [ ] 3.4 Add the `presentation_set_slide_background` tool (`{ color: string }`, active slide, no `targetIds`)
- [ ] 3.5 Update `presentation_get_state`'s description and the `before_agent_start` context injection to mention `type`, `zIndex`, and the slide's `backgroundColor`

## 4. Canvas rendering (`client-deck/src/components/DeckCanvas.tsx`)

- [ ] 4.1 Add a `ShapeObjectBox` component for `box`/`ellipse` (absolutely-positioned `<div>`; `border-radius: 50%` for ellipse, `cornerRadius`px for box; `borderWidth`/`borderColor`/`fillColor` styling; transparent fill/border handled like `TextObjectBox` already does)
- [ ] 4.2 Extend `ShapeObjectBox` (or a sibling) to render `line`/`arrow` as an absolutely-positioned `<svg>` sized to their bounding box plus stroke-width padding, containing a `<line>` and, for `arrow`, `<marker>` defs wired to `arrowStart`/`arrowEnd` via `marker-start`/`marker-end`
- [ ] 4.3 Dispatch on `obj.type` in the objects map (`TextObjectBox` for `textBox`, `ShapeObjectBox` for the rest) instead of always rendering `TextObjectBox`
- [ ] 4.4 Pass each object's `zIndex` through as its wrapper's CSS `z-index` style (no array sorting needed)
- [ ] 4.5 Render the active slide's `backgroundColor` on the slide container instead of the hardcoded `bg-white`

## 5. Canvas interaction (`client-deck/src/components/DeckCanvas.tsx`)

- [ ] 5.1 Wire drag-to-move for `box`/`ellipse` through the existing `handlePointerDownMove` path (already generic via `x/y`)
- [ ] 5.2 Add endpoint-drag handles for selected `line`/`arrow` objects (two draggable points instead of four corner handles), sending `setEndpoint` on release
- [ ] 5.3 Add corner-handle resize for `box`/`ellipse` via the existing `handlePointerDownResize` path
- [ ] 5.4 Add toolbar buttons ("+ Line", "+ Box", "+ Ellipse", "+ Arrow") that create each shape type at a sensible default position/size and select it, mirroring `addTextBox`
- [ ] 5.5 Verify selection (click/shift-click/clear) and delete already work unmodified for the new types (they key off `id` only)

## 6. Toolbar controls (`client-deck/src/components/DeckCanvas.tsx`)

- [ ] 6.1 Add "bring forward" / "send backward" buttons, enabled when the selection is non-empty, sending the corresponding `presentation_update` action for `deckState.selection`
- [ ] 6.2 Add a slide-background color control (color input + reuse pattern from the existing fill/border controls) that calls the new set-background action
- [ ] 6.3 Add stroke/border-thickness and corner-radius controls to the toolbar when the selection's first object is a shape type that supports them

## 7. Verification

- [ ] 7.1 `npm run typecheck` passes with the `DeckObject` union in place (fix any remaining call sites TypeScript's exhaustiveness checking surfaces)
- [ ] 7.2 `npm test` passes, including the new/updated `editor-state.test.ts` and `deck-persistence.test.ts` cases
- [ ] 7.3 Manually verify via `playwright-cli` against the running dev client: create each shape type, set corner radius, transparent fill/border, drag/resize (including line/arrow endpoints), z-order via both the toolbar and an agent tool call, and slide background color
