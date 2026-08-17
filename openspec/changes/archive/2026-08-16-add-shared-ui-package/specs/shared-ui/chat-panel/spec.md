## Purpose

`@harness/ui`'s `ChatPanel` and `ChatInput` give any `TranscriptEntry`-shaped harness a consistent "Chat with pi" experience — readable message and tool-call rendering, stick-to-bottom auto-scroll, and a multi-line input — without each harness reimplementing it independently.

## ADDED Requirements

### Requirement: No empty message bubbles
The chat panel SHALL NOT display a message bubble for an assistant turn that produced no text content.

#### Scenario: Assistant turn is tool-only
- **WHEN** the agent starts an assistant message, makes one or more tool calls, and ends the message without ever emitting non-whitespace text
- **THEN** the chat panel shows the tool call badge(s) for that turn but no empty message bubble before, between, or after them

#### Scenario: Assistant turn mixes text and tool calls
- **WHEN** the agent emits at least one non-whitespace text delta as part of an assistant message that also includes tool calls
- **THEN** the chat panel shows a message bubble containing that text, alongside the tool call badge(s)

#### Scenario: Multiple tool calls in one turn
- **WHEN** the agent makes several tool calls in a row within a single turn, with no non-whitespace text emitted between them
- **THEN** the chat panel shows each tool call's badge consecutively with no blank bubble separating them

### Requirement: Assistant markdown rendering
The chat panel SHALL render assistant message text as formatted markdown, styled to match the panel's theme, rather than as raw unformatted text.

#### Scenario: Assistant reply contains markdown formatting
- **WHEN** an assistant entry's text includes markdown syntax (e.g. headings, bold/italic emphasis, bullet or numbered lists, inline code, fenced code blocks, tables, links)
- **THEN** the chat panel renders that syntax as its corresponding styled HTML element instead of showing the raw markdown characters

#### Scenario: Assistant reply is still streaming
- **WHEN** an assistant entry is actively streaming text deltas
- **THEN** the partially-received text is rendered as markdown on each update, without waiting for the message to finish

#### Scenario: User messages are not markdown-rendered
- **WHEN** a chat entry is a user-authored message
- **THEN** its text is rendered as plain text, not parsed as markdown

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

#### Scenario: Enter during IME composition does not submit
- **WHEN** the user presses Enter to confirm an IME (input method editor) candidate while composing text
- **THEN** the message is not submitted, and the composed text is inserted into the input as normal
