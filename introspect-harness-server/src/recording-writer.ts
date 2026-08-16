import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSnapshot, initSnapshotRepo } from './workspace-manager'
import type { RecordingCheckpoint, RecordingEvent, RecordingHeader, RecordingSummary } from './recording-types'

function headerPath(dir: string): string {
  return join(dir, 'header.json')
}

function eventsPath(dir: string): string {
  return join(dir, 'events.jsonl')
}

function gitDirFor(dir: string): string {
  return join(dir, 'snapshots.git')
}

function writeHeader(dir: string, header: RecordingHeader): void {
  writeFileSync(headerPath(dir), JSON.stringify(header, null, 2))
}

/**
 * Writes one recording's events + snapshots. One instance per live
 * `HarnessSession` (not a module-level singleton) so concurrent sessions
 * never cross-wire recordings — same reasoning as `permission-gate.ts`'s
 * per-session factory pattern.
 */
export interface RecordingWriter {
  start(recordingId: string, name: string): Promise<void>
  appendEvent(event: RecordingEvent): void
  /** Captures the sandbox's current file state as a new checkpoint. No-ops (returns undefined) when not recording. */
  snapshot(sandboxPath: string): Promise<string | undefined>
  stop(): Promise<void>
  isRecording(): boolean
  currentRecordingId(): string | undefined
}

export function createRecordingWriter(recordingsDir: string): RecordingWriter {
  let current:
    | {
        recordingId: string
        dir: string
        header: RecordingHeader
        eventIndex: number
      }
    | undefined

  function appendEvent(event: RecordingEvent): void {
    if (!current) return
    appendFileSync(eventsPath(current.dir), JSON.stringify(event) + '\n')
    current.eventIndex += 1
  }

  async function start(recordingId: string, name: string): Promise<void> {
    const dir = join(recordingsDir, recordingId)
    mkdirSync(dir, { recursive: true })
    await initSnapshotRepo(gitDirFor(dir))
    const header: RecordingHeader = { id: recordingId, name, createdAt: new Date().toISOString(), checkpoints: [] }
    writeFileSync(eventsPath(dir), '')
    writeHeader(dir, header)
    current = { recordingId, dir, header, eventIndex: 0 }
    appendEvent({ type: 'recording_start', recordingId, startedAt: header.createdAt })
  }

  async function snapshot(sandboxPath: string): Promise<string | undefined> {
    if (!current) return undefined
    const commitHash = await createSnapshot(sandboxPath, gitDirFor(current.dir))
    const createdAt = new Date().toISOString()
    const checkpoint: RecordingCheckpoint = { index: current.eventIndex, commitHash, createdAt }
    current.header.checkpoints.push(checkpoint)
    writeHeader(current.dir, current.header)
    appendEvent({ type: 'fs_snapshot', commitHash, createdAt })
    return commitHash
  }

  async function stop(): Promise<void> {
    if (!current) return
    current.header.stoppedAt = new Date().toISOString()
    writeHeader(current.dir, current.header)
    current = undefined
  }

  return {
    start,
    appendEvent,
    snapshot,
    stop,
    isRecording: () => current !== undefined,
    currentRecordingId: () => current?.recordingId,
  }
}

/** Lists all recordings under `recordingsDir`, newest first. Skips any entry without a readable `header.json`. */
export function listRecordings(recordingsDir: string): RecordingSummary[] {
  if (!existsSync(recordingsDir)) return []
  const summaries: RecordingSummary[] = []
  for (const entry of readdirSync(recordingsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = join(recordingsDir, entry.name)
    try {
      const header: RecordingHeader = JSON.parse(readFileSync(headerPath(dir), 'utf8'))
      summaries.push({ id: header.id, name: header.name, createdAt: header.createdAt, stoppedAt: header.stoppedAt, checkpointCount: header.checkpoints.length })
    } catch {
      // Not a valid recording directory (missing/corrupt header.json) — skip it.
    }
  }
  summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return summaries
}

export function readRecordingHeader(recordingsDir: string, recordingId: string): RecordingHeader {
  return JSON.parse(readFileSync(headerPath(join(recordingsDir, recordingId)), 'utf8'))
}

export function readRecordingEvents(recordingsDir: string, recordingId: string): RecordingEvent[] {
  const raw = readFileSync(eventsPath(join(recordingsDir, recordingId)), 'utf8')
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as RecordingEvent)
}

export function recordingGitDir(recordingsDir: string, recordingId: string): string {
  return gitDirFor(join(recordingsDir, recordingId))
}
