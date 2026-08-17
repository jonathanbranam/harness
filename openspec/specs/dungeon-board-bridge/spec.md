# dungeon-board-bridge Specification

## Purpose

Gives dungeon-harness its own live game board — grid, terrain, unit
placements — plus a local, pure reimplementation of just enough of
track-web's current movement/attack model (range-limited pathing;
single/line/plus attack footprints with cardinal-direction targeting and
penetration) to preview a scenario's Given/When/Then steps on a rendered
board while the designer writes them.

## Requirements

### Requirement: Board initializes with a fixed grid and no units
A new board SHALL start as a 16-column by 8-row grid (matching track-web's
current bundled default board size) with every cell's fill color defaulted
to a fixed neutral default color, and no drawn objects. Grid cell
coordinates are 0-indexed integers `(col, row)`; point coordinates used by
shapes, lines, and labels are continuous `(x, y)` in the same units, where
cell `(col, row)` spans from `(col, row)` to `(col+1, row+1)` — so that
cell's center is at `(col+0.5, row+0.5)`.

#### Scenario: Fresh session has an empty board
- **WHEN** `dungeon_get_board_state` is called before any drawing tool has
  been called
- **THEN** the result reports a 16x8 grid, every cell's fill color as the
  default, and an empty object list

### Requirement: Board can be cleared to a fresh empty state
The `dungeon_clear_board` tool SHALL remove every drawn object (shape,
line, overlay, and label) and reset every cell's fill color to the
default, in one call, leaving the board equivalent to a fresh session's
initial state.

#### Scenario: Clearing a board with units and terrain
- **WHEN** `dungeon_clear_board` is called on a board with one or more
  drawn objects and one or more cells whose fill color is not the default
- **THEN** `dungeon_get_board_state` afterward reports an empty object
  list and every cell's fill color as the default

#### Scenario: Clearing an already-empty board
- **WHEN** `dungeon_clear_board` is called on a board with no drawn
  objects and every cell already at the default fill color
- **THEN** the call succeeds and the board remains empty

### Requirement: Read current board state
The `dungeon_get_board_state` tool SHALL return the board's dimensions,
every cell's fill color, and every drawn object (id, kind, geometry,
color, label if applicable, and style if applicable).

#### Scenario: State reflects placements and terrain since last read
- **WHEN** `dungeon_get_board_state` is called after one or more
  draw/move/remove/cell-fill calls
- **THEN** the result includes every object and cell-fill change made so
  far in the session

### Requirement: Board state broadcasts live to the browser
Every change to the board (an object drawn, moved, or removed, a cell's
fill color changed, or a full board clear) SHALL be pushed to the
connected browser session over the existing WebSocket connection, so the
client's board view reflects the current board without polling.

#### Scenario: Placing a unit updates the connected browser
- **WHEN** the agent calls any draw tool (`dungeon_draw_shape`,
  `dungeon_draw_line`, `dungeon_draw_overlay`, or `dungeon_draw_label`) and
  a browser is connected to that session
- **THEN** the browser receives an updated board state reflecting the new
  object, without requiring a page reload or explicit re-fetch

#### Scenario: Removing, moving, or clearing updates the connected browser
- **WHEN** the agent calls `dungeon_move_object`, `dungeon_remove_object`,
  `dungeon_set_cell_fill`, or `dungeon_clear_board` and a browser is
  connected to that session
- **THEN** the browser receives an updated board state reflecting the
  change, without requiring a page reload or explicit re-fetch

### Requirement: Board canvas renders cell fill and drawn objects
The board SHALL be rendered in the browser as a grid where every cell's
fill color is shown, and every drawn object is rendered according to its
kind: a shape as its circle/rectangle with its label (if any) at its
position; a line as a path in its style (solid or dashed) and color
through its points; an overlay as a semi-transparent color wash over its
covered cells, above those cells' fill color; a label as text at its
position.

#### Scenario: Shapes and lines render with their chosen style
- **WHEN** a shape object and a line object are present on the board
- **THEN** the board canvas draws the shape (with its label, if any) at
  its position in its given color, and draws the line through its points
  in its given color and style

#### Scenario: Overlays render as a transparent wash above cell fill
- **WHEN** an overlay object covers one or more cells that also have a
  non-default fill color
- **THEN** the board canvas shows the overlay's color as a semi-transparent
  wash on top of each covered cell's fill color, so the underlying fill
  remains visible beneath it

### Requirement: Cell fill color is settable per cell
The `dungeon_set_cell_fill` tool SHALL accept a cell coordinate and a
color, and SHALL set that cell's fill color to the given value. The
harness SHALL NOT interpret the color as terrain or attach any other
meaning to it — it is purely a background color the agent chooses, one
color per cell, latest call wins.

#### Scenario: Setting a cell's fill color
- **WHEN** `dungeon_set_cell_fill` is called with an in-bounds cell and a
  color
- **THEN** `dungeon_get_board_state` afterward reports that cell's fill
  color as the given value

#### Scenario: Setting fill color out of bounds is rejected
- **WHEN** `dungeon_set_cell_fill` is called with a column or row outside
  the board's current dimensions
