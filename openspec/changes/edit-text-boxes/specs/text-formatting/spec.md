## Purpose

Enables structured rich-text formatting — bold, italic, bullet lists, and
numbered lists — within a single deck text box's content, usable equivalently
by pi via tool calls and by the user via the canvas, and rendered
consistently wherever the deck is displayed.

## ADDED Requirements

### Requirement: Structured text representation
A text box's content SHALL be represented as an ordered list of blocks, each
either a paragraph block or a list-item block (bulleted or numbered), where
each block contains an ordered list of inline runs carrying their own bold
and italic flags. This replaces a plain text string as the object's content.

#### Scenario: Existing plain-text content still renders
- **WHEN** deck content authored before this change (a plain text string) is
  loaded
- **THEN** it is represented as a single paragraph block containing one
  unstyled run with that string, and renders identically to before

### Requirement: Bold and italic character formatting
The system SHALL support marking any inline run as bold, italic, or both,
independently of every other run in the same text box.

#### Scenario: Formatting part of a run
- **WHEN** pi or the user applies bold to a sub-range of a run's characters
- **THEN** that run is split so only the specified sub-range becomes bold,
  and the remaining characters in the paragraph keep their prior styling

#### Scenario: Toggling formatting off
- **WHEN** bold is applied to a run whose characters are already bold
- **THEN** the bold styling on that run is removed

### Requirement: Bullet and numbered lists
The system SHALL support converting a paragraph block into a bulleted-list
item or a numbered-list item, and converting a list-item block back into a
plain paragraph, without discarding the block's inline runs or their
formatting.

#### Scenario: Convert paragraphs to a bulleted list
- **WHEN** pi or the user applies bulleted-list formatting to one or more
  paragraph blocks in a text box
- **THEN** those blocks become list items rendered with a bullet marker,
  preserving their original order and inline formatting

#### Scenario: Numbered list renumbers automatically
- **WHEN** two or more consecutive blocks are numbered-list items
- **THEN** they render with sequential numbers starting at 1, recomputed
  from their position rather than a stored index

### Requirement: User applies formatting via canvas selection
While editing a text box's content on the canvas, the user SHALL be able to
select a range of characters and apply or remove bold, italic,
bulleted-list, or numbered-list formatting for that selection.

#### Scenario: Selecting a mid-run character range
- **WHEN** the user selects a range of characters spanning part of one run
  and applies italic
- **THEN** only the selected characters become italic, and characters
  outside the selection retain their prior styling

### Requirement: Agent applies formatting via tool call
pi SHALL be able to apply the same bold, italic, bulleted-list, and
numbered-list formatting available to the user by calling
`presentation_update` with a target text box id and the structured content
or formatting operation to apply.

#### Scenario: Agent bolds a phrase
- **WHEN** pi calls `presentation_update` to apply bold formatting to a
  specific character range within a text box's content
- **THEN** the resulting structured content reflects the bold run, and a
  subsequent `presentation_get_state` call returns that same structured
  content

### Requirement: Canvas renders structured text
The deck canvas SHALL render each text box's structured content — including
bold, italic, bullet markers, and list numbering — so its visual appearance
matches the styling stored in shared deck state.

#### Scenario: Mixed formatting in one box
- **WHEN** a text box contains a bulleted list where one item includes a
  bold run
- **THEN** the canvas shows a bullet marker for each list item and renders
  that run in bold
