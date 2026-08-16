## 1. Server: rename operation

- [x] 1.1 Add `renameDeck(deckId, name)` to `EditorStore` in `deck-harness-server/src/editor-state.ts`, alongside `createDeck`/`selectDeck`/`deleteDeck`: return `{ ok: false, error }` for an unknown `deckId`; trim `name` and return `{ ok: false, error }` if the trimmed result is empty; otherwise set the deck's `name` to the trimmed value, `emit()`, and return `{ ok: true }`.
- [x] 1.2 Add a `{ type: 'rename_deck'; deckId: string; name: string }` variant to `ClientMessage` in `deck-harness-server/src/websocket.ts`, and a handler case that calls `editorStore.renameDeck(msg.deckId, msg.name)` following the same pattern as the `select_deck`/`delete_deck` cases.
- [x] 1.3 Add unit tests in `deck-harness-server/src/editor-state.test.ts` covering: renaming the active deck, renaming a non-active deck, renaming to an empty/whitespace-only name (rejected, name unchanged), and renaming an unknown deck id (rejected).

## 2. Agent tool: deck_rename

- [x] 2.1 In `deck-harness-server/src/pi-extensions/deck-management.ts`, register a `deck_rename` tool alongside `deck_create`/`deck_list`/`deck_select`/`deck_delete`: parameters `{ deckId: string, name: string }`, `execute` calls `editorStore.renameDeck(params.deckId, params.name)` and returns `'OK'`/`Error: <message>` text with `isError: !result.ok`, matching `deck_select`'s/`deck_delete`'s existing pattern.
- [x] 2.2 Manually verify via the chat panel in the running dev app: ask Claude to rename a deck (both the active one and a non-active one by id) and confirm the deck list updates; ask it to rename to an empty name and confirm it reports the rejection.

## 3. Client: rename UI

- [x] 3.1 Add a `renameDeck(deckId, name)` sender to `client-deck/src/hooks/useDeckSocket.ts` that sends `{ type: 'rename_deck', deckId, name }`, following `createDeck`'s existing pattern, and export it alongside the other deck actions.
- [x] 3.2 In `client-deck/src/components/DeckSwitcher.tsx`, make the active deck's tab enter an inline-edit state on double-click (mirroring `DeckCanvas.tsx`'s `editingId` text-edit convention): render an input pre-filled with the deck's current name, commit via `onRename` on Enter/blur (skip the call if the trimmed value is empty or unchanged), and cancel back to the button on Escape.
- [x] 3.3 Wire the new `onRename` prop through from `client-deck/src/pages/DeckPage.tsx` to `DeckSwitcher`, passing the `renameDeck` sender from `useDeckSocket`.
- [x] 3.4 Manually verify in the running dev app: double-click the active deck tab, rename it, confirm the new name shows in the deck bar; try renaming to blank (rejected, old name persists); rename a non-active deck by switching to it first, since only the active deck's tab exposes the double-click affordance per 3.2.

## 4. Spec sync

- [x] 4.1 Run `openspec validate add-deck-rename --strict` and fix any issues.
