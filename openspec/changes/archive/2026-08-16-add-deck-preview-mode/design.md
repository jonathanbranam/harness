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

**Navigation calls `selectSlide` on every keypress; `PresentationView` still tracks the shown slide locally.**
`DeckState.objects` (from `useDeckSocket`) only ever holds the *server's* currently active slide's objects — `DeckState.slides` is just `{id}[]`, and `EditorStore.getState()` populates `objects` from `activeSlide()` only (deck-harness-server/src/editor-state.ts). There is no client-side cache of every slide's content and, per this proposal's "no protocol changes" constraint, no new WS message to fetch one. So `DeckCanvas` can only ever render whichever slide the server considers active — meaning `PresentationView` must call `selectSlide(id)` on every ArrowRight/ArrowLeft/etc. navigation for the next/previous slide's content to actually appear, not just on exit.
`PresentationView` still keeps its own `previewSlideId` (initialized from the slide active when preview was entered, updated locally as navigation happens) so it can compute next/previous/clamping without waiting on a round trip, and so `onExit` can report the last-shown slide even if a `selectSlide` call is still in flight. In the steady state this is redundant with `deckState.activeSlideId` (they're kept in sync on every navigation), but it avoids a round-trip-shaped UI (e.g. briefly rendering a stale slide while waiting for `deck_state` to arrive) and gives `DeckPage`'s exit handler a value to compare against without relying on socket timing.
Alternative considered (original decision, superseded): keep navigation purely client-local and only call `selectSlide` once on exit — rejected once it became clear `DeckCanvas` has no way to render a non-active slide's objects without that call; the "no protocol changes" constraint means `selectSlide` (or an equivalent per-navigation round trip) isn't optional here.

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
