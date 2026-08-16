## Purpose

Load a previously captured recording and reconstruct its session state step by step in the browser — restoring the sandbox workspace and re-emitting the recorded events — without invoking a language model.

## ADDED Requirements

### Requirement: Replay loads a recording without LLM calls
The system SHALL load a recording and step through its events without making any language model calls at any point during replay.

#### Scenario: Replay a recording
- **WHEN** a user selects a recording to replay
- **THEN** the system loads its event log and snapshot references and makes no LLM API calls for the remainder of the replay session

### Requirement: Stepping restores workspace and emits events
When the user steps replay to a given point in a recording, the system SHALL restore the sandbox workspace to that point's file state and emit the events the browser received during the live recording up to that point.

#### Scenario: Step to a checkpoint
- **WHEN** the user steps replay to a specific checkpoint in a recording
- **THEN** the sandbox workspace is restored to exactly the file state captured at that checkpoint's snapshot
- **THEN** the browser receives the same sequence of events the live session emitted up to that point

#### Scenario: Step forward within a turn
- **WHEN** the user steps replay forward through events between two checkpoints
- **THEN** the events are emitted to the browser in their recorded order at the user's controlled pace

### Requirement: Replay determinism
The system SHALL restore identical sandbox workspace file state and emit an identical event sequence for the same recording and the same replay position, regardless of how many times replay is run.

#### Scenario: Replay same recording twice
- **WHEN** the same recording is replayed to the same checkpoint on two separate occasions
- **THEN** the sandbox workspace's file state and the emitted event sequence are identical both times

### Requirement: Play/pause/step controls
The system SHALL let the user play, pause, and step forward through a loaded recording via the session timeline UI.

#### Scenario: User pauses playback
- **WHEN** the user pauses an in-progress replay
- **THEN** event emission stops until the user resumes, steps, or jumps to another point

#### Scenario: User jumps to a checkpoint
- **WHEN** the user selects a checkpoint from the timeline
- **THEN** the sandbox workspace and apparatus view update to reflect that checkpoint's state
