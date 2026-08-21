# dungeon-bench Specification

## Purpose
A single-board design bench for Dungeon Tactics: the designer sets up a situation, plays
it out, and changes unit numbers to see what happens — with the real game engine deciding
every rule, so what the bench shows is what the game does. The bench and the game play by
the same rules; a departure is added back only one at a time, specified, argued on its own,
and named.

## Requirements

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

### Requirement: The designer can set up any board state

The bench SHALL let a designer produce a board and populate it freely: generate a board
from a preset, or supply an exact layout; place any unit type on any unoccupied,
unobstructed tile regardless of the game's spawn zones; set a unit's current HP;
reposition a unit without spending its turn; and clear all units.

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

### Requirement: The game's own AI can take the enemy turn

The bench SHALL be able to hand the enemy side to the game's AI, so the designer
can compare it with driving the enemy by hand. The enemy turn SHALL take place in
two steps with the designer free to act between them, matching the round the
shipped game plays:

1. **Planning** — every enemy's move resolves, and its intended attack is locked
   as a telegraph without landing.
2. **Resolution** — the locked telegraphs play out, in the order they were
   planned.

The bench SHALL sequence both steps **through the engine's round** rather than
ordering them itself, and SHALL NOT resolve enemy moves and enemy attacks as a
single indivisible step.

#### Scenario: The AI takes its turn

- **WHEN** the enemy turn is planned and its telegraphs are then resolved, with
  enemies and a structure on the board
- **THEN** enemy units act as the game would have them act, and what they did is
  reported

#### Scenario: The AI plans its turn

- **WHEN** the enemy turn is planned with enemies and a structure on the board
- **THEN** enemy units move as the game would have them move, their intended
  attacks are reported as telegraphs, and no unit or structure has taken damage
  from those attacks

#### Scenario: The telegraphs resolve

- **WHEN** the designer resolves the telegraphs after an enemy turn was planned
- **THEN** each locked attack lands on the tile it was aimed at, in the order it
  was planned, and what it did is reported

#### Scenario: The designer acts inside the window

- **WHEN** an enemy turn has been planned and the designer moves a PC out of a
  telegraphed tile before resolving
- **THEN** the telegraph still resolves against the tile it was locked onto, and
  the PC that left is unharmed

#### Scenario: Resolving with nothing planned

- **WHEN** the designer resolves telegraphs with no enemy turn planned
- **THEN** the bench reports that there is nothing to resolve and changes nothing

#### Scenario: Planning twice without resolving

- **WHEN** the designer plans an enemy turn while telegraphs are still pending
- **THEN** the bench reports that the pending telegraphs must resolve first and
  changes nothing

#### Scenario: An out-of-turn step is refused by the engine

- **WHEN** the designer attempts a step the engine's round does not allow next
- **THEN** the bench reports the engine's own refusal without rewording it, and
  changes nothing

#### Scenario: No enemies on the board

- **WHEN** an enemy turn is planned with no enemy units on the board
- **THEN** the enemy phase completes with nothing to plan and the round moves on
  to the player, exactly as it would once every enemy had been planned

### Requirement: Any action can be stepped back

The bench SHALL let the designer step back through prior actions one at a time —
including attacks, placements, and definition changes, not only movement — restoring the
exact prior state.

#### Scenario: An attack is reversed

- **WHEN** an attack has damaged a unit and the designer steps back
- **THEN** the damaged unit's HP is restored and the attacker can act again

#### Scenario: Nothing to step back to

- **WHEN** the designer steps back with no prior action
- **THEN** the bench reports that there is nothing to step back to and changes nothing

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

### Requirement: The designer and the agent share one bench

The bench state SHALL be authoritative on the server, and the designer's interactions and
the agent's tool calls SHALL act on that same state, with changes pushed to the browser as
they happen.

#### Scenario: An agent action appears in the browser

- **WHEN** the agent places or selects a unit
- **THEN** the designer's view updates to show it, including any derived overlays

#### Scenario: The browser reconnects

- **WHEN** the browser reconnects to an existing session
- **THEN** it receives the current bench state without waiting for the next change

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

### Requirement: Positions can be saved and returned to

The bench SHALL let a designer save the current board under a name — including
units wherever they stand mid-turn and any session definition tweaks in force —
list what has been saved, jump back to any of them, and delete one. Saved
positions SHALL survive a restart and SHALL NOT be writable through the agent's
file tools.

