# Recording Specification

## Purpose

Capture a live session's forwarded events and the sandbox workspace's file state over time into a durable recording, so the session can be replayed later without re-running the agent.

## Requirements

### Requirement: Recording toggle during a live session
The system SHALL let the user start and stop recording a live session at any point while it is active, without interrupting the session.

#### Scenario: Start recording mid-session
- **WHEN** the user enables recording during an already-active live session
- **THEN** the system begins persisting subsequent events and file snapshots to a new recording, starting from the sandbox workspace's current state

#### Scenario: Stop recording
- **WHEN** the user disables recording during an active live session
- **THEN** the system stops appending events and snapshots to the recording, and the recording remains available for replay up to that point

### Requirement: Recording captures forwarded lifecycle events
While recording is enabled, the system SHALL persist every event the live session forwards to the browser to the recording, in the order they occurred.

#### Scenario: Event recorded during live turn
- **WHEN** a lifecycle event is forwarded to the browser during a recorded live turn
- **THEN** the same event is appended to the recording

### Requirement: File snapshot at each turn boundary
While recording is enabled, the system SHALL capture a snapshot of the sandbox workspace's full file state when recording starts and at the end of each subsequent agent turn, and SHALL reference each snapshot from the recording.

#### Scenario: Turn completes while recording
- **WHEN** an agent turn completes while recording is enabled
- **THEN** a new snapshot of the sandbox workspace is captured and referenced in the recording

#### Scenario: Recording starts mid-session
- **WHEN** the user enables recording during an active live session
- **THEN** the sandbox workspace's current file state is captured as the recording's first snapshot

### Requirement: Snapshot storage does not duplicate unchanged file content
The system SHALL store file snapshots such that a file whose content is unchanged between two consecutive snapshots does not consume additional storage for that file's content.

#### Scenario: Unchanged file across snapshots
- **WHEN** a snapshot is captured and a file's content is identical to its content in the previous snapshot
- **THEN** the new snapshot does not store a duplicate copy of that file's content

### Requirement: Recordings persist on disk under a configured directory
The system SHALL persist each recording's event log and file snapshots under a server-configured recordings directory, separate from the sandbox workspace, so a recording survives the sandbox workspace being reset or reused by later sessions.

#### Scenario: Recording available after session ends
- **WHEN** a live session that was being recorded ends
- **THEN** the recording's event log and snapshots remain readable from the recordings directory

#### Scenario: Recording unaffected by sandbox reset
- **WHEN** the sandbox workspace is later reset to a different state (e.g. a new session's seed)
- **THEN** an existing recording's stored snapshots are unaffected and remain restorable
