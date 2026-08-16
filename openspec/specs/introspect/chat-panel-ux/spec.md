# Chat Panel Ux Specification

## Purpose

Defines how the introspect harness's "Chat with pi" panel renders the `ContextBlock` stream — turning user/assistant/tool/system blocks into a readable chat transcript that stays legible across turns with multiple tool calls and markdown-formatted replies.

## Requirements

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
The chat panel SHALL render assistant block text as formatted markdown, styled to match the panel's dark theme, rather than as raw unformatted text.

#### Scenario: Assistant reply contains markdown formatting
- **WHEN** an assistant block's text includes markdown syntax (e.g. headings, bold/italic emphasis, bullet or numbered lists, inline code, fenced code blocks, tables, links)
- **THEN** the chat panel renders that syntax as its corresponding styled HTML element instead of showing the raw markdown characters

#### Scenario: Assistant reply is still streaming
- **WHEN** an assistant block is actively streaming text deltas
- **THEN** the partially-received text is rendered as markdown on each update, without waiting for the message to finish

#### Scenario: User and system blocks are not markdown-rendered
- **WHEN** a block has role `user` or `system`
- **THEN** its text is rendered as plain text, not parsed as markdown