#### Scenario: A mid-play position is restored exactly

- **WHEN** a board is saved after a unit has spent part of its movement, and later
  reloaded
- **THEN** the board, every unit's position and HP, the spent movement, and the
  definition values in force at save time are all restored

#### Scenario: Saving under an existing name replaces it

- **WHEN** a position is saved under a name that already exists
- **THEN** the earlier position under that name is replaced, and only one entry
  with that name is listed

#### Scenario: An unreadable saved file does not break the list

- **WHEN** a file in the saved-position store cannot be read as a position
- **THEN** the remaining positions are still listed

### Requirement: Reach and threat are shown for every tile

The bench SHALL report, for each side and every tile on the board, how many units
can move onto it and how many can attack it, and SHALL make both available to the
designer as board overlays and to the agent in a readable form. Threat SHALL
account for a unit moving before it attacks, and SHALL exclude a unit that can no
longer attack this turn.

#### Scenario: Threat includes moving first

- **WHEN** a unit could move several tiles and then attack
- **THEN** the tiles it could attack from where it would land are shown as
  threatened by that unit

#### Scenario: A spent unit threatens nothing

- **WHEN** a unit has already attacked this turn
- **THEN** it contributes nothing to either the reach or the threat field

#### Scenario: Overlapping coverage is distinguishable

- **WHEN** two units of the same side can attack the same tile
- **THEN** that tile reports a count of two, and reads more strongly than a tile
  covered by one

#### Scenario: Changing a number moves the field

- **WHEN** a unit type's movement or attack range is changed
- **THEN** the fields change accordingly on the next read, with no unit having
  moved

### Requirement: The session is a timeline that can be walked

The bench SHALL record every action as a frame labelled with what produced it,
and SHALL let the designer step back, step forward, and jump to any frame.
Restoring a frame SHALL restore the board and the session's definition tweaks as
well as the units. Acting after stepping back SHALL discard the frames ahead.

#### Scenario: Scrubbing to an earlier moment

- **WHEN** the designer jumps to an earlier frame
- **THEN** the board returns to exactly its state at that point, and the action
  that produced that frame is identified

#### Scenario: A board change is walked back

- **WHEN** the designer replaces the board and then steps back
- **THEN** the previous board and its units return

#### Scenario: A new action abandons the forward line

- **WHEN** the designer steps back and then takes a different action
- **THEN** stepping forward is no longer offered

#### Scenario: The ends of the timeline

- **WHEN** the designer steps back from the first frame, or forward from the last
- **THEN** the bench reports that there is nowhere to go and changes nothing

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

### Requirement: A telegraph marks an attack that has not happened yet

The bench SHALL report a telegraph only for an attack that is locked and still
pending. A telegraph SHALL be cleared once its attack resolves, and SHALL NOT be
reported for an attack that has already landed.

#### Scenario: Telegraphs are cleared by resolution

- **WHEN** the telegraphs from a planned enemy turn have all resolved
- **THEN** no telegraphs are reported

#### Scenario: A telegraph whose owner died in the window

- **WHEN** an enemy with a locked telegraph is killed by a PC before the
  telegraphs resolve
- **THEN** that enemy's attack does not land, and the remaining telegraphs
  resolve normally

### Requirement: The telegraph window is a scrubbable interval

Planning the enemy turn and resolving its telegraphs SHALL each record their own
frame on the timeline, so the designer can step back into the window and see the
board as it stood while the attacks were pending.

#### Scenario: Stepping back into the window

- **WHEN** the designer resolves the telegraphs and then steps back once
- **THEN** the board returns to the state where the enemies had moved, the
  telegraphs were pending, and no attack damage had been applied

#### Scenario: Stepping back before the enemy turn

- **WHEN** the designer steps back twice from resolved telegraphs
- **THEN** the enemies return to where they stood before planning, and no
  telegraphs are reported

### Requirement: A round ends only after its telegraphs resolve

A round SHALL end only after every telegraph it locked has resolved or been
skipped, as a step of the engine's round rather than an operation the designer
invokes. The bench SHALL NOT offer any operation that ends a round while
telegraphs are pending. Stepping back on the timeline is how a planned enemy turn
is abandoned deliberately.

#### Scenario: The round ends as part of resolution

