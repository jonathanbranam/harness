## Why

Right now the only way to see how a deck actually looks is `DeckCanvas` sitting next to the chat panel and slide switcher inside the harness chrome. There's no way to view a deck the way an audience would — full screen, no editor UI, no scrollbars — or to rehearse advancing through slides with normal presenter keys. Presenting straight from the harness currently means either screen-sharing the cluttered editor or exporting elsewhere.

## What Changes

- Add a "Present" control to `DeckPage` that enters a full-screen preview mode for the active deck, hiding the header, `DeckSwitcher`, `SlideSwitcher`, and `ChatPanel`, and rendering only the current slide.
- Preview mode requests the browser Fullscreen API when available, falling back to a full-viewport overlay if the browser denies or doesn't support it.
- Support keyboard navigation while in preview mode: `ArrowRight`/`ArrowDown`/`Space`/`PageDown` advance to the next slide, `ArrowLeft`/`ArrowUp`/`PageUp` go to the previous slide, and `Escape` exits preview mode (and exits browser fullscreen if active) and returns to the normal editor layout.
- Preview mode is read-only: it does not send `selection`/`objectUpdate` events, and clicking/editing slide content is disabled while previewing.
- Exiting preview (via `Escape`, browser fullscreen-exit gesture, or losing fullscreen for any other reason) returns the editor to the slide that was active when preview was entered, unless the user navigated during preview, in which case it returns to whichever slide was last shown.

## Capabilities

### New Capabilities
- `deck-preview-mode`: Full-screen, chrome-free presentation view of the active deck with keyboard-driven slide navigation and an escape hatch back to the editor.

### Modified Capabilities
(none — existing capabilities are unaffected; preview mode is purely additive UI on top of the current deck editor)

## Impact

- `client-deck/src/pages/DeckPage.tsx`: add preview-mode state and the "Present" entry point.
- `client-deck/src/components/`: new `PresentationView` (or similar) component; `DeckCanvas` may be reused in a read-only render mode.
- No server-side or protocol changes — preview mode operates entirely on state already available to the connected client (`deckState`, `canvasRef`).
