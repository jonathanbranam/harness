## ADDED Requirements

### Requirement: The bench plays the game's round, in the game's order

The bench SHALL play the same round as the game, in the same order, refereed by
the same engine. The designer's seat for a player unit is the action surface; the
designer's seat for an enemy is **planning**, the seat the game's AI occupies. An
enemy SHALL NOT be moved or made to attack through the action surface in any
phase, and the bench SHALL surface the engine's reason for refusing rather than
present a control that silently does nothing.

The bench SHALL depart from the game's rules only where a departure is specified,
argued on its own, and named. Exactly one exists today: amending a locked
telegraph, which spends no turn, deals no damage, and grants no extra action.

#### Scenario: An enemy cannot be driven through the action surface

- **WHEN** an enemy unit is selected and asked what it can do, in any phase
- **THEN** every action is unavailable, carrying the engine's reason that an enemy
  takes its turn by being planned

#### Scenario: A player unit cannot act outside the player phase

- **WHEN** a player unit is asked to move or attack while the round is planning
  enemy turns or resolving telegraphs
- **THEN** the engine refuses with a reason naming the phase, and nothing changes

#### Scenario: The bench is not exempt

- **WHEN** the bench, which runs the engine in bench mode, makes either of the
  requests above
- **THEN** it is refused exactly as the game would be — running in bench mode
  changes nothing about which rules apply

#### Scenario: An enemy's turn is taken by planning it

- **WHEN** the designer wants an enemy to move and attack
- **THEN** they plan it, by hand or by handing it to the AI, and the attack
  becomes a telegraph that resolves after the player's turn — never immediately

#### Scenario: A round ends and refreshes both sides

- **WHEN** the round ends
- **THEN** every unit's movement is restored and no unit is marked as having
  attacked

## REMOVED Requirements

### Requirement: Both sides are played by hand

**Reason**: It was a deferral, not a decision. When it was written the engine had
no round to be in sequence with, so "the bench drives both sides out of sequence"
was simply a description of the state of the world. Rebuild phases 1–4 gave the
engine the round and gave the designer a proper enemy seat, and this requirement
was never retired — it went on to override the turn sequencer's own plan of
record and win an argument it should not have been in.

It also described a rule the game does not have. An enemy attack committed
through the action surface resolves its damage immediately, where the game's
enemy attack is always a telegraph locked a phase earlier. The bench was showing
the designer something the game cannot produce.

**Migration**: Plan the enemy instead — `planEnemyByHand` for the designer's own
choice of move and target, or the AI for the game's choice. Both existed already
(*"The designer can plan an enemy's turn"*), both produce a real telegraph, and
both leave the player a turn to answer it.

The two rules this requirement carried that are about the round rather than about
driving an enemy are carried forward: an attack being committal for the rest of
the round is covered by *"The engine decides which actions a unit may take"*, and
a round refreshing both sides is a scenario of *"The bench plays the game's round,
in the game's order"* above.