- **THEN** the call returns an error identifying the out-of-bounds
  coordinate, and no cell's fill color changes

### Requirement: Shapes can be drawn as labeled circles or rectangles
The `dungeon_draw_shape` tool SHALL accept a shape kind (`"circle"` or
`"rectangle"`), a center position in point coordinates, a size (radius for
a circle; width and height for a rectangle), a color, and an optional
label, and SHALL add that shape to the board with a server-assigned
unique id returned to the caller. The harness SHALL NOT attach any game
meaning (unit type, faction, stats) to a shape — it is a caller-labeled
visual marker only.

#### Scenario: Drawing a labeled circle
- **WHEN** `dungeon_draw_shape` is called with kind `"circle"`, a
  position, a radius, a color, and label `"SR"`
- **THEN** a circle object with that position, radius, color, and label
  `"SR"` is added to the board, with a unique id returned

#### Scenario: Drawing a rectangle without a label
- **WHEN** `dungeon_draw_shape` is called with kind `"rectangle"`, a
  position, width, height, and a color, with no label
- **THEN** a rectangle object with that geometry and color is added to
  the board with no label

### Requirement: Lines and multi-point paths can be drawn
The `dungeon_draw_line` tool SHALL accept an ordered list of two or more
point coordinates, a color, and a style (`"solid"` or `"dashed"`), and
SHALL add a line object connecting those points in order to the board
with a server-assigned unique id returned to the caller. If fewer than
two points are given, the tool SHALL return an error rather than adding a
line.

#### Scenario: Drawing a two-point line
- **WHEN** `dungeon_draw_line` is called with two points, color
  `"green"`, and style `"dashed"`
- **THEN** a dashed green line object connecting those two points is
  added to the board, with a unique id returned

#### Scenario: Drawing a multi-point path
- **WHEN** `dungeon_draw_line` is called with three or more points
- **THEN** a single line object connecting all given points in order is
  added to the board

#### Scenario: Drawing a line with fewer than two points is rejected
- **WHEN** `dungeon_draw_line` is called with zero or one point
- **THEN** the call returns an error, and no line is added

### Requirement: Semi-transparent overlays can be drawn over cells
The `dungeon_draw_overlay` tool SHALL accept a list of one or more cell
coordinates and a color, and SHALL add a semi-transparent overlay object
covering exactly those cells to the board with a server-assigned unique
id returned to the caller, rendered above each covered cell's fill color.
If any given cell is out of bounds, the tool SHALL return an error
identifying the offending cell and SHALL NOT add the overlay.

#### Scenario: Drawing an overlay over multiple cells
- **WHEN** `dungeon_draw_overlay` is called with a list of cells and
  color `"red"`
- **THEN** a semi-transparent red overlay object covering exactly those
  cells is added to the board, with a unique id returned

#### Scenario: Drawing an overlay referencing an out-of-bounds cell is rejected
- **WHEN** `dungeon_draw_overlay` is called with a cell list containing a
  coordinate outside the board's current dimensions
- **THEN** the call returns an error identifying the out-of-bounds
  coordinate, and no overlay is added

### Requirement: Freestanding text labels can be drawn
The `dungeon_draw_label` tool SHALL accept a point position, text, and a
color, and SHALL add a standalone text label object at that position to
the board with a server-assigned unique id returned to the caller,
independent of any shape.

#### Scenario: Drawing a freestanding label
- **WHEN** `dungeon_draw_label` is called with a position, text `"Threat
  zone"`, and a color
- **THEN** a label object with that text, color, and position is added to
  the board, with a unique id returned

### Requirement: Any drawn object can be moved
The `dungeon_move_object` tool SHALL accept a drawn object's id and a new
geometry appropriate to that object's kind (a position for a shape or
label, an ordered point list for a line, a cell list for an overlay), and
SHALL update that object's geometry on the board accordingly, leaving its
color, label, and style unchanged. If no drawn object has the given id,
the tool SHALL return an error identifying the unknown id, and the board
SHALL be left unchanged.

#### Scenario: Moving a shape to a new position
- **WHEN** `dungeon_move_object` is called with a placed shape's id and a
  new position
- **THEN** that shape's position in `dungeon_get_board_state` becomes the
  new position, and its color and label are unchanged

#### Scenario: Moving an unknown object id is rejected
- **WHEN** `dungeon_move_object` is called with an id that does not match
  any currently drawn object
- **THEN** the call returns an error identifying the unknown id, and no
  object moves

### Requirement: Any drawn object can be removed
The `dungeon_remove_object` tool SHALL accept a drawn object's id,
regardless of kind (shape, line, overlay, or label), and SHALL remove
that object from the board. If no drawn object has the given id, the
tool SHALL return an error identifying the unknown id, and the board
SHALL be left unchanged.

#### Scenario: Removing a drawn object
- **WHEN** `dungeon_remove_object` is called with the id of a currently
  drawn object of any kind
- **THEN** that object no longer appears in `dungeon_get_board_state`'s
  object list

#### Scenario: Removing an unknown object id is rejected
- **WHEN** `dungeon_remove_object` is called with an id that does not
  match any currently drawn object
- **THEN** the call returns an error identifying the unknown id, and no
  object is removed
