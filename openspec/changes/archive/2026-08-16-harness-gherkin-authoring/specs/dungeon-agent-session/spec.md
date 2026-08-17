## REMOVED Requirements

### Requirement: No dungeon-tactics tools registered
**Reason**: This change registers the first dungeon-tactics-specific tools (`dungeon-scenario-authoring`'s Gherkin-authoring tools), so "no dungeon-tactics tools registered" no longer holds.
**Migration**: Superseded by "Only Gherkin-authoring tools registered" below, which narrows the claim to "no board-manipulation or track-web-access tools yet" instead of "no dungeon-tactics tools at all."

## ADDED Requirements

### Requirement: Only Gherkin-authoring tools registered
The `AgentSession` SHALL be created with pi's built-in tools (`bash`, `write`, `edit`, `read`, `grep`, `find`, `ls`) plus the `dungeon-scenario-authoring` tools (`dungeon_read_feature`, `dungeon_write_feature`, `dungeon_write_implementation_notes`), with no board-manipulation or track-web-access tools registered.

#### Scenario: Agent has Gherkin-authoring tools but no board or track-web tools
- **WHEN** the agent lists its available tools
- **THEN** pi's built-in tools and `dungeon_read_feature`/`dungeon_write_feature`/`dungeon_write_implementation_notes` are present; no board-manipulation or track-web-access tools exist yet
