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
current bundled default board size) with every cell's terrain defaulted to
`"plains"` and no units placed.

#### Scenario: Fresh session has an empty board
- **WHEN** `dungeon_get_board_state` is called before any
  `dungeon_place_unit`/`dungeon_set_terrain` calls have been made
- **THEN** the result reports a 16x8 grid, every cell's terrain as
  `"plains"`, and an empty unit list

### Requirement: Terrain is settable per cell, for context only
The `dungeon_set_terrain` tool SHALL set a cell's terrain to one of
`"plains"`, `"forest"`, `"water"`, `"stone"` (track-web's current terrain
vocabulary). Terrain SHALL NOT affect movement or attack calculations —
`dungeon_preview_movement` and `dungeon_preview_attack` SHALL treat every
in-bounds, unoccupied cell identically regardless of its terrain, matching
track-web's current engine, which stores terrain per cell but does not
consume it as a movement or attack modifier.

#### Scenario: Setting terrain does not block movement
- **WHEN** a cell is set to `"water"` via `dungeon_set_terrain`, and that
  cell lies within an otherwise-reachable unit's movement range
- **THEN** `dungeon_preview_movement` still includes that cell as reachable

#### Scenario: Setting terrain out of bounds is rejected
- **WHEN** `dungeon_set_terrain` is called with a column or row outside the
  board's current dimensions
- **THEN** the call returns an error identifying the out-of-bounds
  coordinate, and no cell's terrain changes

### Requirement: Units are placed from a fixed archetype catalog
The `dungeon_place_unit` tool SHALL accept a unit archetype of `"melee"`,
`"rogue"`, `"ranger"`, `"magic-user"` (player-controlled) or
`"short-range"`, `"long-range"` (NPC-controlled), a faction of `"pc"` or
`"npc"`, and a target cell, and SHALL reject placement onto a cell that is
out of bounds or already occupied by another unit. Each archetype's
`maxHp`, `movement.range`, and `attack` (damage, targeting, propagation)
SHALL match track-web's current `unitDefs.ts` values for that archetype at
the time this capability was built (melee: maxHp 3, move 4, damage 2,
single-target range 1; rogue: maxHp 3, move 4, damage 1, single-target
range 1; ranger: maxHp 3, move 3, damage 1, line propagation range 2 to
board edge, stop-at-first penetration; magic-user: maxHp 3, move 3, damage
1, plus propagation at fixed range 2; short-range/long-range NPCs: maxHp 3,
move 3, damage 1, single-target resolution).

#### Scenario: Placing a known archetype
- **WHEN** `dungeon_place_unit` is called with archetype `"ranger"`,
  faction `"pc"`, and an in-bounds, unoccupied cell
- **THEN** a unit with ranger's stats is added to the board at that cell,
  with a server-assigned unique id returned to the caller

#### Scenario: Placing onto an occupied cell is rejected
- **WHEN** `dungeon_place_unit` targets a cell that already holds a unit
- **THEN** the call returns an error identifying the occupied cell, and no
  new unit is placed

#### Scenario: Placing an unknown archetype is rejected
- **WHEN** `dungeon_place_unit` is called with an archetype name not in the
  fixed catalog
- **THEN** the call returns an error listing the valid archetype names, and
  no unit is placed

### Requirement: Read current board state
The `dungeon_get_board_state` tool SHALL return the board's dimensions,
every cell's terrain, and every placed unit (id, archetype, faction,
position, and derived stats: maxHp, movement range, attack damage,
targeting, and propagation).

#### Scenario: State reflects placements and terrain since last read
- **WHEN** `dungeon_get_board_state` is called after one or more
  `dungeon_place_unit`/`dungeon_set_terrain` calls
- **THEN** the result includes every placement and terrain change made so
  far in the session

### Requirement: Movement preview computes a range-limited path
The `dungeon_preview_movement` tool SHALL accept a placed unit's id and a
destination cell, and SHALL return the shortest 4-directionally-connected
path from the unit's current cell to the destination if one exists whose
length does not exceed the unit's `movement.range`, treating every other
placed unit's occupied cell as impassable. If no such path exists (out of
range, or blocked), the tool SHALL return an error rather than a path, and
SHALL distinguish "unreachable within range" from "no unit with that id."

