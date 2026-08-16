## Why

`client-deck`'s slide canvas (`DeckCanvas.tsx`) renders the active slide as a fixed 960x540px `<div>` with no background and no border inside a plain scrollable dark pane. There is currently no visible boundary between "the slide" and the rest of the editing area — the user can't tell where the slide edge is at a glance, the slide doesn't grow or shrink to make good use of the available window space, and on larger windows it just sits in the corner while the rest of the pane goes empty.

## What Changes

- The slide canvas continues to render at its fixed logical size (960x540) so coordinates, object layout, and `slide_view`'s screenshot capture stay exactly as they are today.
- That fixed-size canvas is displayed scaled (visually, via CSS transform) to the largest size that fits the available editing area without overlapping the chat panel, and rescales live as the browser window is resized.
- The editing area around the scaled slide keeps a consistent visible gap on every side (the slide is never flush against the pane edges), rendered in a background color that visibly contrasts with the slide's own background.
- The slide itself gets a subtle but clearly visible border tracing its full extent, so the boundary between "slide" and "surrounding workspace" is unambiguous even when the slide's own background is transparent or close in color to the surrounding pane.
- Pointer interactions on the canvas (drag, resize, click-to-select) are adjusted to account for the visual scale factor, so on-screen mouse movement continues to map correctly to the underlying 960x540 coordinate space.

## Capabilities

### New Capabilities
- `deck-canvas-display`: How the deck editor visually presents the slide canvas — scale-to-fit sizing that tracks the browser window, the surrounding margin/gap, and the slide's boundary border.

### Modified Capabilities
(none — this introduces new presentation behavior rather than changing an existing capability's requirements)

## Impact

- `client-deck/src/components/DeckCanvas.tsx`: canvas sizing/scaling logic, wrapper markup for the margin and border, and pointer-event math (drag/resize) updated to divide screen-space deltas by the current scale factor.
- No server, protocol, or tool changes — this is purely `client-deck` presentation.
