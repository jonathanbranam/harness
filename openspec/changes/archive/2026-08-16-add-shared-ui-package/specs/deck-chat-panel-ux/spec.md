## ADDED Requirements

### Requirement: Stick-to-bottom auto-scroll
The chat panel's scroll region SHALL automatically scroll to the newest content only when the user's scroll position was already near the bottom before new content arrived.

#### Scenario: User is at the bottom when a new entry arrives
- **WHEN** the chat panel's scroll position is within a small threshold of the bottom and a new entry is appended
- **THEN** the panel scrolls to show the new entry

#### Scenario: User has scrolled up to read history
- **WHEN** the chat panel's scroll position is not near the bottom and a new entry is appended
- **THEN** the panel's scroll position does not change, leaving the user's view undisturbed

### Requirement: Auto-growing chat input
The chat input SHALL grow vertically to fit typed content up to a maximum height of approximately six lines, beyond which it becomes internally scrollable, and SHALL return to single-line height after a message is submitted.

#### Scenario: User types a multi-line prompt
- **WHEN** the user types or pastes text that wraps to more lines than the input's current height shows
- **THEN** the input grows taller to fit the additional lines, up to the maximum height

#### Scenario: Typed content exceeds the maximum height
- **WHEN** the user's typed content would require more than approximately six lines of height
- **THEN** the input stops growing at its maximum height and becomes internally scrollable, keeping the line the user is actively editing in view

#### Scenario: Message is submitted
- **WHEN** the user submits a message from an input that has grown beyond one line
- **THEN** the input's text is cleared and its height returns to single-line size

#### Scenario: Enter submits, Shift+Enter inserts a newline
- **WHEN** the user presses Enter without Shift held while the input is focused and not composing IME text
- **THEN** the message is submitted rather than a newline being inserted

#### Scenario: Shift+Enter inserts a newline
- **WHEN** the user presses Shift+Enter while the input is focused
- **THEN** a newline is inserted into the input and the message is not submitted
