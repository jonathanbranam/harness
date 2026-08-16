## Why

On `DeckCanvas`, each object's selection outline, resize handles, and (while editing text) floating format toolbar are rendered as children of that object's own `<div>`, in the same DOM stacking position as the object itself (`client-deck/src/components/DeckCanvas.tsx`'s `TextObjectBox`). Objects are painted in z-order, so when a selected object sits behind another object, any overlapping part of its selection outline, resize handles, or format toolbar is visually covered by the object in front of it — the editing UI becomes partially or fully unusable exactly when it's needed most (a user trying to select or resize a background object).

## What Changes

- Selection outline and resize handles for a selected object render above every slide object, regardless of the selected object's position in the slide's z-order.
- The floating text-format toolbar (shown while editing a text box) renders above every slide object, regardless of the object being edited's position in the slide's z-order.
- The object currently being edited (double-clicked into text-edit mode) itself renders above every other slide object for the duration of editing, so its text stays visible while typing even if it's normally behind another object — and returns to its stored z-order position as soon as editing ends.
- No change to the underlying, stored z-order of slide objects themselves (what's persisted in shared deck state) — only to what's painted on top, and, for the object being actively edited, its temporary paint order for the duration of that edit.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `presentation-editing`: adds a requirement that selection outline/resize handles and the floating format toolbar always render above all slide objects, independent of the selected/edited object's z-order.

## Impact

- `client-deck/src/components/DeckCanvas.tsx`: `TextObjectBox` currently renders its selection border, resize handles, and format toolbar inline with the object; this needs an overlay layer (positioned to match the live/selected object's rect) rendered after all objects in DOM order, or an equivalent stacking-context fix (e.g. elevating `z-index` on the selected object's chrome without changing its own paint order relative to siblings).
- `client-deck/src/components/DeckCanvas.tsx`: the object list needs a render-order pass that moves the currently-editing object last (frontmost) for painting purposes, without mutating `deckState.objects` (the stored, server-synced z-order).
- No server-side or shared-state changes — this is purely client-side rendering/stacking. `editingId` is already local-only React state (not synced via the deck's shared websocket state), so temporarily reordering paint order for the editing object doesn't need to touch shared state either.
