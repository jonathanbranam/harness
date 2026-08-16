// On-disk recording format. See docs/recording-format.md for the full
// reference (directory layout, event types, checkpoint semantics).

/** Any event `introspection-bridge.ts` forwards to the browser (session/agent/turn/message/tool/foundation/usage events). */
export interface ForwardedLifecycleEvent {
  type: string
  [key: string]: unknown
}

/** Recording-internal marker: the first event in a recording, before any forwarded lifecycle events. */
export interface RecordingStartEvent {
  type: 'recording_start'
  recordingId: string
  startedAt: string
}

/** Recording-internal marker: a sandbox file snapshot was captured and committed. Never sent to the browser during a live session. */
export interface FsSnapshotEvent {
  type: 'fs_snapshot'
  commitHash: string
  createdAt: string
}

export type RecordingEvent = RecordingStartEvent | FsSnapshotEvent | ForwardedLifecycleEvent

/** Event types that are recording-internal bookkeeping, not real browser events — filtered out when replay re-emits events. */
export const RECORDING_INTERNAL_EVENT_TYPES = new Set<RecordingEvent['type']>(['recording_start', 'fs_snapshot'])

/** A snapshot checkpoint: the sandbox's file state as of a specific position in `events.jsonl`. */
export interface RecordingCheckpoint {
  /** 0-based index into `events.jsonl` of this checkpoint's `fs_snapshot` event. */
  index: number
  commitHash: string
  createdAt: string
}

/** `<recordingsDir>/<recordingId>/header.json` */
export interface RecordingHeader {
  id: string
  name: string
  createdAt: string
  stoppedAt?: string
  checkpoints: RecordingCheckpoint[]
}

/** Summary used for the recordings list/picker — same fields as `RecordingHeader` minus checkpoint detail. */
export interface RecordingSummary {
  id: string
  name: string
  createdAt: string
  stoppedAt?: string
  checkpointCount: number
}
