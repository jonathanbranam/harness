## 1. EditorStore: actor-aware mutations and history core

- [x] 1.1 Add an `Actor = 'user' | 'agent'` type and a `HistoryEntry` interface (`id`, `actor`, `timestamp`, `description`, `before`/`after` snapshots of `{ decks, activeDeckId, selection }`) to `editor-state.ts`.
- [x] 1.2 Add a private `withHistory(actor, description, mutate)` helper on `EditorStore`: deep-clones the pre-mutation snapshot, runs `mutate()`, deep-clones the post-mutation snapshot, discards any redo tail, pushes the entry (evicting the oldest entry once the ~100 cap is exceeded), then calls `emit()` once. Implemented as `commitHistory` (the shared cap/eviction/emit logic) plus `withHistory` (the common capture-before/mutate/capture-after wrapper for createDeck/deleteDeck/addSlide/removeSlide); `applyUpdate` calls `commitHistory` directly instead of `withHistory` so it can skip the commit entirely when a batch's every target id fails and nothing actually changed (see its doc comment) — required by the "Content mutations are captured in history" requirement's implicit "only when something changed."
- [x] 1.3 Add a required `actor: Actor` parameter to `applyUpdate`, `createDeck`, `deleteDeck`, `addSlide`, and `removeSlide`, and route each method's body through `withHistory` with a short human-readable description derived from the action/operation (e.g. "Moved 2 objects", "Added slide", "Deleted deck").
- [x] 1.4 Implement `undo(actor, count = 1)` and `redo(actor, count = 1)`: pop/push between the undo and redo stacks up to `count` times (stopping early if exhausted), restoring the relevant snapshot on each step, and call `emit()` once at the end. Return which entries were stepped.
- [x] 1.5 Implement `getHistory(limit?)` returning entries most-recent-first (actor, timestamp, description) plus `canUndo`/`canRedo`.
- [x] 1.6 Add `canUndo`/`canRedo` booleans to `DeckState` and populate them in `getState()`.
- [x] 1.7 Update every existing internal call site of the now-`actor`-requiring methods. Correction to this task's own premise: `pi-extensions/deck-management.ts` (added by the since-landed add-deck-rename change, after this proposal was drafted) also calls `createDeck`/`deleteDeck`/`addSlide`/`removeSlide` directly and needed the same `'agent'`-actor threading as `presentation-bridge.ts` — updated here too. Also updated `deck-persistence.test.ts`'s direct `EditorStore.createDeck` calls, which task 5.1 likewise didn't anticipate.

## 2. Agent tool surface

- [x] 2.1 In `pi-extensions/presentation-bridge.ts`, pass `'agent'` as the actor on every `editorStore.applyUpdate` call (and any other mutating call added there). Also updated `pi-extensions/deck-management.ts`'s `createDeck`/`deleteDeck`/`addSlide`/`removeSlide` calls to pass `'agent'` — see 1.7's note.
- [x] 2.2 Register `presentation_history`: optional `limit` param, returns entries (actor, timestamp, description) most-recent-first plus `canUndo`/`canRedo`.
- [x] 2.3 Register `presentation_undo` and `presentation_redo`: optional `count` param (default 1), call `editorStore.undo('agent', count)` / `redo('agent', count)`, return which entries were stepped and the resulting `canUndo`/`canRedo`.

## 3. WebSocket protocol

- [x] 3.1 Add `'user'` as the actor argument on every existing mutating call in `websocket.ts` (`object_update`, `create_deck`, `delete_deck`, `add_slide`, `remove_slide`).
- [x] 3.2 Add `undo` and `redo` to the `ClientMessage` union, calling `editorStore.undo('user')` / `redo('user')`.
- [x] 3.3 Confirm `DeckState` broadcasts already carry `canUndo`/`canRedo` (from task 1.6) with no further wiring needed, since `emit()` already fires on every mutation including undo/redo.

## 4. Client UI

- [x] 4.1 Add Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z handling to `DeckCanvas.tsx`'s existing global `keydown` listener, guarded the same way as the existing Delete/Backspace handler so the shortcuts are suppressed while inline text-editing is active.
- [x] 4.2 Send `{ type: 'undo' }` / `{ type: 'redo' }` over the WebSocket from the keyboard handler and from new toolbar undo/redo buttons.
- [x] 4.3 Add undo/redo toolbar buttons, disabled based on `deckState.canUndo`/`deckState.canRedo`. Also updated `useDeckSocket.ts` (canUndo/canRedo on its duplicated `DeckState` type, `undo`/`redo` senders) and `PresentationView.tsx`'s read-only `DeckCanvas` usage — not named in this task but required once `onUndo`/`onRedo` became required `DeckCanvasProps`.

## 5. Tests

- [x] 5.1 Update `editor-state.test.ts`'s existing calls to pass an actor argument.
- [x] 5.2 Add `editor-state.test.ts` coverage: undo reverts the most recent entry (content, selection, active deck/slide); redo reapplies it; a new edit after undo discards the redo tail; the ~100-entry cap evicts the oldest entry; undo/redo on an empty stack is a no-op that doesn't throw; entries record the correct actor. Added as a new `describe('editorStore undo/redo', ...)` block using fresh `new EditorStore(null)` instances rather than the shared `editorStore` singleton the rest of the file mutates sequentially — undo/redo scenarios need a deterministic starting history. Also added a case verifying a fully-failed `applyUpdate` (every target id unknown) does not push a history entry, per the "only when something changed" nuance in 1.2.
- [x] 5.3 Add coverage for `getHistory` ordering (most-recent-first) and its `canUndo`/`canRedo` values at each stack state.
- [x] 5.4 Add coverage for `undo`/`redo` with `count` exceeding the available entries (stops at the bottom, reports how many actually stepped).

## 6. Verification

- [x] 6.1 Run `npm run typecheck` and `npm test`. `deck-harness-server` and `client-deck` (this change's scope) both typecheck clean and `npx vitest run deck-harness-server` is 79/79 passing. The workspace-wide `npm run typecheck`/`npm test` also touch `introspect-harness-server`, which has an unrelated, pre-existing type error from the concurrent introspect-harness-phase-02 work in progress on this same working tree (`session-store.ts(40,26)`) — not part of this change, left untouched.
- [x] 6.2 Manually verified via `playwright-cli` against the already-running dev servers (never restarted them myself; `tsx watch` picked up source edits on its own). Toolbar Undo/Redo buttons enable/disable correctly and click-drive real undo/redo; Cmd+Z / Cmd+Shift+Z keyboard shortcuts work identically. Caught and fixed a real bug this way: `session-store.ts`'s `CUSTOM_TOOL_NAMES` allowlist (which independently gates which registered tools `createAgentSession` actually exposes to the model, separate from `pi.registerTool`) didn't include the three new tools, so pi genuinely had no access to them despite correct registration — confirmed by asking pi to list its tools before the fix, then re-verified after adding `presentation_history`/`presentation_undo`/`presentation_redo` there (and `presentation_history` to `permission-gate.ts`'s `READ_ONLY_TOOLS`). After the fix, prompting "Add a new text box..." then "Undo your last change" made pi correctly call `presentation_undo` (not a manual `removeObject` workaround, which is what it did before the fix) and report accurate `canUndo`/`canRedo`.
