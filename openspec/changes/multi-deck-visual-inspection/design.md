## Context

See `proposal.md` - Why for motivation. Current state: `editorStore` (`deck-harness-server/src/editor-state.ts`) is a single flat `{ objects, selection }` singleton, and `deck-harness-scaffold`'s design.md deliberately chose that as process-global, shared-across-tabs state — a decision this change keeps, just applied one level up (one *active* deck/slide, still process-global and shared across every connection, not per-session). See `openspec/specs/presentation-editing/spec.md` and `openspec/specs/deck-agent-session/spec.md` for the requirements this design implements.

## Goals / Non-Goals

**Goals:**
- Restructure deck state to decks -> slides -> objects without disturbing the existing edit/select/broadcast loop's shape more than necessary.
- Give pi a way to *see* a slide that's faithful enough to catch real layout bugs (text overflow, overlap) — not an approximation that could itself be wrong.

**Non-Goals:**
- Persisting decks/slides across restarts (still in-memory only, per `deck-harness-scaffold`'s existing design decision — unchanged here).
- Per-user or per-session deck isolation (still one shared set of decks for the single owner, consistent with the existing shared-canvas model).
- Rendering slides other than the currently active one — `slide-visual-inspection`'s tool only covers the active slide (see Open Questions).

## Decisions

### Nested in-memory model; object ids scoped per-slide, not globally
`editorStore` becomes `{ decks: Map<deckId, Deck>, activeDeckId }` where `Deck = { id, name, slides: Slide[], activeSlideId }` and `Slide = { id, objects: DeckObject[] }`. Object ids are unique only within their slide (see `presentation-editing`'s "Update objects" requirement — a valid id from a different slide behaves as unknown). Alternative considered: globally unique object ids across the whole deck — rejected because it buys nothing (objects are never referenced across slides) and would require either a global counter/UUID scheme or cross-slide uniqueness checks on every add, for no behavioral benefit.

### Deck/slide management is exposed as both pi tools and WebSocket messages
Mirrors the existing split for object edits (`presentation_update` for pi, canvas clicks for the user) and selection (`selection` WS message for the user; nothing pi-specific needed there). New pi tools (`deck_create`, `deck_list`, `deck_select`, `deck_delete`, `slide_add`, `slide_remove`, `slide_select`) and new WS message types (`select_deck`, `select_slide`, `create_deck`, `delete_deck`, `add_slide`, `remove_slide`) both call the same underlying `editorStore` functions, so there's exactly one implementation of each rule (e.g. "can't delete the last deck") regardless of which side triggers it.

### Visual inspection captures the real canvas in the browser, not a server-side render
`slide-visual-inspection`'s tool asks the *browser tab already driving the current turn* to render the active slide, rather than standing up any server-side renderer. The client uses `html-to-image` (serializes the `DeckCanvas` DOM subtree to SVG and lets the browser's own rendering engine rasterize it to a PNG data URL) — entirely in-page, no separate browser process. The resulting PNG travels back to the server over the existing WebSocket connection and becomes the tool's image content.

This works because a browser tab is *always* open and connected whenever pi can be prompted at all: prompts only reach `session.prompt()` through an authenticated, open WebSocket connection (see `deck-agent-session`'s "WebSocket requires authentication"), so there's no code path where pi is running without at least one live tab to ask. The request/response shape mirrors the existing permission-gate approval flow exactly: the server tracks a pending request keyed by an id, emits a `render_request` message to the connection that originated the current turn, and resolves the pending promise when that connection's `render_response` arrives — or resolves it as failed if the connection closes first (see `deck-agent-session`'s new "Server-requested browser rendering" requirement).

Alternatives considered:
- **Headless browser (Playwright/Chromium) driven from the server** — the original design; rejected per feedback that a ~300MB browser-automation dependency is disproportionate for one feature, especially for a tool meant to stay lightweight and iterate fast locally.
- **Server-side canvas/SVG library** reimplementing layout — rejected for the same reason as in the original design: reproducing CSS text-wrapping correctly is hard enough that a reimplementation risks being wrong in exactly the way this feature exists to catch. The `presentation-editing` spec's "visually matches the canvas" requirement is satisfied *by construction* only when it's the same DOM/CSS being rasterized, not a reimplementation.
- **Hand-rolled vanilla JS** (`XMLSerializer` + SVG `foreignObject` + `<canvas>`, no library) — the same underlying technique `html-to-image` uses under the hood, and viable with zero new dependencies; not chosen because `html-to-image` is small (~5KB) and already handles edge cases (web fonts, nested elements) a hand-rolled version would hit one at a time.

### Screenshot dimensions are fixed, not proportional to slide content
The canvas being captured is already a fixed size (960×540, from `DeckCanvas`), and `html-to-image` renders exactly that element at its natural size. This satisfies the "sized for model input" requirement by construction — output size never grows with object count, only fidelity (more objects rendered into the same fixed frame) does.

## Risks / Trade-offs

- **[Risk]** The render round trip depends on the originating browser tab staying responsive (e.g. a janky main thread could delay it). → **Mitigation**: apply a timeout on the pending render request (mirroring how a hung approval request would similarly need bounding); on timeout the tool call returns an error result pi can react to.
- **[Risk]** `html-to-image` can't perfectly capture every kind of content (e.g. `<canvas>`/WebGL painted inside the captured subtree, some cross-origin resources). → **Mitigation**: `DeckCanvas` only contains plain DOM/CSS (divs, text, background colors) today, well within its supported surface; revisit if the canvas ever grows canvas/WebGL content.
- **[Risk]** With multiple tabs open, only one should render for a given tool call. → **Mitigation**: only the connection that originated the current turn is asked, the same scoping the approval flow already uses, so behavior stays deterministic regardless of how many tabs are open.
- **[Risk]** The in-memory model change is a breaking shape change to `editorStore`'s internals and the WebSocket message shapes. → **Mitigation**: there's no persisted state to migrate (everything resets on restart already, per `deck-harness-scaffold`'s design), and no other harness or external consumer depends on the current shape.

## Migration Plan

No data migration needed — `editorStore` state has never persisted across restarts. Steps:
1. Implement the new store shape and the deck/slide tools/messages.
2. Add `html-to-image` as a `client-deck` dependency (a normal `npm install`, no OS-level binary or browser-install step involved).
3. Restart the server — it starts with a single default deck/slide (today's seed objects), same as today's behavior, just now addressable as deck 1 / slide 1.

Rollback: revert the commit and restart; no persisted state to reconcile.

## Open Questions

- Should `slide-visual-inspection` support rendering a specific (non-active) deck/slide, instead of always the active one? Not required by this change's specs; broadening it later doesn't change what's built now.
- Should deck/slide deletion have an undo or confirmation step in the UI? The spec only requires the deletion behavior (rejecting deletion of the last deck/slide, re-activating a neighbor); a confirmation UX is a client-side detail that doesn't change the wire contract.
