## Why

The current harness has exactly one hardcoded deck with a flat list of objects and no concept of slides — `editorStore` is a single global singleton (see `openspec/specs/presentation-editing/spec.md` and `design.md`'s "Deck state is one process-global store" decision from `deck-harness-scaffold`). That was enough to validate the chat-driven-editing pattern, but it can't support real presentation work: multiple decks, multiple slides per deck, or adding/removing slides. Separately, pi can currently only reason about layout from numeric bounds (`presentation_get_state`'s x/y/width/height) — it has no way to actually *see* whether text overflows a box, overlaps another object, or otherwise looks wrong, which is exactly the kind of thing numbers alone don't reveal.

## What Changes

- Restructure the deck store from a single flat object list into decks -> slides -> objects: multiple decks, each with an ordered list of slides, each slide holding its own objects.
- Add deck management: create a deck, list decks, select the active deck, delete a deck.
- Add slide management within the active deck: add a slide, remove a slide, reorder/select the active slide.
- Existing element editing (`presentation_update`, `presentation_select_by_text`, canvas click-to-select) keeps working exactly as before, but now operates on the active deck's active slide instead of one global object list — this is a **BREAKING** change to `presentation-editing`'s and `deck-agent-session`'s existing requirements (deck/slide addressing didn't exist before).
- Add a visual-inspection tool that renders the active slide to an image and returns it to pi as image content, so it can directly see sizing/overlap/overflow issues instead of inferring them from bounds alone.
- Everything above is scoped to *this* harness's server + client (`deck-harness-server` / `client-deck`) — no new workspaces, no new project.

## Capabilities

### New Capabilities
- `deck-management`: creating, listing, selecting, and deleting decks, and adding, removing, and selecting slides within the active deck.
- `slide-visual-inspection`: rendering the active slide to an image on demand and returning it to pi as visual tool output.

### Modified Capabilities
- `presentation-editing`: object read/update/find-by-text requirements now operate on the active deck's active slide rather than a single global object list.
- `deck-agent-session`: deck-state broadcast and selection-sharing requirements now carry (and are scoped to) an active deck/slide identity instead of assuming one global deck.

## Impact

- **Server**: `deck-harness-server/src/editor-state.ts` (deck/slide data model), `pi-extensions/presentation-bridge.ts` (new deck/slide tools, existing tools re-scoped), `websocket.ts` (deck/slide-aware messages), a new rendering path for `slide-visual-inspection` (likely a headless-render step producing a PNG/JPEG of the active slide).
- **Client**: `client-deck` deck canvas becomes slide-aware (needs a slide switcher; deck switcher UI); `useDeckSocket.ts`'s message types gain deck/slide fields.
- **New dependency**: something capable of rendering the canvas to an image server-side (e.g. a headless browser or an SVG/canvas-to-PNG library) for `slide-visual-inspection` — exact choice is a design.md decision, not fixed here.
- **No impact** on `harness-auth` or `tool-permission-gate` — login and the bash/write/edit approval gates are unaffected.