#### Scenario: Destination within range and unobstructed
- **WHEN** `dungeon_preview_movement` is called for a melee unit (move
  range 4) targeting a cell 3 steps away with no other units in between
- **THEN** the tool returns an ordered path of cells from the unit's
  current position to the destination, 3 steps long

#### Scenario: Destination beyond range
- **WHEN** the shortest unobstructed path to the destination is longer than
  the unit's `movement.range`
- **THEN** the tool returns an error indicating the destination is out of
  range, not a path

#### Scenario: Destination blocked by another unit
- **WHEN** every path within range to the destination is blocked by other
  units' occupied cells
- **THEN** the tool returns an error indicating the destination is
  unreachable, not a path

### Requirement: Attack preview computes footprint and penetration
The `dungeon_preview_attack` tool SHALL accept a placed unit's id and a
cardinal direction (`"up"`, `"down"`, `"left"`, `"right"`), and SHALL
return the candidate footprint (every board cell the unit's
`attack.propagation.shape` covers from that position and direction, per its
`targeting.minRange`/`maxRange`) together with which of those cells are
actually hit given current unit occupancy and the archetype's
`propagation.penetration`:
- `"single"`: footprint is exactly the one cell at `minRange` along the
  given direction.
- `"line"`: footprint is every cell from `minRange` to `maxRange` along the
  given direction, clipped at the board edge, ordered nearest to farthest.
- `"plus"`: footprint is the cell at `maxRange` along the given direction
  plus its four orthogonal neighbors, clipped at the board edge.
- `penetration: "none"`: every occupied footprint cell is hit.
- `penetration: "stop_at_first"`: only the nearest occupied footprint cell
  (in the line's near-to-far order) is hit; cells beyond it are returned as
  part of the footprint but not as hit.

#### Scenario: Melee single-target attack
- **WHEN** `dungeon_preview_attack` is called for a melee unit (single
  propagation, range 1) with a direction whose adjacent cell holds another
  unit
- **THEN** the footprint is that one adjacent cell, and it is reported as
  hit

#### Scenario: Ranger line attack stops at the first occupied cell
- **WHEN** `dungeon_preview_attack` is called for a ranger unit (line
  propagation, stop-at-first penetration) whose line of cells contains two
  occupied cells at different distances
- **THEN** the footprint includes every cell in the line up to the board
  edge, but only the nearer occupied cell is reported as hit

#### Scenario: Magic-user plus attack hits every occupied cell in its footprint
- **WHEN** `dungeon_preview_attack` is called for a magic-user unit (plus
  propagation, no penetration) whose plus-shaped footprint contains more
  than one occupied cell
- **THEN** every occupied cell within the footprint is reported as hit

#### Scenario: Attack direction with an empty footprint
- **WHEN** `dungeon_preview_attack` is called for a direction whose
  footprint contains no other units
- **THEN** the footprint cells are still returned, and the hit list is
  empty

### Requirement: Board state broadcasts live to the browser
Every change to the board (unit placement, terrain change) SHALL be pushed
to the connected browser session over the existing WebSocket connection,
so the client's board view reflects the current board without polling.

#### Scenario: Placing a unit updates the connected browser
- **WHEN** the agent calls `dungeon_place_unit` and a browser is connected
  to that session
- **THEN** the browser receives an updated board state reflecting the new
  unit, without requiring a page reload or explicit re-fetch

### Requirement: Board canvas renders terrain, units, and previews
The board SHALL be rendered in the browser as a grid where every cell's
terrain is visually distinguishable, every placed unit is shown at its cell
labeled by archetype and faction, and the most recent movement or attack
preview (if any) is overlaid on the grid — a movement preview as a
highlighted path from origin to destination, an attack preview as the
candidate footprint with hit cells visually distinguished from
not-hit cells.

#### Scenario: Movement preview renders a path
- **WHEN** `dungeon_preview_movement` succeeds
- **THEN** the returned path is drawn on the board canvas from the unit's
  origin cell to the destination cell

#### Scenario: Attack preview distinguishes hit from not-hit cells
- **WHEN** `dungeon_preview_attack` succeeds
- **THEN** the board canvas highlights every footprint cell, and visually
  distinguishes the cells reported as hit from footprint cells that are not
  hit
