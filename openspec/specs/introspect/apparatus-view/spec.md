# Apparatus View Specification

## Purpose

Render the ADM talk-inspired apparatus in the browser so the presenter can see the context window, pinned foundation zone, context gauge, and token/cost counter update in real time.

## Requirements

### Requirement: Context window rendering
The apparatus view SHALL display a vertical context window containing chat blocks that enter from the top and push older blocks downward.

#### Scenario: New message arrives
- **WHEN** a `message_update` or `assistant_message` event arrives
- **THEN** a new block appears at the top of the scroll zone and existing blocks shift down

### Requirement: Pinned foundation zone
The apparatus view SHALL show a pinned foundation zone at the bottom of the context window that displays the system prompt, loaded skills, and active guides/sensors.

#### Scenario: Foundation update arrives
- **WHEN** a `foundation_update` event arrives during a session
- **THEN** the pinned zone updates to show the new skills, guides, and sensors

### Requirement: Context gauge
The apparatus view SHALL render a gauge showing the current context usage as a percentage of the model's context window.

#### Scenario: Usage increases
- **WHEN** a `context_usage` event reports a higher percentage
- **THEN** the gauge animates to the new value and highlights high-usage regions

### Requirement: Token and cost counter
The apparatus view SHALL display a running token count and estimated cost for the current session.

#### Scenario: Tokens accumulate
- **WHEN** streaming events include usage data
- **THEN** the token counter increases and the cost estimate updates

### Requirement: Middle danger zone
The context window SHALL visually distinguish the middle region as the "danger zone" where important context is most likely to be lost.

#### Scenario: Long conversation
- **WHEN** the scroll zone contains enough blocks that some are in the middle region
- **THEN** blocks in the middle region are rendered with muted styling to indicate lower attention

### Requirement: No empty blocks in the context window
The apparatus view SHALL NOT display a block for an assistant turn that produced no text content.

#### Scenario: Assistant turn is tool-only
- **WHEN** the agent starts an assistant message, makes one or more tool calls, and ends the message without ever emitting non-whitespace text
- **THEN** the context window shows the tool call block(s) for that turn but no empty assistant block among them

### Requirement: Assistant markdown rendering in the context window
The apparatus view SHALL render assistant block text as formatted markdown, styled to match the view's dark theme, rather than as raw unformatted text, and SHALL keep applying the middle danger zone's muted styling to markdown-rendered blocks.

#### Scenario: Assistant block contains markdown formatting
- **WHEN** an assistant block's text includes markdown syntax (e.g. headings, bold/italic emphasis, lists, inline code, fenced code blocks, tables, links)
- **THEN** the context window renders that syntax as its corresponding styled HTML element instead of showing the raw markdown characters

#### Scenario: Markdown-rendered block falls in the danger zone
- **WHEN** an assistant block with markdown-formatted text falls within the middle danger zone described by the "Middle danger zone" requirement
- **THEN** that block is visibly dimmed the same as a plain-text block would be in that position

#### Scenario: User and system blocks are not markdown-rendered
- **WHEN** a block has role `user` or `system`
- **THEN** its text is rendered as plain text, not parsed as markdown
