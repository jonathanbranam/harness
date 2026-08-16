## ADDED Requirements

### Requirement: Stick-to-bottom auto-scroll
The chat panel's scroll region SHALL automatically scroll to the newest content only when the user's scroll position was already near the bottom before new content arrived.

#### Scenario: User is at the bottom when a new block arrives
- **WHEN** the chat panel's scroll position is within a small threshold of the bottom and a new block is appended
- **THEN** the panel scrolls to show the new block

#### Scenario: User has scrolled up to read history
- **WHEN** the chat panel's scroll position is not near the bottom and a new block is appended
- **THEN** the panel's scroll position does not change, leaving the user's view undisturbed