- **WHEN** the last pending telegraph resolves
- **THEN** the round ends and the next round's enemy phase begins, without the
  designer invoking a separate end-of-round operation

#### Scenario: No way to end a round mid-window

- **WHEN** telegraphs from a planned enemy turn are still pending
- **THEN** the bench offers no operation that would end the round and discard
  them

### Requirement: The bench shows which phase the round is in

The bench SHALL report the round's current phase and SHALL move through phases
via the engine rather than remaining in one phase for the whole session. The
designer SHALL be able to see, without inspecting the board, whether the round is
awaiting the enemy turn, awaiting the player, or awaiting telegraph resolution.

#### Scenario: The phase is reported

- **WHEN** the designer looks at the bench at any point in a round
- **THEN** the current phase is shown

#### Scenario: The phase advances with the round

- **WHEN** the enemy turn is planned and its telegraphs are then resolved
- **THEN** the reported phase changes to match each step of the round rather than
  staying fixed

#### Scenario: Phase survives a step back

- **WHEN** the designer steps back to a frame from an earlier phase
- **THEN** the reported phase is the one that frame was in

### Requirement: The bench shows what the round will do next

The bench SHALL report the round's next step before it happens — which enemy
would act and with what, which telegraph would resolve, or which phase
transition would occur — obtained from the engine rather than derived by the
bench. The report SHALL be visible while stepping through the timeline.

#### Scenario: The next step is shown before it happens

- **WHEN** an enemy turn has been planned and telegraphs are pending
- **THEN** the bench reports which telegraph resolves next

#### Scenario: The next step matches what happens

- **WHEN** the bench reports the next step and the designer then takes it
- **THEN** what happens is what was reported

#### Scenario: Nothing left to do

- **WHEN** the round has no next step available
- **THEN** the bench reports that rather than showing a stale one

### Requirement: A telegraph is reported only until it resolves

The bench SHALL report a telegraph as pending only while it is still awaiting
resolution. A telegraph that has resolved SHALL NOT be reported as pending, even
while other telegraphs from the same round are still outstanding.

#### Scenario: Partway through resolution

- **WHEN** some of a round's telegraphs have resolved and others have not
- **THEN** only the unresolved ones are reported as pending

### Requirement: A bookmark that predates the engine's round is refused

The bench SHALL detect a saved position that carries no record of the round's
progress and SHALL refuse to load it, reporting why and that it should be saved
again. The bench SHALL NOT infer or backfill the missing round state, and a
refused load SHALL leave the bench unchanged.

#### Scenario: An older saved position is declined

- **WHEN** the designer loads a position saved before the bench ran on the
  engine's round
- **THEN** the bench refuses, explains that the position predates the engine's
  round and should be saved again, and the board is left as it was

### Requirement: A telegraph is legible on the board

A pending telegraph SHALL be rendered so a designer can identify the threatened
tile at the board's normal zoom, without hovering, selecting, or inspecting
state. It SHALL remain legible over every terrain and structure fill the board
generator produces, and when a reach or threat field is displayed over the same
tile.

#### Scenario: A telegraph is visible at normal zoom

- **WHEN** a telegraph is pending on any tile
- **THEN** the threatened tile is distinguishable from its neighbours at the
  board's normal zoom

#### Scenario: A telegraph over a structure

- **WHEN** a telegraph is pending on a tile containing a structure
- **THEN** it remains distinguishable against the structure's fill

#### Scenario: A telegraph under a field overlay

- **WHEN** a telegraph is pending on a tile that a reach or threat field also
  covers
- **THEN** both remain readable rather than one obscuring the other

### Requirement: The designer can plan an enemy's turn

The bench SHALL let the designer author an enemy's turn — its move and its
intended attack — taking the seat the AI occupies in the game. Each enemy SHALL
be planned individually, and its move SHALL execute as it is planned so that
enemies planned afterwards are planned against a board reflecting it.

The engine SHALL validate every authored plan. The bench SHALL surface the
engine's refusal rather than pre-filtering or rewording it.

#### Scenario: An enemy is planned by hand

- **WHEN** the designer plans an enemy to move to a legal tile and attack a legal
  target
- **THEN** the enemy moves there, its attack is locked as a telegraph, and it is
  shown as planned

#### Scenario: A planned move is visible to the next plan

- **WHEN** the designer plans one enemy into a tile and then plans another
- **THEN** the second enemy is planned against a board where the first already
  stands in its new position

