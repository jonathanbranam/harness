## MODIFIED Requirements

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

#### Scenario: An out-of-turn step is refused by the engine

- **WHEN** the designer attempts a step the engine's round does not allow next
- **THEN** the bench reports the engine's own refusal without rewording it, and
  changes nothing

#### Scenario: No enemies on the board

- **WHEN** an enemy turn is planned with no enemy units on the board
- **THEN** the bench reports that there are no enemies and changes nothing

### Requirement: A pending telegraph cannot be discarded without resolving

The bench SHALL refuse any operation that would clear a pending telegraph
without resolving it, and SHALL name the pending telegraphs in the refusal.
Ending the round is such an operation. This refusal SHALL come from the engine
rather than being enforced by the bench itself. Stepping back on the timeline is
how a planned enemy turn is abandoned deliberately.

#### Scenario: Ending the round mid-window

- **WHEN** the designer ends the round while telegraphs from a planned enemy turn
  are still pending
- **THEN** the bench refuses with a reason naming the pending telegraphs, the
  round does not end, and the telegraphs remain pending

#### Scenario: Ending the round after resolving

- **WHEN** the telegraphs have resolved and the designer ends the round
- **THEN** the round ends normally

## ADDED Requirements

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
