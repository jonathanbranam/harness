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
