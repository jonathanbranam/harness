## ADDED Requirements

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
