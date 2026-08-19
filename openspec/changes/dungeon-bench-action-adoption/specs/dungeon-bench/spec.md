**App**: dungeon-harness

## ADDED Requirements

### Requirement: The engine decides which actions a unit may take

The bench SHALL obtain the list of actions available to a selected unit from the engine,
and SHALL present every action the engine reports — including ones that are not currently
available. An unavailable action SHALL be shown disabled, carrying the engine's reason,
rather than hidden. The bench SHALL NOT decide an action's availability itself.

#### Scenario: Both actions are offered to a unit that can act

- **WHEN** a unit that has neither moved nor attacked this turn is selected
- **THEN** a move action and an attack action are both offered, each with the tiles the
  engine reports as its legal targets

#### Scenario: A spent unit shows why it cannot act

- **WHEN** a unit that has already attacked this turn is selected
- **THEN** both actions are shown unavailable, each carrying the engine's reason

#### Scenario: Losing movement does not lose the attack

- **WHEN** a unit has spent its full movement but has not attacked
- **THEN** the move action is unavailable with the engine's reason and the attack action
  remains available

### Requirement: Attacks are aimed at a tile, never a direction

The designer and the agent SHALL aim an attack by choosing a **target tile** from the set
the engine offers. The bench SHALL NOT expose a direction as a way to aim, so an attack
whose shape covers tiles off the unit's row and column can be aimed at those tiles.

#### Scenario: An area attack offers its off-axis tiles

- **WHEN** a unit whose attack covers a tile and its neighbours at a fixed range is selected
  and the attack action is chosen
- **THEN** the tiles beside each covered centre are offered as targets

#### Scenario: Choosing an off-axis tile resolves the attack covering it

- **WHEN** an attack is committed against an offered tile that lies off the unit's row and
  column
- **THEN** the attack resolves over every tile it covers from the unit's position,
  including that tile

#### Scenario: A tile the engine does not offer is refused

- **WHEN** an attack is committed against a tile that is not among the offered targets,
  including one aligned with the unit but beyond its reach
- **THEN** the action does not happen, nothing is damaged, and the reason is reported to
  whoever asked

### Requirement: A candidate action can be previewed before it is committed

The bench SHALL be able to report, for a unit and a candidate target tile, the tiles the
action would resolve against, the movement it would consume, and what it would damage —
without changing the board. It SHALL report explicitly when an action would cover tiles but
affect nothing.

#### Scenario: Previewing an attack reports what it would hit

- **WHEN** an attack is previewed against a tile occupied by an enemy
- **THEN** the covered tiles and the damage that enemy would take are reported, and the
  board is unchanged

#### Scenario: An attack that would hit nothing is still offered

- **WHEN** an attack is previewed against a tile where it would affect no unit and no
  structure
- **THEN** it is reported as hitting nothing, and the attack remains available to commit

## MODIFIED Requirements

### Requirement: The game engine referees every rule

The bench SHALL obtain every legality decision, derived overlay, and outcome from the
shared game engine. It SHALL NOT implement, approximate, or cache any rule of its own,
and no tool or client action SHALL be able to assert a rule outcome directly.

This includes what a unit may attack: the bench SHALL NOT reconstruct an attack's reach
from unit-definition fields, and SHALL take both the offered targets and the threat overlay
from the engine, so blocking is accounted for rather than ignored.

#### Scenario: Reach comes from the engine

- **WHEN** a unit is selected
- **THEN** the tiles shown as reachable are exactly those the engine reports for that
  unit's remaining movement on the current board

#### Scenario: Derived views cannot go stale

- **WHEN** the board changes — a unit is placed, moved, removed, or a definition is
  changed
- **THEN** reachable tiles and attack footprints are recomputed from the engine on the
  next read rather than reused from before the change

#### Scenario: An illegal action is refused with a reason

- **WHEN** a move is requested to a tile the engine does not report as reachable
- **THEN** the action does not happen, and the reason is reported to whoever asked

#### Scenario: Threat stops at a blocker

- **WHEN** a unit stands between a ranged unit and a tile further along the same line
- **THEN** the tile behind the blocker is not reported as threatened

### Requirement: Both sides are played by hand

The bench SHALL let the designer take turns for **either** side — moving and attacking
with enemy units exactly as with player units — subject to the same engine rules,
including that attacking is committal for the rest of the round. An enemy attack committed
by hand SHALL spend that unit for the turn, as a player unit's attack does.

#### Scenario: An enemy unit is driven by hand

- **WHEN** an enemy unit is selected and moved to a tile within its reach
- **THEN** it moves there and its remaining movement is reduced accordingly

#### Scenario: Attacking ends the unit's turn

- **WHEN** a unit attacks
- **THEN** it can neither move nor attack again until the round ends

#### Scenario: A hand-driven enemy cannot attack twice

- **WHEN** an enemy unit is made to attack by hand and is then asked to attack again in the
  same round
- **THEN** the second attack is refused with a reason

#### Scenario: A round ends and refreshes both sides

- **WHEN** the round is ended
- **THEN** every unit's movement is restored and no unit is marked as having attacked

### Requirement: Unit numbers can be changed for the session only

The designer or the agent SHALL be able to change a unit type's numbers — maximum HP,
movement range, attack damage, and targeting range — for the current session, with every
derived view following the change immediately. Nothing SHALL be written to disk.

Changing a maximum HP SHALL reconcile units already on the board through the engine's own
rule, so a wounded unit shifts with the change and a lowered maximum never removes a unit.

#### Scenario: A movement change is visible immediately

- **WHEN** a unit type's movement range is increased
- **THEN** a selected unit of that type immediately shows the larger set of reachable
  tiles

#### Scenario: Tweaks are discarded

- **WHEN** the shipped values are restored
- **THEN** every unit type reads back the values the game ships

#### Scenario: One session's tweaks do not affect another

- **WHEN** one session changes a unit type's numbers
- **THEN** another session's bench continues to report the values it was using

#### Scenario: Raising a maximum heals units in play

- **WHEN** a unit type's maximum HP is raised
- **THEN** units of that type already on the board gain the same amount of current HP

#### Scenario: Lowering a maximum never removes a unit

- **WHEN** a unit type's maximum HP is lowered past a wounded unit's current HP
- **THEN** that unit remains on the board with at least 1 HP

#### Scenario: Nothing is persisted

- **WHEN** the server restarts
- **THEN** every unit type is back to its shipped numbers

### Requirement: Agent tools wrap engine calls and nothing else

Every agent-facing bench tool SHALL be a thin wrapper over a bench operation that is itself
backed by the engine. No tool SHALL accept an assertion about a rule outcome, and no tool
SHALL take a parameter that expresses aiming as a direction.

#### Scenario: Asking what a unit can do

- **WHEN** the agent asks for a unit's options
- **THEN** it receives that unit's engine-derived actions — each with its availability, its
  reason when unavailable, and its legal target tiles — along with remaining movement and
  whether it has attacked

#### Scenario: No drawing surface exists

- **WHEN** the agent wants to indicate something on the board
- **THEN** it has no tool that draws, and must express it through units, terrain, or words

#### Scenario: A tool aims by tile

- **WHEN** the agent commits an attack
- **THEN** it names a target tile, and a tile the engine does not offer is refused with a
  reason

#### Scenario: The agent and the designer share one answer

- **WHEN** the agent and the designer each ask what a unit may do
- **THEN** both receive the same list, derived from the same engine call against the same
  board
