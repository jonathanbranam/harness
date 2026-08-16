## ADDED Requirements

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
