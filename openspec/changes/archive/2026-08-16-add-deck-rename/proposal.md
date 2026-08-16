## Why

A deck's name is currently set once at creation time (`createDeck(name)`) and can never be changed afterward — there's no way to fix a typo or retitle a deck as its content evolves without deleting and recreating it (losing all its slides).

## What Changes

- Add a `rename_deck` operation: given a deck id and a new name, updates that deck's name in place. Follows the existing `create_deck`/`select_deck`/`delete_deck` WebSocket pattern (`ClientMessage` handled by `editorStore`) for the UI path.
- Add a matching `deck_rename` tool to `deck-harness-server/src/pi-extensions/deck-management.ts`, so Claude has the same rename capability as the user — completing the symmetry with the `deck_create`/`deck_list`/`deck_select`/`deck_delete` tools already registered there.
- Reject renaming to an empty/whitespace-only name, same validation posture as deck creation.
- Add a rename affordance to the deck list UI in `client-deck` so the user can trigger it (e.g. inline rename on the deck they're viewing/switching between).
- The existing UI restriction that lets the user delete only the currently active deck (not an arbitrary deck by id, unlike the agent's `deck_delete` tool) stays as-is — confirmed as an intentional, acceptable asymmetry, not something this change addresses.

## Capabilities

### Modified Capabilities
- `deck-management`: adds a "Rename a deck" requirement alongside the existing create/list/select/delete requirements.

## Impact

- `deck-harness-server/src/editor-state.ts`: new `renameDeck(deckId, name)` method on `EditorStore`, alongside `createDeck`/`selectDeck`/`deleteDeck`.
- `deck-harness-server/src/websocket.ts`: new `{ type: 'rename_deck'; deckId: string; name: string }` `ClientMessage` variant and handler.
- `client-deck/src/**`: deck list/switcher UI gets a rename control that sends the new message type.
- `deck-harness-server/src/pi-extensions/deck-management.ts`: new `deck_rename` tool registered alongside `deck_create`/`deck_list`/`deck_select`/`deck_delete`, calling `editorStore.renameDeck`.
