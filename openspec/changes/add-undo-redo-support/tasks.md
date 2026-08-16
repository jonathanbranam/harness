## 1. EditorStore: actor-aware mutations and history core

- [ ] 1.1 Add an `Actor = 'user' | 'agent'` type and a `HistoryEntry` interface (`id`, `actor`, `timestamp`, `description`, `before`/`after` snapshots of `{ decks, activeDeckId, selection }`) to `editor-state.ts`.
- [ ] 1.2 Add a private `withHistory(actor, description, mutate)` helper on `EditorStore`: deep-clones the pre-mutation snapshot, runs `mutate()`, deep-clones the post-mutation snapshot, discards any redo tail, pushes the entry (evicting the oldest entry once the ~100 cap is exceeded), then calls `emit()` once.
- [ ] 1.3 Add a required `actor: Actor` parameter to `applyUpdate`, `createDeck`, `deleteDeck`, `addSlide`, and `removeSlide`, and route each method's body through `withHistory` with a short human-readable description derived from the action/operation (e.g. "Moved 2 objects", "Added slide", "Deleted deck").
- [ ] 1.4 Implement `undo(actor, count = 1)` and `redo(actor, count = 1)`: pop/push between the undo and redo stacks up to `count` times (stopping early if exhausted), restoring the relevant snapshot on each step, and call `emit()` once at the end. Return which entries were stepped.
- [ ] 1.5 Implement `getHistory(limit?)` returning entries most-recent-first (actor, timestamp, description) plus `canUndo`/`canRedo`.
- [ ] 1.6 Add `canUndo`/`canRedo` booleans to `DeckState` and populate them in `getState()`.
- [ ] 1.7 Update every existing internal call site of the now-`actor`-requiring methods (there are none outside `presentation-bridge.ts` and `websocket.ts`, updated in sections 2–3).

## 2. Agent tool surface

- [ ] 2.1 In `pi-extensions/presentation-bridge.ts`, pass `'agent'` as the actor on every `editorStore.applyUpdate` call (and any other mutating call added there).
- [ ] 2.2 Register `presentation_history`: optional `limit` param, returns entries (actor, timestamp, description) most-recent-first plus `canUndo`/`canRedo`.
- [ ] 2.3 Register `presentation_undo` and `presentation_redo`: optional `count` param (default 1), call `editorStore.undo('agent', count)` / `redo('agent', count)`, return which entries were stepped and the resulting `canUndo`/`canRedo`.

## 3. WebSocket protocol

- [ ] 3.1 Add `'user'` as the actor argument on every existing mutating call in `websocket.ts` (`object_update`, `create_deck`, `delete_deck`, `add_slide`, `remove_slide`).
- [ ] 3.2 Add `undo` and `redo` to the `ClientMessage` union, calling `editorStore.undo('user')` / `redo('user')`.
- [ ] 3.3 Confirm `DeckState` broadcasts already carry `canUndo`/`canRedo` (from task 1.6) with no further wiring needed, since `emit()` already fires on every mutation including undo/redo.

## 4. Client UI

- [ ] 4.1 Add Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z handling to `DeckCanvas.tsx`'s existing global `keydown` listener, guarded the same way as the existing Delete/Backspace handler so the shortcuts are suppressed while inline text-editing is active.
- [ ] 4.2 Send `{ type: 'undo' }` / `{ type: 'redo' }` over the WebSocket from the keyboard handler and from new toolbar undo/redo buttons.
- [ ] 4.3 Add undo/redo toolbar buttons, disabled based on `deckState.canUndo`/`deckState.canRedo`.

## 5. Tests

- [ ] 5.1 Update `editor-state.test.ts`'s existing calls to pass an actor argument.
- [ ] 5.2 Add `editor-state.test.ts` coverage: undo reverts the most recent entry (content, selection, active deck/slide); redo reapplies it; a new edit after undo discards the redo tail; the ~100-entry cap evicts the oldest entry; undo/redo on an empty stack is a no-op that doesn't throw; entries record the correct actor.
- [ ] 5.3 Add coverage for `getHistory` ordering (most-recent-first) and its `canUndo`/`canRedo` values at each stack state.
- [ ] 5.4 Add coverage for `undo`/`redo` with `count` exceeding the available entries (stops at the bottom, reports how many actually stepped).

## 6. Verification

- [ ] 6.1 Run `npm run typecheck` and `npm test`.
- [ ] 6.2 Manually verify in the running dev app (ask the user to confirm servers are up per this repo's "never kill or restart dev servers" rule; do not start/stop them yourself): keyboard undo/redo, toolbar button enabled state, and pi undoing its own recent edits via a prompt like "undo your last change."
