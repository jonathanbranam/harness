## Why

On `DeckCanvas`, each object's selection outline, resize handles, and (while editing text) floating format toolbar are rendered as children of that object's own `<div>`, in the same DOM stacking position as the object itself (`client-deck/src/components/DeckCanvas.tsx`'s `TextObjectBox`). Objects are painted in z-order, so when a selected object sits behind another object, any overlapping part of its selection outline, resize handles, or format toolbar is visually covered by the object in front of it — the editing UI becomes partially or fully unusable exactly when it's needed most (a user trying to select or resize a background object).

## What Changes

- Selection outline and resize handles for a selected object render above every slide object, regardless of the selected object's position in the slide's z-order.
- The floating text-format toolbar (shown while editing a text box) renders above every slide object, regardless of the object being edited's position in the slide's z-order.
- No change to the underlying z-order of slide objects themselves — only to the stacking of selection/editing chrome drawn on top of them.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `presentation-editing`: adds a requirement that selection outline/resize handles and the floating format toolbar always render above all slide objects, independent of the selected/edited object's z-order.

## Impact

- `client-deck/src/components/DeckCanvas.tsx`: `TextObjectBox` currently renders its selection border, resize handles, and format toolbar inline with the object; this needs an overlay layer (positioned to match the live/selected object's rect) rendered after all objects in DOM order, or an equivalent stacking-context fix (e.g. elevating `z-index` on the selected object's chrome without changing its own paint order relative to siblings).
- No server-side or shared-state changes — this is purely client-side rendering/stacking.
