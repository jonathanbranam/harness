## ADDED Requirements

### Requirement: Rendering is agnostic to event source
The apparatus view SHALL render identically regardless of whether its events originate from a live `AgentSession` or from the replay engine.

#### Scenario: Same events, live vs. replay
- **WHEN** the apparatus view receives the same sequence of events once during a live session and once during replay of a recording of that session
- **THEN** it renders the same context window, foundation zone, gauge, and token/cost counter state at each corresponding point
