## Purpose

Let a design session load a unit's current canonical `.feature` scenarios from track-web as a fixed baseline, and compute a structural added/modified/removed changeset between that baseline and the designer's working scenarios at any point in the session, so both the designer and the handoff review "what changed" rather than a whole rewritten file.

## ADDED Requirements

### Requirement: `dungeon_load_baseline` tool
The system SHALL provide a `dungeon_load_baseline` tool that takes a player-unit identifier (one of the round-one player archetypes: melee, rogue, ranger, magic-user) and loads that unit's canonical `.feature` file from the configured read-only track-web path as the session's baseline, held apart from the designer's working model. The system SHALL call this at most meaningfully once per session — a later call replaces the previously loaded baseline for that session.

#### Scenario: Loading an existing unit's baseline
- **WHEN** the agent calls `dungeon_load_baseline` for a unit whose canonical `.feature` file exists at the configured track-web path
- **THEN** the tool returns a working model parsed from that file's current contents, and the session's baseline is set to it

#### Scenario: Loading a unit with no canonical scenarios yet
- **WHEN** the agent calls `dungeon_load_baseline` for a unit whose canonical `.feature` file does not exist at the configured track-web path (including when the read-only path itself is not configured)
- **THEN** the tool returns an empty baseline (no scenarios) rather than an error, and the session's baseline is set to it

### Requirement: `dungeon_read_step_catalog` tool
The system SHALL provide a `dungeon_read_step_catalog` tool that reads the step catalog from the configured read-only track-web path.

#### Scenario: Reading an existing step catalog
- **WHEN** the agent calls `dungeon_read_step_catalog` and a step catalog file exists at the configured track-web path
- **THEN** the tool returns the catalog's contents

#### Scenario: No step catalog available yet
- **WHEN** the agent calls `dungeon_read_step_catalog` and no step catalog file exists at the configured track-web path (including when the read-only path itself is not configured)
- **THEN** the tool returns an empty catalog rather than an error

### Requirement: Read-only track-web access
`dungeon_load_baseline` and `dungeon_read_step_catalog` SHALL only ever read from the configured track-web path. Neither this capability nor any other tool introduced by it SHALL write to, or otherwise modify, anything under that path.

#### Scenario: Baseline load never writes to track-web
- **WHEN** the agent calls `dungeon_load_baseline` any number of times, for any unit
- **THEN** no file under the configured track-web path is created, modified, or deleted

### Requirement: Structural changeset between baseline and working model
The system SHALL compute a changeset comparing the session's loaded baseline against a given working model, matching scenarios by their `scenarioId`, classifying each scenario as added (present only in the working model), removed (present only in the baseline), modified (present in both with a different title or different steps), or unchanged (present in both, identical). For a modified scenario, the changeset SHALL identify which steps were added, removed, or left unchanged, comparing steps by their sequence position and content rather than assuming a fixed index correspondence.

#### Scenario: Scenario added relative to baseline
- **WHEN** the changeset is computed and the working model contains a scenario whose `scenarioId` is not present in the baseline
- **THEN** that scenario is classified as added

#### Scenario: Scenario removed relative to baseline
- **WHEN** the changeset is computed and the baseline contains a scenario whose `scenarioId` is not present in the working model
- **THEN** that scenario is classified as removed

#### Scenario: Scenario modified relative to baseline
- **WHEN** the changeset is computed and a `scenarioId` present in both baseline and working model has a different title, or has steps that differ between the two
- **THEN** that scenario is classified as modified, and the changeset identifies which steps were added or removed

#### Scenario: Scenario unchanged relative to baseline
- **WHEN** the changeset is computed and a `scenarioId` present in both baseline and working model has the same title and the same steps
- **THEN** that scenario is classified as unchanged

#### Scenario: Changeset against an empty baseline
- **WHEN** the changeset is computed and the session's baseline is empty (no `dungeon_load_baseline` call yet, or the unit had no canonical scenarios)
- **THEN** every scenario in the working model is classified as added

### Requirement: `dungeon_get_changeset` tool
The system SHALL provide a `dungeon_get_changeset` tool that takes the designer's current working model and returns the changeset between it and the session's loaded baseline, for mid-session review.

#### Scenario: Reviewing changes mid-session
- **WHEN** the agent calls `dungeon_get_changeset` with the current working model at any point in a session
- **THEN** the tool returns the changeset between that working model and the session's currently loaded baseline

### Requirement: `dungeon_write_changeset` tool
The system SHALL provide a `dungeon_write_changeset` tool that takes the designer's current working model and a target path within the harness's own workspace, computes the changeset between that working model and the session's loaded baseline, and writes it to that path — and only there.

#### Scenario: Writing the changeset as a handoff artifact
- **WHEN** the agent calls `dungeon_write_changeset` with a working model and a target path inside the workspace
- **THEN** the tool computes the changeset against the session's currently loaded baseline and writes it to that path

#### Scenario: Path outside the workspace
- **WHEN** the agent calls `dungeon_write_changeset` with a target path that resolves outside the harness's workspace
- **THEN** the tool call is blocked with a reason identifying the offending path, and no file is written
