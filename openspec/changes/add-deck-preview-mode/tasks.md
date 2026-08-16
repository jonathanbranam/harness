## 1. DeckCanvas read-only mode

- [ ] 1.1 Add a `readOnly` prop to `DeckCanvas` that suppresses selection/edit interactions (no `onSelectionChange`/`onObjectUpdate` calls, no selection-highlight UI, no click-to-edit)
- [ ] 1.2 Verify normal (non-read-only) `DeckCanvas` usage in `DeckPage` is unaffected

## 2. PresentationView component

- [ ] 2.1 Create `client-deck/src/components/PresentationView.tsx` that renders `DeckCanvas` (in `readOnly` mode) for a given slide, filling the viewport with no harness chrome
- [ ] 2.2 Implement local slide-index/id state within `PresentationView`, initialized from the slide active when preview was entered
- [ ] 2.3 Add a `keydown` listener (scoped to preview mode, removed on unmount) handling ArrowRight/ArrowDown/Space/PageDown (next slide, clamped at last slide), ArrowLeft/ArrowUp/PageUp (previous slide, clamped at first slide), and Escape (exit)
- [ ] 2.4 On entering, call `element.requestFullscreen()`; on the promise rejecting or the API being unsupported, render as a `position: fixed` full-viewport overlay instead
- [ ] 2.5 Listen for `fullscreenchange` and treat a transition to non-fullscreen as an exit-preview signal
- [ ] 2.6 On exit (via Escape or `fullscreenchange`), call `document.exitFullscreen()` if currently fullscreen, and invoke an `onExit(lastShownSlideId)` callback

## 3. Wire preview mode into DeckPage

- [ ] 3.1 Add `isPreviewing` state to `DeckPage` and a "Present" button (disabled/absent when no deck is active) that sets it to true
- [ ] 3.2 When `isPreviewing` is true, render `PresentationView` instead of the header/`DeckSwitcher`/`SlideSwitcher`/canvas+chat grid
- [ ] 3.3 Pass `deckState.activeSlideId` (and the deck's ordered slide list) into `PresentationView` as the starting slide
- [ ] 3.4 On `PresentationView`'s `onExit(lastShownSlideId)`, set `isPreviewing` to false and, if `lastShownSlideId` differs from `deckState.activeSlideId`, call `selectSlide(lastShownSlideId)`

## 4. Manual verification

- [ ] 4.1 Enter preview mode, confirm all harness chrome is hidden and only the active slide is shown
- [ ] 4.2 Confirm fullscreen is requested where supported, and that the overlay fallback still hides chrome when fullscreen is denied/unsupported (simulate by rejecting `requestFullscreen`)
- [ ] 4.3 Step forward/backward through all slides with keyboard, confirming clamping at the first/last slide
- [ ] 4.4 Confirm clicking on slide content while previewing does not enter edit/selection state
- [ ] 4.5 Exit via Escape and confirm the editor returns to the last-previewed slide with full chrome restored
- [ ] 4.6 Exit via a browser-native fullscreen-exit gesture (where testable) and confirm preview mode also exits
