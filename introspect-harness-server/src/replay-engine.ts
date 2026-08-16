// Loads a recording and steps through it deterministically: restores the
// sandbox from the nearest preceding checkpoint, then re-emits the recorded
// browser-facing events up to the target position. Never touches
// ModelRuntime or AgentSession — replay makes no LLM calls, ever.

import { readRecordingEvents, readRecordingHeader, recordingGitDir } from './recording-writer'
import { sandboxTracker, type SandboxOwner } from './workspace-manager'
import { RECORDING_INTERNAL_EVENT_TYPES, type RecordingCheckpoint, type RecordingEvent, type RecordingHeader } from './recording-types'

export interface ReplayStep {
  /** Filtered, browser-facing events from index 0 through `index`, to re-emit in order. */
  events: RecordingEvent[]
  index: number
  total: number
}

export interface ReplayEngine {
  load(recordingId: string): Promise<RecordingHeader>
  /** Restores the sandbox and returns the full replayed-event prefix for `targetIndex`, clamped to the recording's bounds. */
  stepTo(targetIndex: number, sandboxPath: string): Promise<ReplayStep>
  jumpToCheckpoint(checkpointIndex: number, sandboxPath: string): Promise<ReplayStep>
  getHeader(): RecordingHeader | undefined
  getCurrentIndex(): number
  getTotalEvents(): number
}

function findCheckpointFor(header: RecordingHeader, eventIndex: number): RecordingCheckpoint | undefined {
  let best: RecordingCheckpoint | undefined
  for (const checkpoint of header.checkpoints) {
    if (checkpoint.index <= eventIndex && (!best || checkpoint.index > best.index)) best = checkpoint
  }
  return best
}

export function createReplayEngine(recordingsDir: string): ReplayEngine {
  let current:
    | {
        recordingId: string
        header: RecordingHeader
        events: RecordingEvent[]
        gitDir: string
        currentIndex: number
        lastRestoredCommit: string | undefined
      }
    | undefined

  async function load(recordingId: string): Promise<RecordingHeader> {
    const header = readRecordingHeader(recordingsDir, recordingId)
    const events = readRecordingEvents(recordingsDir, recordingId)
    current = {
      recordingId,
      header,
      events,
      gitDir: recordingGitDir(recordingsDir, recordingId),
      currentIndex: -1,
      lastRestoredCommit: undefined,
    }
    return header
  }

  async function stepTo(targetIndex: number, sandboxPath: string): Promise<ReplayStep> {
    if (!current) throw new Error('No recording loaded')
    const clamped = Math.max(0, Math.min(targetIndex, current.events.length - 1))
    const checkpoint = findCheckpointFor(current.header, clamped)
    if (!checkpoint) throw new Error('No checkpoint at or before this position')

    // Restoring is a full-replace checkout (see workspace-manager.restoreSnapshot), so
    // skip it when we're already sitting on this checkpoint's commit — pure optimization,
    // determinism does not depend on it.
    if (current.lastRestoredCommit !== checkpoint.commitHash) {
      const owner: SandboxOwner = { kind: 'recording', recordingId: current.recordingId, commitHash: checkpoint.commitHash }
      await sandboxTracker.swap(sandboxPath, current.gitDir, checkpoint.commitHash, owner)
      current.lastRestoredCommit = checkpoint.commitHash
    }

    const events = current.events.slice(0, clamped + 1).filter((event) => !RECORDING_INTERNAL_EVENT_TYPES.has(event.type))
    current.currentIndex = clamped
    return { events, index: clamped, total: current.events.length }
  }

  async function jumpToCheckpoint(checkpointIndex: number, sandboxPath: string): Promise<ReplayStep> {
    if (!current) throw new Error('No recording loaded')
    const checkpoint = current.header.checkpoints[checkpointIndex]
    if (!checkpoint) throw new Error(`No checkpoint at index ${checkpointIndex}`)
    return stepTo(checkpoint.index, sandboxPath)
  }

  return {
    load,
    stepTo,
    jumpToCheckpoint,
    getHeader: () => current?.header,
    getCurrentIndex: () => current?.currentIndex ?? -1,
    getTotalEvents: () => current?.events.length ?? 0,
  }
}
