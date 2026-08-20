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

The bench SHALL NOT resolve enemy moves and enemy attacks as a single
indivisible step.

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

#### Scenario: No enemies on the board

- **WHEN** an enemy turn is planned with no enemy units on the board
- **THEN** the bench reports that there are no enemies and changes nothing

## ADDED Requirements

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
