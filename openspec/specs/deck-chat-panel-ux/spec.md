# Deck Chat Panel Ux Specification

## Purpose

Defines how the deck harness's "Chat with pi" panel renders the agent transcript — turning the underlying agent event stream into message bubbles and tool badges that stay legible across turns with multiple tool calls and markdown-formatted replies.

## Requirements

### Requirement: No empty message bubbles
The chat transcript SHALL NOT display a message bubble for an assistant turn that produced no text content.

#### Scenario: Assistant turn is tool-only
- **WHEN** the agent starts an assistant message, makes one or more tool calls, and ends the message without ever emitting non-whitespace text
- **THEN** the transcript shows the tool call badge(s) for that turn but no empty message bubble before, between, or after them

#### Scenario: Assistant turn mixes text and tool calls
- **WHEN** the agent emits at least one non-whitespace text delta as part of an assistant message that also includes tool calls
- **THEN** the transcript shows a message bubble containing that text, alongside the tool call badge(s)

#### Scenario: Multiple tool calls in one turn
- **WHEN** the agent makes several tool calls in a row within a single turn, with no non-whitespace text emitted between them
- **THEN** the transcript shows each tool call's badge consecutively with no blank bubble separating them

### Requirement: Assistant markdown rendering
The chat transcript SHALL render assistant message text as formatted markdown, styled to match the panel's dark theme, rather than as raw unformatted text.

#### Scenario: Assistant reply contains markdown formatting
- **WHEN** an assistant message's text includes markdown syntax (e.g. headings, bold/italic emphasis, bullet or numbered lists, inline code, fenced code blocks, links)
- **THEN** the transcript renders that syntax as its corresponding styled HTML element (e.g. a bold run renders bold, a fenced code block renders in a monospace block) instead of showing the raw markdown characters

#### Scenario: Assistant reply is still streaming
- **WHEN** an assistant message is actively streaming text deltas
- **THEN** the partially-received text is rendered as markdown on each update, without waiting for the message to finish

#### Scenario: User messages are not markdown-rendered
- **WHEN** a transcript entry is a user-authored message
- **THEN** its text is rendered as plain text, not parsed as markdown
