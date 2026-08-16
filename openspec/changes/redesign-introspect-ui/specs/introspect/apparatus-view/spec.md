## MODIFIED Requirements

### Requirement: Context window rendering
The apparatus view SHALL display a fixed-size grid representing 0-100% of the model's real context window, with chronological session content binned into grid cells in the order it entered context, filling from the foundation zone outward, and SHALL NOT grow past the pane's fixed extent or require scrolling regardless of session length.

#### Scenario: New message arrives
- **WHEN** a `message_end`, `tool_execution_end`, `tool_result`, or `context_usage` event arrives
- **THEN** the grid updates to reflect the new cumulative token position without changing the size of the grid pane itself

#### Scenario: Session exceeds a full grid's worth of content
- **WHEN** cumulative context usage would require more grid cells than the fixed grid provides
- **THEN** the apparatus view continues to represent the same fixed 0-100% extent (never scrolling or growing), with usage approaching the forced-compaction zone signaling the limit instead

### Requirement: Pinned foundation zone
The apparatus view SHALL show a pinned foundation zone that always remains visible and displays the system prompt, loaded skills, and active guides/sensors, positioned at the start of the grid's chronological fill order so it is never obscured by later content.

#### Scenario: Foundation update arrives
- **WHEN** a `foundation_update` event arrives during a session
- **THEN** the pinned zone updates to show the new skills, guides, and sensors

#### Scenario: Grid fills with later content
- **WHEN** later session content fills additional grid cells
- **THEN** the foundation zone remains visible and is not scrolled away or overwritten

## REMOVED Requirements

### Requirement: Middle danger zone
**Reason**: Replaced by labeled, tunable zone bands ("smart zone," "dumb zone," "forced compaction") expressed as percentages of the model's real context window — see the new "Context-window zone bands" requirement. A single undifferentiated "middle" region no longer matches the design.
**Migration**: None needed for users; the visual replacement is the zone bands requirement below.

### Requirement: No empty blocks in the context window
**Reason**: Apparatus no longer renders one visual unit per assistant turn/block. Content is aggregated into fixed-size grid cells by cumulative token position, so "an empty block" is no longer a concept that applies to its rendering. The equivalent behavior for readable transcript text remains the chat panel's job (see `introspect/chat-panel-ux`'s identically-named requirement).
**Migration**: None; no observable behavior is lost, since the chat panel already independently guarantees no empty message bubbles.

### Requirement: Assistant markdown rendering in the context window
**Reason**: **BREAKING** — Apparatus no longer renders full assistant/tool/user block text or markdown content at all; it is now a summary token-capacity visualization only. Full-text rendering, markdown included, remains exclusively the chat panel's responsibility.
**Migration**: Users who need to read full turn text use the chat panel, which already renders assistant markdown (see `introspect/chat-panel-ux`).

## ADDED Requirements

### Requirement: Context-window zone bands
The apparatus view SHALL divide the grid into three labeled zones — "smart zone," "dumb zone," and "forced compaction" — as tunable percentage boundaries of the model's real context window, and SHALL visually distinguish each zone.

#### Scenario: Usage crosses a zone boundary
- **WHEN** cumulative context usage crosses from one zone's percentage range into the next
- **THEN** the visual boundary between the zones is drawn at that percentage of the grid's fixed extent, and content on each side is labeled with its zone

#### Scenario: Zone boundaries are configurable
- **WHEN** the zone boundary percentages are changed
- **THEN** the grid re-renders its zone bands at the new boundaries without requiring any other change to the view

### Requirement: Token category breakdown
The apparatus view SHALL classify every token contributing to context usage into one of: foundation, user prompt, skill auto-load, assistant output, thinking, tool-result content, or reprocessed context (cache miss), and SHALL render each category with a distinct color.

#### Scenario: A message includes both tool-result content and reprocessing
- **WHEN** an assistant turn's reported input-token usage includes both tokens attributable to a tool call's result content and additional tokens not attributable to any known new content (user prompt, skill load, or tool result)
- **THEN** the apparatus view renders the tool-result tokens and the remaining unattributed tokens as two distinct categories rather than a single combined "input" category

#### Scenario: Tool-result token count is exact when available
- **WHEN** the harness has captured a tool call's result content
- **THEN** the tool-result category's token count for that call is computed from that captured content rather than estimated from the surrounding message's aggregate usage

#### Scenario: Thinking content arrives without an explicit token count
- **WHEN** a provider streams thinking content for a message but does not report a reasoning token count in that message's usage
- **THEN** the apparatus view still renders a thinking-category contribution for that message, sized by an approximation derived from the thinking content's length

### Requirement: Aggregated section grouping
The apparatus view SHALL group contiguous grid cells that share the same dominant token category into a single interactive section, rather than treating each cell as an independent hover target.

#### Scenario: Hovering a cell within a multi-cell section
- **WHEN** the user hovers any grid cell belonging to a section that spans more than one cell
- **THEN** every cell in that section is visually highlighted together, and the hover detail shows the total token count and cell span for the whole section rather than just the hovered cell's contribution

#### Scenario: Grid remains visible through a section
- **WHEN** a section spans multiple grid cells
- **THEN** the boundaries between the individual cells composing that section remain visible, so the section's size in cells can still be visually estimated

### Requirement: Tool call indicators
The apparatus view SHALL show at most one tool-call indicator per grid cell, regardless of how many tool calls landed in that cell, colored by the least-successful status among those calls.

#### Scenario: Multiple tool calls land in the same cell
- **WHEN** more than one tool call's result falls within the same grid cell
- **THEN** the apparatus view shows a single indicator for that cell rather than one indicator per call, and hovering it lists every call that landed there, including each call's name, status, and turn

#### Scenario: A cell contains a failed tool call
- **WHEN** any tool call landing in a cell has an error status
- **THEN** that cell's indicator is colored to represent an error, distinct from the color used for a call still in progress

#### Scenario: A cell contains only in-flight tool calls
- **WHEN** a cell's tool calls are all still in progress (none has errored, none has yet completed)
- **THEN** that cell's indicator uses a color visually distinct from both the completed-success color and the error color, so an in-progress call is not mistaken for a failure
