# dungeon-board-visual-inspection Specification

## Purpose

Let pi see a rendered image of the live game board, so it can visually check drawn shapes, lines, overlays, labels, and cell fills for layout problems — overlapping objects, mispositioned drawings, wrong colors — that aren't obvious from numeric board state alone.

## Requirements

### Requirement: Render the board to an image
The `dungeon_board_view` tool SHALL render the current board to an image and return it as image content in the tool result, reflecting the board's grid, cell fill colors, and drawn objects (shapes, lines, overlays, labels) as of the moment the tool is called.

#### Scenario: View reflects the latest draw calls
- **WHEN** pi calls `dungeon_board_view` after drawing or moving objects on the board
- **THEN** the returned image reflects those changes, not a stale render from before they were made

### Requirement: Rendered image visually matches the board canvas
The rendered image SHALL visually match what the browser board canvas displays — the same grid, cell fill colors, object positions, and object appearance — so pi's visual read of the board corresponds to what the user actually sees.

#### Scenario: Overlapping objects are visible in the render
- **WHEN** two drawn objects overlap on the browser board canvas
- **THEN** the rendered image also shows that overlap, rather than omitting or silently reordering either object

### Requirement: Rendered image is sized for model input
The rendered image SHALL be encoded in a widely-supported raster format and sized to stay within typical model image-input limits, regardless of how many objects are drawn on the board.

#### Scenario: Board with many drawn objects
- **WHEN** the board contains a large number of drawn objects
- **THEN** the rendered image is still a single, reasonably sized image rather than growing unbounded with object count

### Requirement: Render failure is reported to pi as a tool error
The `dungeon_board_view` tool SHALL return an error tool result, rather than an image, when the board cannot be rendered (e.g. no browser connection is available to perform the capture).

#### Scenario: No browser connection is available
- **WHEN** pi calls `dungeon_board_view` while no browser tab is connected to the session
- **THEN** the tool result is an error explaining that the board could not be rendered, and no image content is returned
