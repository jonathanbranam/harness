## Context

`DeckCanvas.tsx`'s `TextObjectBox` currently renders three pieces of "selection chrome" as children of the object's own `<div>`, in the same DOM position as the object itself: the selection border/ring (a class applied directly to the object's div), the resize handles (absolute-positioned children at the corners), and the floating format toolbar (absolute-positioned above the box, shown while `editing`). Objects are painted in the order they appear in `deckState.objects` (the slide's z-order), so a selected/edited object that sits behind another, overlapping object has its chrome painted first and then covered. See proposal.md - Why.

`editableRef`, `commitText`, `applyMark`, and `applyListType` are currently local to each `TextObjectBox` instance and operate on that instance's own `contentEditable` DOM node. Only one object can be in edit mode at a time (`editingId` is a single id in `DeckCanvas` state, not a set).

## Goals / Non-Goals

**Goals:**
- Selection outline, resize handles, and the floating format toolbar always paint above every slide object, regardless of the selected/edited object's z-order.
- Preserve existing interaction behavior exactly: drag-to-move, drag-to-resize, multi-select (outline+handles on every selected object), double-click-to-edit, bold/italic/list toggling, click-outside-to-clear-selection.
- No change to slide objects' own z-order or paint order.

**Non-Goals:**
- No change to how z-order itself is assigned or reordered (no bring-to-front/send-to-back feature).
- No change to the read-only/preview render path (it already renders no chrome at all).

## Decisions

### Render chrome in a single overlay painted after all objects, not by bumping the object's own z-index
Add one overlay layer inside the scaled canvas `<div>`, rendered immediately after the `deckState.objects.map(...)` block (so it's last in DOM order and paints on top of every object, all of which use `position: absolute` with the default `z-index: auto`). The overlay renders, from the current `deckState.selection` and `editingId`:
- an outline `<div>` per selected object (replacing the border/ring classes currently on the object's own div)
- resize-handle `<div>`s per selected, non-editing object
- the floating format toolbar, positioned against the editing object's rect, when `editingId` is set

Alternative considered: give the selected/editing object's own `<div>` a higher `z-index` (e.g. `selected ? 'z-10' : ''`). Rejected because it would also lift the object's own paint (fill, border, text) above overlapping objects while selected — a visible change to slide content stacking, not just to selection chrome, which the proposal explicitly rules out.

The overlay container itself uses `pointer-events-none` (so it never intercepts clicks meant for the slide/objects underneath); the outline elements stay `pointer-events-none` too (an outline shouldn't steal the drag/click that the object's own div already handles), while the resize-handle and toolbar-button elements individually opt back in with `pointer-events-auto`, matching how they capture pointer events today.

### Lift editable-node access out of `TextObjectBox` via an imperative handle
`applyMark`/`applyListType` need the editing object's live `contentEditable` DOM node and selection offsets, which only `TextObjectBox` has direct access to (its own `editableRef`). Convert `TextObjectBox` to `forwardRef` and expose `{ applyMark, applyListType }` via `useImperativeHandle`. `DeckCanvas` keeps a single ref (only one object can be `editing` at a time) pointing at the currently-editing box's handle, attached via the `ref` prop on the `editing` object's `TextObjectBox`. The overlay's toolbar buttons call through that ref instead of owning the logic themselves.

Alternative considered: move `editableRef`/`applyMark`/`applyListType`/`commitText` entirely up into `DeckCanvas`, keyed by object id. Rejected as a larger, riskier diff — it would also relocate the DOM-seeding effects (lines 87–117 today) that are tightly coupled to a single object's mount/edit lifecycle, for no behavioral benefit over exposing an imperative handle.

### Rect math is computed once per render and shared
The overlay needs the same `rect = liveRect ?? obj` computation `TextObjectBox` already does per object, for every selected/editing object. Compute it in `DeckCanvas` (which already holds `liveRects` and `deckState.objects`) and pass the resolved rects down to both `TextObjectBox` (for its own layout) and the overlay (for chrome placement), rather than duplicating the `liveRect ?? obj` fallback in two places.

## Risks / Trade-offs

- [Overlay outline duplicates styling that today lives on the object's own div (border/ring classes)] → Keep the visual style identical (same Tailwind classes, just moved to the overlay element) so there's no visible difference, only a stacking-order fix.
- [Multi-select with several selected objects overlapping each other means overlay handles can visually overlap too] → Out of scope: this matches current behavior when multiple selected objects overlap (their handles already competed for the same screen space); this change only fixes chrome being hidden *behind unselected objects*, not handle-vs-handle overlap between two selected objects.
- [Imperative handle adds a small amount of ref-plumbing complexity to `TextObjectBox`] → Scoped to exactly the two functions the toolbar needs; no other behavior of `TextObjectBox` changes.
