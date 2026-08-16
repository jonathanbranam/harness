## Context

`DeckPage` (`client-deck/src/pages/DeckPage.tsx`) currently renders a fixed layout: header, `DeckSwitcher`, `SlideSwitcher`, and a grid of `DeckCanvas` + `ChatPanel`, all driven by `useDeckSocket()`'s `deckState` (decks, slides, activeDeckId, activeSlideId) and a `canvasRef`. `DeckCanvas` is the only component that renders actual slide content; it currently also wires up selection/edit interactions via `onSelectionChange`/`onObjectUpdate`. See proposal.md for why a chrome-free view is needed.

## Goals / Non-Goals

**Goals:**
- Preview mode is a client-only UI mode — no new server/WebSocket messages.
- Reuse `DeckCanvas`'s slide rendering rather than building a second renderer.
- Keep preview state (in vs. out, which slide) local to `DeckPage`, not pushed into `useDeckSocket`'s shared state, since navigation during preview is local rehearsal and shouldn't reorder collaborative editor state until the user returns.

**Non-Goals:**
- Speaker notes, timers, or presenter-view (dual-screen) — out of scope for this change.
- Remote/synced presentation control (e.g. a second viewer following along) — out of scope.
- Printing/exporting the deck — unrelated to live preview.

## Decisions

**Local `previewSlideId` state, reconciled with `deckState.activeSlideId` on exit.**
Preview mode tracks its own "currently shown slide" locally in `DeckPage` rather than calling `selectSlide` (which round-trips through the socket) on every keypress. On exit, if the previewed slide differs from `deckState.activeSlideId`, call `selectSlide(previewSlideId)` once. This avoids flooding the socket with a message per arrow-key press and matches the proposal's "return to last-shown slide" behavior with a single, simple state variable.
Alternative considered: call `selectSlide` on every navigation so `activeSlideId` always tracks preview — rejected because it adds socket traffic per keypress for no visible benefit (nothing else needs to observe preview navigation live) and makes accidental interruption mid-preview (e.g. a disconnect) leave `activeSlideId` in a slightly different place than intended.

**New `PresentationView` component, `DeckCanvas` reused in a `readOnly` mode.**
Add a `readOnly` prop to `DeckCanvas` (or a thin wrapper) that suppresses the selection/edit event handlers and any selection-highlight UI, and a new `PresentationView` component that owns fullscreen entry/exit, the keydown listener, and slide-index state, rendering `DeckCanvas` in `readOnly` mode for the current slide.
Alternative considered: a fully separate slide-rendering component — rejected as duplicating slide layout/rendering logic that `DeckCanvas` already has, risking visual drift between edit and preview rendering.

**Fullscreen via the standard Fullscreen API on a container element, with an overlay fallback.**
`PresentationView` calls `element.requestFullscreen()` on its root container when entering preview, and listens for the `fullscreenchange` event to detect both `Escape`-driven and browser-native exits (e.g. the browser's own fullscreen-exit button), treating any `fullscreenchange` to a non-fullscreen state as "exit preview." If `requestFullscreen` is unavailable or its promise rejects, `PresentationView` still renders as a `position: fixed` full-viewport overlay above the rest of `DeckPage`, so preview mode is visually equivalent even without OS-level fullscreen.
Alternative considered: gate preview mode entirely on Fullscreen API support — rejected because the proposal explicitly calls for a fallback, and Fullscreen API support/permissions vary by embedding context (e.g. iframes without `allowfullscreen`).

**`Escape` handled by the app's own keydown listener, not solely relied upon via `fullscreenchange`.**
Because the overlay fallback isn't real browser fullscreen, there's no native fullscreen-exit gesture to catch in that path — `PresentationView` must listen for `keydown` itself and treat `Escape` as "exit preview" (which also calls `document.exitFullscreen()` if currently fullscreen). The `fullscreenchange` listener remains as a second exit path to catch browser-native fullscreen exits (e.g. clicking a browser chrome "exit fullscreen" affordance) that don't go through the app's keydown handler.

## Risks / Trade-offs

- **[Risk]** Fullscreen permission prompts or restrictions differ across browsers (Safari's user-gesture requirements, embedded/iframe contexts) → **Mitigation**: the overlay fallback ensures preview mode still works visually even when `requestFullscreen()` rejects; the "Present" control is always a direct click/keypress so it satisfies user-gesture requirements where they apply.
- **[Risk]** Keydown listener in preview mode could conflict with browser/OS shortcuts that also use arrow keys or Escape → **Mitigation**: scope the listener to only the keys in the spec, call `preventDefault()` on handled keys, and remove the listener immediately on exit.
- **[Risk]** Reusing `DeckCanvas` in read-only mode could regress edit-mode behavior if the `readOnly` prop threading is done carelessly → **Mitigation**: keep the prop narrowly scoped (disable the selection/edit handlers only), and manually verify edit mode is unaffected after the change.
