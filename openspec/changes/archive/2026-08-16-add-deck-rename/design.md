## Context

See proposal.md - Why. Relevant current state:

- Deck-level operations follow one consistent round trip today: `client-deck` sends a typed `ClientMessage` over the WebSocket (`deck-harness-server/src/websocket.ts`), the handler calls a matching method on `editorStore` (`deck-harness-server/src/editor-state.ts`), and the store's `emit()` pushes a fresh `deck_state` snapshot back to every connected client (including the sender) — there's no separate ack message, the state broadcast *is* the confirmation.
- `selectDeck`/`deleteDeck` return an `OpResult` (`{ ok: true } | { ok: false; error }`) so the websocket handler has something to check; `createDeck` does not validate its `name` argument at all today (`DeckSwitcher.tsx`'s create form trims and rejects empty client-side, but nothing stops a malformed message from setting an empty name server-side).
- `DeckSwitcher.tsx` renders each deck as a button in a horizontal bar, plus a "+ Deck" create form and a "Delete deck" button for the active deck. There's no per-deck secondary UI (menu, hover controls) yet.
- `client-deck/src/components/DeckCanvas.tsx` already establishes a double-click-to-edit convention for renaming/editing text in place (`editingId` state, double-click promotes an object into edit mode).
- `deck-harness-server/src/pi-extensions/deck-management.ts` already registers `deck_create`/`deck_list`/`deck_select`/`deck_delete` tools, giving Claude agent-side access to those four deck operations. Notably `deck_delete` takes an arbitrary `deckId` and can delete any deck, while the UI's "Delete deck" button only ever targets the active deck (`DeckSwitcher.tsx`'s `onClick={() => onDelete(activeDeckId)}`) — a UI/agent asymmetry that predates this change and is confirmed as an intentional, acceptable restriction, not something this change addresses.

## Goals / Non-Goals

**Goals:**
- Reuse the existing `ClientMessage` → `editorStore` method → broadcast round trip exactly as `select_deck`/`delete_deck` do, rather than inventing a new response/ack pattern.
- Close the existing gap where deck names aren't validated server-side, for `renameDeck` at minimum (see Decisions - don't expand scope to retrofit `createDeck`).

**Non-Goals:**
- Retrofitting `createDeck` with the same validation (out of scope for this change; noted as a follow-up, not silently bundled in).
- Renaming while offline/optimistic UI — the rename button follows the same "send and wait for the broadcast state to reflect it" pattern as every other deck operation; no local-only optimistic name state.

## Decisions

**`renameDeck(deckId, name)` returns `OpResult` and trims + rejects empty names server-side.** Mirrors `selectDeck`/`deleteDeck`'s `OpResult` shape (`createDeck` doesn't need one today since it can't fail). Trimming and empty-rejection happens in `editorStore`, not just the client form, so a malformed or non-UI-originated `rename_deck` message can't blank out a deck's name.
- Alternative considered: leave validation entirely to the client, matching `createDeck`'s current laxity. Rejected — renaming is more likely to be attempted programmatically or scripted against the WebSocket directly than deck creation's one-time form, and an accidentally-blanked deck name is worse UX than a rejected rename.

**Rename UI: double-click the active deck's tab in `DeckSwitcher.tsx` to turn its label into an inline text input**, committing on Enter/blur and canceling on Escape — the same interaction shape `DeckCanvas.tsx` already uses for text editing, rather than introducing a new button or modal into the deck bar.
- Alternative considered: a persistent "rename" icon/button next to each deck tab. Rejected — the deck bar is already dense (name, slide count, create form, delete button) and double-click is both an established convention here and standard for inline rename elsewhere.

**Add a `deck_rename` tool to `deck-management.ts`, matching the existing `deck_select`/`deck_delete` shape.** Same `{ deckId, name }`-style parameters as the WebSocket message, calling `editorStore.renameDeck` directly (no self-HTTP, consistent with every other tool in this file) and returning `'OK'`/`Error: <message>` text with `isError: !result.ok`, exactly like `deck_select`/`deck_delete`'s `execute`. This gives Claude the same rename capability as the user, completing the symmetry with `deck_create`/`deck_list`/`deck_select`/`deck_delete`.
- Alternative considered: leave rename UI-only. Rejected — the other four deck operations are already agent tools, so an agent-side gap specifically on rename would be an arbitrary, hard-to-explain omission rather than a deliberate scope boundary.

## Risks / Trade-offs

- **Double-click discoverability** → a user unfamiliar with the text-edit convention elsewhere in the app might not find rename. Mitigated by it already being the app's established pattern (not a net-new interaction to learn) and by the low cost of documenting it if it comes up.
- **`createDeck` name validation gap remains** → a deck can still be created with an empty/whitespace name via a malformed message, while `renameDeck` closes that gap only for renames. Accepted as out of scope; flagged here in case it becomes a follow-up.
