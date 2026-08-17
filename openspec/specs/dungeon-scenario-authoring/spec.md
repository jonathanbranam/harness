# dungeon-scenario-authoring Specification

## Purpose

Give `dungeon-harness-server` an internal Gherkin Feature/Scenario/Step model — parsed from and rendered back to `.feature` text — plus the tools that let the agent read and write that model within the harness's own workspace, so a design session's scenario work survives a session close/reopen with no drift.

## Requirements

### Requirement: Parse Gherkin text into the working model
The system SHALL parse `.feature` text into an internal Feature/Scenario/Step tree that preserves scenario titles, step keywords/text, and any `@scenario-id:<slug>` tags present.

#### Scenario: Parsing a well-formed feature file
- **WHEN** the system parses `.feature` text containing a Feature with one or more Scenarios and Given/When/Then steps
- **THEN** it produces a working model with a matching Feature/Scenario/Step tree, including each Scenario's `@scenario-id:<slug>` tag if present

#### Scenario: Parsing malformed Gherkin
- **WHEN** the system attempts to parse `.feature` text that isn't valid Gherkin
- **THEN** it reports a parse error identifying the problem rather than producing a partial or corrupted working model

### Requirement: Render the working model back to Gherkin text
The system SHALL render an internal Feature/Scenario/Step tree to `.feature` text that a standard Gherkin parser can parse back into an equivalent tree.

#### Scenario: Rendering a working model
- **WHEN** the system renders a working model containing a Feature with Scenarios and steps
- **THEN** it produces `.feature` text with the Feature/Scenario/Step structure, step keywords, and `@scenario-id:<slug>` tags represented in valid Gherkin syntax

### Requirement: Round-trip stability
For `.feature` content the harness itself produced, parsing it, rendering the result, and parsing that output again SHALL yield an equivalent working model — no drift from re-rendering (e.g. whitespace or comment placement differences that change the model).

#### Scenario: Re-parsing harness-rendered output
- **WHEN** a working model is rendered to `.feature` text and that text is immediately parsed again
- **THEN** the resulting working model is equivalent to the one that was rendered (same Features, Scenarios, steps, and `@scenario-id:<slug>` tags)

### Requirement: Stable per-scenario identity
Every Scenario in the working model SHALL have a `@scenario-id:<slug>` tag. The system SHALL assign this tag once, when a Scenario is first created with no existing `@scenario-id:` tag, using a stable generated slug, and SHALL leave an already-assigned tag unchanged across later edits to that Scenario's title or steps.

#### Scenario: New scenario gets a tag
- **WHEN** a Scenario is created in the working model with no `@scenario-id:` tag
- **THEN** the system assigns it a `@scenario-id:<slug>` tag

#### Scenario: Editing a scenario preserves its tag
- **WHEN** an existing Scenario's title or steps are edited in the working model
- **THEN** its `@scenario-id:<slug>` tag remains unchanged

### Requirement: `dungeon_read_feature` tool
The system SHALL provide a `dungeon_read_feature` tool that parses a `.feature` file from a path within the harness's own workspace into the working model.

#### Scenario: Reading an existing feature file
- **WHEN** the agent calls `dungeon_read_feature` with the path to an existing `.feature` file inside the workspace
- **THEN** the tool returns the working model parsed from that file's current contents

#### Scenario: Path outside the workspace
- **WHEN** the agent calls `dungeon_read_feature` with a path that resolves outside the harness's workspace
- **THEN** the tool call is blocked with a reason identifying the offending path, and no file is read

### Requirement: `dungeon_write_feature` tool
The system SHALL provide a `dungeon_write_feature` tool that renders the working model to Gherkin text and writes it to a path within the harness's own workspace, and only there.

#### Scenario: Writing the working model
- **WHEN** the agent calls `dungeon_write_feature` with a target path inside the workspace
- **THEN** the tool renders the current working model to Gherkin text and writes it to that path

#### Scenario: Path outside the workspace
- **WHEN** the agent calls `dungeon_write_feature` with a target path that resolves outside the harness's workspace
- **THEN** the tool call is blocked with a reason identifying the offending path, and no file is written

### Requirement: `dungeon_write_implementation_notes` tool
The system SHALL provide a `dungeon_write_implementation_notes` tool that writes advisory step-consolidation/refactor suggestions to a path within the harness's own workspace, and only there. These notes SHALL NOT be read back by `dungeon_read_feature`.

#### Scenario: Writing implementation notes
- **WHEN** the agent calls `dungeon_write_implementation_notes` with note content and a target path inside the workspace
- **THEN** the tool writes the note content to that path

#### Scenario: Notes are advisory only
- **WHEN** `dungeon_read_feature` parses a `.feature` file
- **THEN** any implementation notes previously written for that unit have no effect on the resulting working model

#### Scenario: Path outside the workspace
- **WHEN** the agent calls `dungeon_write_implementation_notes` with a target path that resolves outside the harness's workspace
- **THEN** the tool call is blocked with a reason identifying the offending path, and no file is written
