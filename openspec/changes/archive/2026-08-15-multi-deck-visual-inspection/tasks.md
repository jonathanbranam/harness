## 1. Data model

- [x] 1.1 Restructure `editor-state.ts`'s store to `{ decks: Map<deckId, Deck>, activeDeckId }`, `Deck = { id, name, slides: Slide[], activeSlideId }`, `Slide = { id, objects: DeckObject[] }`; object ids scoped per-slide (not globally unique)
- [x] 1.2 Seed the store on startup with one default deck containing one slide with today's existing seed objects, so current behavior is preserved as "deck 1 / slide 1"
- [x] 1.3 Implement `getActiveState()` returning the shape `deck-agent-session`'s broadcast needs: deck list (id, name), active deck id, active deck's slide list (id), active slide id, active slide's objects + selection

## 2. Deck management

- [x] 2.1 Implement `createDeck(name)`: adds a deck with one blank slide, makes it active (deck + its blank slide)
- [x] 2.2 Implement `listDecks()`: id, name, slide count per deck
- [x] 2.3 Implement `selectDeck(deckId)`: rejects unknown id; restores that deck's own last-active slide (its first slide the first time)
- [x] 2.4 Implement `deleteDeck(deckId)`: rejects deleting the last remaining deck; if deleting the active deck, activates a remaining one
- [x] 2.5 Unit tests for 2.1-2.4 (mirrors `editor-state.test.ts`'s existing style)

## 3. Slide management

- [x] 3.1 Implement `addSlide()`: appends a blank slide to the active deck, makes it active
- [x] 3.2 Implement `removeSlide(slideId)`: rejects removing the last slide in a deck; if removing the active slide, activates a neighboring slide
- [x] 3.3 Implement `selectSlide(slideId)`: rejects unknown id or an id belonging to a different deck; clears the current selection (selection is per-slide, per `presentation-editing`'s "Selection resets when the active slide changes")
- [x] 3.4 Unit tests for 3.1-3.3

## 4. Re-scope existing presentation tools to the active slide

- [x] 4.1 Update `presentation_get_state` to return the active slide's objects/selection plus active deck/slide identity
- [x] 4.2 Update `presentation_update` and `presentation_select_by_text` to operate only on the active slide's objects (id lookups scoped accordingly)
- [x] 4.3 Update the `before_agent_start` context-injection hook to include active deck/slide identity alongside the active slide's objects and selection

## 5. Deck/slide tools for pi

- [x] 5.1 Register `deck_create`, `deck_list`, `deck_select`, `deck_delete` tools in `presentation-bridge.ts` (or a new `pi-extensions/deck-management.ts`), calling the functions from section 2
- [x] 5.2 Register `slide_add`, `slide_remove`, `slide_select` tools, calling the functions from section 3
- [x] 5.3 Update `.pi/skills/presentation/SKILL.md` / `AGENTS.md` templates with guidance on when to use the new deck/slide tools

## 6. WebSocket protocol: deck/slide messages

- [x] 6.1 Add client->server message types `select_deck`, `select_slide`, `create_deck`, `delete_deck`, `add_slide`, `remove_slide` to `websocket.ts`, each calling the same functions as their tool counterparts
- [x] 6.2 Update the `deck_state` broadcast payload to the new shape from 1.3; broadcast on every deck/slide-affecting change (create/delete/select deck, add/remove/select slide), not just object edits
- [x] 6.3 Update `selection` message handling to scope against the active slide's objects only
- [x] 6.4 Update `client-deck`'s `useDeckSocket.ts` types and reducer for the new `deck_state` shape and new outbound message senders

## 7. Visual inspection: render request/response protocol

- [x] 7.1 Server: add a pending-render-request map (keyed by request id) on the WebSocket connection that originated the current turn, mirroring `permission-gate.ts`'s approval pattern; `websocket.ts` resolves it on `render_response`, or as failed on disconnect (per `deck-agent-session`'s "Server-requested browser rendering")
- [x] 7.2 Server: apply a timeout on the pending request; on timeout, resolve as failed
- [x] 7.3 Register the `slide_view` (or similarly named) tool in `presentation-bridge.ts`: sends a `render_request` to the originating connection, awaits the image, returns it as image content (per `slide-visual-inspection`'s requirements)
- [x] 7.4 Client: add `html-to-image` as a `client-deck` dependency
- [x] 7.5 Client: on receiving `render_request`, capture the `DeckCanvas` DOM node via `html-to-image`, send the resulting PNG data URL back as `render_response`

## 8. Client UI: deck and slide switchers

- [x] 8.1 Add a deck switcher (list decks, create deck, select deck, delete deck) to `client-deck`
- [x] 8.2 Add a slide switcher within the active deck (list slides, add slide, remove slide, select slide) to `client-deck`
- [x] 8.3 Ensure `DeckCanvas` re-renders correctly when the active deck/slide changes (including clearing any client-local selection UI state)

## 9. Verification

- [x] 9.1 `npm run typecheck`, `npm test`, `npm run build` all pass
- [X] 9.2 Manual smoke test: create a second deck, add/remove slides, switch between decks/slides, confirm edits stay scoped to the correct slide and selection resets on slide switch
- [X] 9.3 Manual smoke test: prompt pi to use the slide-view tool after making a layout change (e.g. text overflowing a box) and confirm the returned image actually shows the issue
- [X] 9.4 Manual smoke test: disconnect the browser tab mid-render-request (or mid-approval) and confirm the pending request fails cleanly instead of hanging the agent turn
