## 1. DeckCanvas read-only mode

- [x] 1.1 Add a `readOnly` prop to `DeckCanvas` that suppresses selection/edit interactions (no `onSelectionChange`/`onObjectUpdate` calls, no selection-highlight UI, no click-to-edit)
- [x] 1.2 Verify normal (non-read-only) `DeckCanvas` usage in `DeckPage` is unaffected

## 2. PresentationView component

- [x] 2.1 Create `client-deck/src/components/PresentationView.tsx` that renders `DeckCanvas` (in `readOnly` mode) for a given slide, filling the viewport with no harness chrome
- [x] 2.2 Implement local slide-index/id state within `PresentationView`, initialized from the slide active when preview was entered
- [x] 2.3 Add a `keydown` listener (scoped to preview mode, removed on unmount) handling ArrowRight/ArrowDown/Space/PageDown (next slide, clamped at last slide), ArrowLeft/ArrowUp/PageUp (previous slide, clamped at first slide), and Escape (exit); next/previous slide navigation must call `selectSlide` (passed in as a prop) so the server's active slide — and therefore `DeckCanvas`'s rendered objects — actually changes, since `deckState.objects` only ever reflects the server's one active slide (see design.md)
- [x] 2.4 On entering, call `element.requestFullscreen()`; on the promise rejecting or the API being unsupported, render as a `position: fixed` full-viewport overlay instead
- [x] 2.5 Listen for `fullscreenchange` and treat a transition to non-fullscreen as an exit-preview signal
- [x] 2.6 On exit (via Escape or `fullscreenchange`), call `document.exitFullscreen()` if currently fullscreen, and invoke an `onExit(lastShownSlideId)` callback

## 3. Wire preview mode into DeckPage

- [x] 3.1 Add `isPreviewing` state to `DeckPage` and a "Present" button (disabled/absent when no deck is active) that sets it to true
- [x] 3.2 When `isPreviewing` is true, render `PresentationView` instead of the header/`DeckSwitcher`/`SlideSwitcher`/canvas+chat grid
- [x] 3.3 Pass `deckState.activeSlideId`, the deck's ordered slide list, and `selectSlide` into `PresentationView` as the starting slide / navigation callback
- [x] 3.4 On `PresentationView`'s `onExit(lastShownSlideId)`, set `isPreviewing` to false; since navigation already calls `selectSlide` per-keypress, `deckState.activeSlideId` should already match `lastShownSlideId`, but call `selectSlide(lastShownSlideId)` anyway if it doesn't (safety net for a navigation whose `selectSlide` call was still in flight at exit)

## 4. Manual verification

- [x] 4.1 Enter preview mode, confirm all harness chrome is hidden and only the active slide is shown
- [x] 4.2 Confirm fullscreen is requested where supported, and that the overlay fallback still hides chrome when fullscreen is denied/unsupported (simulate by rejecting `requestFullscreen`)
- [x] 4.3 Step forward/backward through all slides with keyboard, confirming clamping at the first/last slide
- [x] 4.4 Confirm clicking on slide content while previewing does not enter edit/selection state
- [x] 4.5 Exit via Escape and confirm the editor returns to the last-previewed slide with full chrome restored
- [x] 4.6 Exit via a browser-native fullscreen-exit gesture (where testable) and confirm preview mode also exits
