## ADDED Requirements

### Requirement: Units can be removed from the board
The `dungeon_remove_unit` tool SHALL accept a placed unit's id and remove
that unit from the board. If no placed unit has the given id, the tool
SHALL return an error identifying the unknown id, and the board SHALL be
left unchanged.

#### Scenario: Removing a placed unit
- **WHEN** `dungeon_remove_unit` is called with the id of a currently placed
  unit
- **THEN** that unit no longer appears in `dungeon_get_board_state`'s unit
  list, and its cell becomes unoccupied

#### Scenario: Removing an unknown unit id is rejected
- **WHEN** `dungeon_remove_unit` is called with an id that does not match
  any currently placed unit
- **THEN** the call returns an error identifying the unknown id, and no
  unit is removed

### Requirement: Movement can be committed to reposition a unit
The `dungeon_move_unit` tool SHALL accept a placed unit's id and a
destination cell, apply the same range-limited, occupancy-aware pathing
`dungeon_preview_movement` uses to validate the move, and on success SHALL
update that unit's position on the board to the destination cell. On
failure it SHALL return an error under the same conditions
`dungeon_preview_movement` does ("no unit with that id", "out of range", or
"blocked by other units"), distinguishing between them, and SHALL leave the
unit's position unchanged.

#### Scenario: Committing a valid move updates the unit's position
- **WHEN** `dungeon_move_unit` is called for a unit and a destination cell
  that `dungeon_preview_movement` would report as reachable within range
- **THEN** the unit's position in `dungeon_get_board_state` becomes the
  destination cell, and its former cell becomes unoccupied

#### Scenario: Moving beyond range is rejected without moving the unit
- **WHEN** `dungeon_move_unit` targets a destination farther than the
  unit's `movement.range`
- **THEN** the call returns an error indicating the destination is out of
  range, and the unit's position does not change

#### Scenario: Moving to a blocked destination is rejected without moving the unit
- **WHEN** every path within range to the destination is blocked by other
  units' occupied cells
- **THEN** the call returns an error indicating the destination is
  unreachable, and the unit's position does not change

#### Scenario: Moving an unknown unit id is rejected
- **WHEN** `dungeon_move_unit` is called with an id that does not match any
  currently placed unit
- **THEN** the call returns an error identifying the unknown id, and no
  unit moves

### Requirement: Board can be cleared to a fresh empty state
The `dungeon_clear_board` tool SHALL remove every placed unit and reset
every cell's terrain to `"plains"`, in one call, leaving the board
equivalent to a fresh session's initial state.

#### Scenario: Clearing a board with units and terrain
- **WHEN** `dungeon_clear_board` is called on a board with one or more
  placed units and one or more cells whose terrain is not `"plains"`
- **THEN** `dungeon_get_board_state` afterward reports an empty unit list
  and every cell's terrain as `"plains"`

#### Scenario: Clearing an already-empty board
- **WHEN** `dungeon_clear_board` is called on a board with no placed units
  and every cell already `"plains"`
- **THEN** the call succeeds and the board remains empty

## MODIFIED Requirements

### Requirement: Board state broadcasts live to the browser
Every change to the board (unit placement, unit removal, unit movement,
terrain change, or a full board clear) SHALL be pushed to the connected
browser session over the existing WebSocket connection, so the client's
board view reflects the current board without polling.

#### Scenario: Placing a unit updates the connected browser
- **WHEN** the agent calls `dungeon_place_unit` and a browser is connected
  to that session
- **THEN** the browser receives an updated board state reflecting the new
  unit, without requiring a page reload or explicit re-fetch

#### Scenario: Removing, moving, or clearing updates the connected browser
- **WHEN** the agent calls `dungeon_remove_unit`, `dungeon_move_unit`, or
  `dungeon_clear_board` and a browser is connected to that session
- **THEN** the browser receives an updated board state reflecting the
  removal, new position, or cleared board, without requiring a page reload
  or explicit re-fetch
