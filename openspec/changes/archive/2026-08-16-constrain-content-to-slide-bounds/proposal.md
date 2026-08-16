## Why

Nothing today stops an object from being placed, dragged, or resized outside the slide's fixed 960x540 logical coordinate space. `deck-harness-server`'s `editor-state.ts` accepts any numeric x/y/width/height for `setPosition`, `setSize`, and `addObject`, and `client-deck`'s `DeckCanvas.tsx` drag/resize handlers don't clamp pointer movement to the slide edges either. Both the user (dragging in the UI) and Claude (via the presentation-bridge tools) can end up with objects partially or fully off-canvas, where they render outside the visible slide and are excluded from `slide_view` screenshots — silently lost content with no feedback that anything went wrong.

## What Changes

- Object position and size updates (`setPosition`, `setSize`, `addObject`) are clamped server-side in `editor-state.ts` so the resulting object always stays fully within the slide's 0,0 to 960,540 bounds — this is the single source of truth, applying equally to UI-driven edits and Claude's tool calls.
- Dragging an object in `DeckCanvas.tsx` stops at the slide edge instead of letting the pointer run past it, so the on-screen drag behavior matches the enforced bounds rather than snapping back after release.
- Resizing an object similarly stops growing/moving past the slide edge during the resize gesture.
- Objects that are already off-canvas (e.g. from before this change, or from direct state edits) are left as-is until the user or Claude next moves/resizes them — this change constrains new placements, it does not retroactively repair existing decks.

## Capabilities

### New Capabilities
- `deck-object-bounds`: Rules constraining where and how large objects on a slide may be positioned/sized, enforced consistently for both UI interactions and agent tool calls.

## Impact

- `deck-harness-server/src/editor-state.ts`: clamping logic added to `setPosition`, `setSize`, and `addObject` action handling.
- `client-deck/src/components/DeckCanvas.tsx`: drag and resize pointer-math updated to clamp to slide bounds during the gesture, not just on commit.
- No protocol or tool-signature changes — `presentation-bridge.ts`'s tool descriptions for `setSize`/`addObject` are unaffected since clamping happens inside `editorStore`.
