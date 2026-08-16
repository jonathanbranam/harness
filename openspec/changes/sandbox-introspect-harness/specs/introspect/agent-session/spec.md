## ADDED Requirements

### Requirement: Session history persists to disk
The system SHALL persist each `AgentSession`'s history to a `.jsonl` session log on disk, rather than discarding it when the session is disposed or the process restarts.

#### Scenario: Session log survives disposal
- **WHEN** an `AgentSession` is disposed (e.g. on logout)
- **THEN** its session log file remains on disk and contains the full turn history

#### Scenario: Session log survives restart
- **WHEN** the server process restarts
- **THEN** session log files created by earlier sessions remain on disk and are not deleted