#### Scenario: Every enemy holds

- **WHEN** the designer plans every enemy to stay where it is and not attack
- **THEN** the plan is accepted, even though the AI would never choose it

#### Scenario: An illegal plan is refused

- **WHEN** the designer plans a move or an attack the engine judges illegal
- **THEN** the bench reports the engine's reason and nothing on the board changes

#### Scenario: An enemy cannot be planned twice

- **WHEN** the designer plans an enemy whose turn this round is already planned
- **THEN** the bench reports the engine's refusal and nothing changes

### Requirement: Authorship can be mixed within one round

The bench SHALL let the designer fill any enemy's plan by hand, hand a single
named enemy to the AI, or hand every still-unplanned enemy to the AI — and SHALL
allow these to be mixed freely within one round.

#### Scenario: One enemy handed to the AI

- **WHEN** the designer asks the AI to plan one named enemy
- **THEN** that enemy's turn is planned as the AI would have it, and other
  enemies remain unplanned

#### Scenario: The rest handed to the AI

- **WHEN** the designer has planned some enemies by hand and asks the AI to take
  the remaining ones
- **THEN** every unplanned enemy is planned by the AI and the hand-authored plans
  are left untouched

#### Scenario: Hand-authored and AI plans in one round

- **WHEN** a round contains both designer-authored and AI-authored enemy plans
  and the telegraphs resolve
- **THEN** all of them resolve identically, with no difference in how they are
  treated

### Requirement: Turn order is the order the designer plans in

The bench SHALL treat the order the designer plans enemies in as the round's turn
order, and their telegraphs SHALL resolve in that same order. The bench SHALL NOT
require a separate ordering step.

#### Scenario: Planning order drives resolution order

- **WHEN** the designer plans enemies in an order other than the AI's own and
  then resolves the telegraphs
- **THEN** the telegraphs resolve in the order the designer planned them

### Requirement: Planning state is visible

The bench SHALL show which enemies still need a plan this round, and for each
enemy already planned, whether the designer or the AI chose it.

#### Scenario: Unplanned enemies are shown

- **WHEN** some enemies have been planned and others have not
- **THEN** the bench shows exactly which ones still need a plan

#### Scenario: Plan authorship is shown

- **WHEN** a round contains both designer-authored and AI-authored plans
- **THEN** the bench distinguishes which is which

#### Scenario: The round cannot proceed with an enemy unplanned

- **WHEN** the designer tries to move on to the player's turn while an enemy is
  still unplanned
- **THEN** the bench reports which enemies still need a plan and does not proceed

### Requirement: A locked telegraph can be amended, retroactively

The bench SHALL let the designer retarget a locked telegraph after the enemy turn
was planned and before it resolves. **This is a deliberate departure from the
game**, where a telegraph cannot be changed once locked.

The amendment SHALL be retroactive: the session SHALL read as though the enemy
had been planned that way from the start, with no separate record of the change.
Stepping back to any frame at or after the telegraph was locked SHALL show the
amended target. The amended attack SHALL be validated by the engine from the
enemy's current position, and amending SHALL NOT alter the enemy's executed
movement.

#### Scenario: A telegraph is retargeted mid-window

- **WHEN** the designer amends a pending telegraph to a different legal tile
  after acting with a PC
- **THEN** the telegraph shows the new target, and resolving it lands the attack
  there

#### Scenario: The amendment reads as original

- **WHEN** the designer amends a telegraph and then steps back to the frame where
  the enemy turn was planned
- **THEN** that frame shows the amended target, as though it had been planned so

#### Scenario: Rewinding past the plan discards the amendment

- **WHEN** the designer steps back to before the enemy turn was planned and plans
  it again
- **THEN** the amendment is gone, because the plan it belonged to no longer exists

#### Scenario: The enemy does not move

- **WHEN** a telegraph is amended
- **THEN** the enemy remains exactly where its planned move left it

#### Scenario: An illegal amendment is refused

- **WHEN** the designer amends a telegraph to a tile the enemy cannot attack from
  where it stands
- **THEN** the bench reports the engine's reason and the original telegraph is
  unchanged

#### Scenario: A dead enemy has no telegraph to amend

- **WHEN** the designer amends the telegraph of an enemy killed inside the window
- **THEN** the bench reports that there is no such telegraph and changes nothing
