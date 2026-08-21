## MODIFIED Requirements

### Requirement: The designer can set up any board state

The bench SHALL let a designer produce a board and populate it freely: generate a board
from a preset, or supply an exact layout; place any unit type on any unoccupied,
unobstructed tile regardless of the game's spawn zones; set a unit's current HP;
reposition a unit without spending its turn; clear all units; and place, move, or remove
a structure.

Setting up a board is **authoring a starting position**, and it SHALL be done in the
engine's placement phase and nowhere else. The bench SHALL refuse every setup operation
once the scenario has started, reporting the engine's reason. A designer who wants to
edit a running scenario returns to setup by stepping back through the timeline to a frame
before the scenario started; the bench SHALL NOT offer a transition back to placement.

Every rule involved SHALL come from the engine — that two units cannot share a tile, that
a structure blocks a tile, what HP a freshly placed unit starts at, what a unit is called,
and what a structure of a given kind is worth. The bench SHALL NOT decide, approximate, or
duplicate any of them, and SHALL NOT construct a board state of its own.

Changing a unit archetype's numbers for the session is **not** a setup operation — those
values are not board state — and SHALL remain available in any phase.

#### Scenario: A generated board is reproducible

- **WHEN** a board is generated twice with the same size, preset, and seed
- **THEN** both boards are identical

#### Scenario: Units are placed outside spawn zones

- **WHEN** a unit is placed on an empty tile that is not in any spawn zone
- **THEN** the unit is placed there

#### Scenario: An occupied or off-board tile is refused

- **WHEN** a unit is placed on a tile that already holds a unit or a structure, or lies
  outside the board
- **THEN** the placement is refused and reported

#### Scenario: A generated board gives the enemy AI a goal

- **WHEN** a board is generated without specifying otherwise
- **THEN** it contains at least one structure the enemy AI can advance toward, so that
  running the AI produces movement rather than silence

#### Scenario: Setup is refused once the scenario has started

- **WHEN** a unit is placed, removed, repositioned, given different HP, or a structure is
  edited, after the scenario has been started
- **THEN** the operation is refused with the engine's reason, and the board is unchanged

#### Scenario: Stepping back returns the board to setup

- **WHEN** the timeline is stepped back to a frame from before the scenario started
- **THEN** the round is in the placement phase again and setup operations are accepted

#### Scenario: A structure is placed and moved

- **WHEN** a structure is placed on an empty tile during setup and later moved to another
  empty tile
- **THEN** the destination holds that structure with its kind and current HP, the origin
  holds none, and reach and threat account for it on the next read

#### Scenario: Unit numbers are still editable mid-round

- **WHEN** an archetype's damage or movement is changed for the session while the round is
  in the player phase
- **THEN** the change is accepted and takes effect, because a definition is not board state

## ADDED Requirements

### Requirement: A scenario is set up, then started

A bench scenario SHALL begin in the engine's placement phase, and the designer SHALL start
it explicitly. Starting SHALL be performed by the engine, by the same operation the shipped
game uses, so that an authored scenario and a loaded one enter the round identically.

The bench SHALL show which of the two the designer is in — setting up, or playing — from
the round's phase rather than from a mode the client keeps for itself. Starting the
scenario SHALL be a step on the timeline like any other, so it can be stepped back.

#### Scenario: A new board opens in setup

- **WHEN** the bench starts, or a new board is generated
- **THEN** the round is in the placement phase, and the designer is offered setup
  affordances rather than play affordances

#### Scenario: Starting the scenario begins the round

- **WHEN** the designer starts the scenario
- **THEN** the round moves to enemy movement, the bench offers play affordances, and the
  transition is recorded on the timeline

#### Scenario: Starting is the engine's transition, not the bench's

- **WHEN** the scenario is started while the round is not in placement
- **THEN** it is refused with the engine's reason, and the bench does not set the phase
  itself under any circumstances
