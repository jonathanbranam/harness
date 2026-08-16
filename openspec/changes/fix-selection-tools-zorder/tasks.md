## 1. Share rect resolution and expose the editing node

- [ ] 1.1 In `DeckCanvas`, compute each object's resolved rect (`liveRect ?? obj`) once per render (e.g. a `resolvedRects` map keyed by object id) instead of leaving that computation inside `TextObjectBox`.
- [ ] 1.2 Pass the resolved rect into `TextObjectBox` as a prop instead of having it recompute `rect = liveRect ?? obj` from `liveRect`/`obj` itself.
- [ ] 1.3 Convert `TextObjectBox` to `forwardRef` and expose `{ applyMark, applyListType }` via `useImperativeHandle`.
- [ ] 1.4 In `DeckCanvas`, hold a ref to the currently-editing `TextObjectBox`'s imperative handle, attached only on the object whose id matches `editingId`.

## 2. Strip inline selection chrome from `TextObjectBox`

- [ ] 2.1 Remove the selection border/ring classes from the object's own `<div>` (`selected ? 'border-indigo-400 ring-2 ring-indigo-400/40' : 'border-transparent'`).
- [ ] 2.2 Remove the resize-handle corner `<div>`s (currently rendered when `selected && !editing`).
- [ ] 2.3 Remove the floating format toolbar `<div>` (currently rendered when `editing`), including its `applyMark`/`applyListType` button wiring — those functions stay defined in `TextObjectBox` but are now called only via the imperative handle from step 1.3.

## 3. Add the selection/editing overlay

- [ ] 3.1 Add an overlay layer inside the scaled canvas `<div>`, rendered immediately after the `deckState.objects.map(...)` block so it paints last (on top of every object). Give the overlay container `pointer-events-none`.
- [ ] 3.2 Render an outline element (same border/ring styling removed in 2.1) for every selected object, positioned/sized from its resolved rect, `pointer-events-none`.
- [ ] 3.3 Render resize-handle elements (same styling/positions removed in 2.2) for every selected, non-editing object, positioned from its resolved rect, wired to the existing `handlePointerDownResize(e, obj, corner)` callback, `pointer-events-auto`.
- [ ] 3.4 Render the floating format toolbar (same styling/buttons removed in 2.3) when `editingId` is set, positioned against the editing object's resolved rect, with its buttons calling `applyMark`/`applyListType` through the ref from step 1.4, `pointer-events-auto`.
- [ ] 3.5 Skip rendering the overlay entirely in `readOnly` mode (preview already renders no chrome).

## 4. Verify

- [ ] 4.1 `npm run typecheck`.
- [ ] 4.2 `npm test` (in particular any existing `client-deck` tests covering selection/resize/editing, if present).
- [ ] 4.3 Using `playwright-cli` against the already-running `client-deck` dev server: create two overlapping text boxes, select the one behind, and confirm its outline and resize handles are fully visible over the overlap (not covered by the front object).
- [ ] 4.4 Using `playwright-cli`: double-click the back object to edit it, and confirm the floating format toolbar is fully visible and its bold/italic/list buttons work.
- [ ] 4.5 Regression-check unaffected behavior: single-object select/drag/resize, multi-select with shift-click, click-elsewhere clears selection, editing commits text on blur.
