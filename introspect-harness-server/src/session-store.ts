import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createAgentSession, DefaultResourceLoader, getAgentDir, ModelRuntime, SessionManager, type AgentSession } from '@earendil-works/pi-coding-agent'
import { env } from './env'
import { ensureAgentWorkspace } from './agent-workspace'
import { DEFAULT_SEED, resetWorkspaceToSeed } from './workspace-seed'
import { introspectionBridge } from './pi-extensions/introspection-bridge'
import { createPermissionGateExtension } from './pi-extensions/permission-gate'
import { createRecordingWriter, listRecordings, type RecordingWriter } from './recording-writer'
import { createReplayEngine, type ReplayEngine, type ReplayStep } from './replay-engine'
import { sandboxTracker } from './workspace-manager'
import type { RecordingHeader, RecordingSummary } from './recording-types'

const TEMPLATES_DIR = join(import.meta.dirname, '..', 'templates', 'agent-workspace')
const SEEDS_DIR = join(import.meta.dirname, '..', 'templates', 'seeds')

const modelRuntimePromise = ModelRuntime.create()

const sessions = new Map<string, HarnessSession>()

const ALLOWED_TOOLS = ['read', 'bash', 'write', 'edit', 'grep', 'find', 'ls'] as const

export type SessionMode = 'live' | 'replay'

export interface HarnessSession {
  session: AgentSession
  events: EventEmitter
  recordingWriter: RecordingWriter
  replayEngine: ReplayEngine
  mode: SessionMode
}

export async function getOrCreateSession(sessionId: string): Promise<HarnessSession> {
  const existing = sessions.get(sessionId)
  if (existing) return existing

  // New session: reset the sandbox to the default seed's file set before
  // layering the base workspace template back in, so every new session
  // starts from a known, reproducible state. Reconnecting to an existing
  // session returns above and never reaches this reset.
  resetWorkspaceToSeed(env.INTROSPECT_WORKSPACE_DIR, SEEDS_DIR, DEFAULT_SEED)
  const cwd = ensureAgentWorkspace(env.INTROSPECT_WORKSPACE_DIR, TEMPLATES_DIR)
  // Scratch space outside the snapshot/replay system — not seeded, not reset
  // between sessions, just ensured to exist. See design.md's "No reset-to-seed
  // for the temp directory" decision.
  mkdirSync(env.INTROSPECT_TMP_DIR, { recursive: true })
  const modelRuntime = await modelRuntimePromise
  const events = new EventEmitter()
  const recordingWriter = createRecordingWriter(env.RECORDINGS_DIR)

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    extensionFactories: [
      introspectionBridge(events, recordingWriter, cwd),
      createPermissionGateExtension({ cwd, tempDir: env.INTROSPECT_TMP_DIR }),
    ],
  })
  await resourceLoader.reload()

  const { session } = await createAgentSession({
    modelRuntime,
    sessionManager: SessionManager.create(cwd),
    cwd,
    resourceLoader,
    tools: [...ALLOWED_TOOLS],
  })

  const raced = sessions.get(sessionId)
  if (raced) {
    session.dispose()
    return raced
  }

  const harnessSession: HarnessSession = {
    session,
    events,
    recordingWriter,
    replayEngine: createReplayEngine(env.RECORDINGS_DIR),
    mode: 'live',
  }
  sessions.set(sessionId, harnessSession)
  sandboxTracker.setOwner({ kind: 'live', sessionId })
  console.log(`[session] created ${sessionId}`)
  return harnessSession
}

export function disposeSession(sessionId: string) {
  const harnessSession = sessions.get(sessionId)
  if (!harnessSession) return
  harnessSession.session.dispose()
  sessions.delete(sessionId)
  console.log(`[session] disposed ${sessionId}`)
}

/**
 * Tears down the current live session (if any) for `sessionId` and creates a
 * fresh one under the same auth token, without requiring the user to log out
 * — same reset-to-seed + re-ensure-template path `getOrCreateSession` takes
 * for a brand-new token, just triggerable on demand for testing/iteration.
 */
export async function resetSession(sessionId: string): Promise<HarnessSession> {
  const existing = sessions.get(sessionId)
  if (existing) {
    if (existing.recordingWriter.isRecording()) await existing.recordingWriter.stop()
    existing.session.dispose()
    sessions.delete(sessionId)
    console.log(`[session] reset ${sessionId}`)
  }
  return getOrCreateSession(sessionId)
}

export interface RecordingStatus {
  recording: boolean
  recordingId?: string
}

export async function startRecording(sessionId: string, name: string): Promise<RecordingStatus> {
  const hs = sessions.get(sessionId)
  if (!hs) throw new Error('No active session')
  const recordingId = randomUUID()
  await hs.recordingWriter.start(recordingId, name)
  // First checkpoint reflects the sandbox's current state, whatever that is —
  // recording can start mid-session, not only at session start.
  await hs.recordingWriter.snapshot(env.INTROSPECT_WORKSPACE_DIR)
  return { recording: true, recordingId }
}

export async function stopRecording(sessionId: string): Promise<RecordingStatus> {
  const hs = sessions.get(sessionId)
  if (!hs) return { recording: false }
  await hs.recordingWriter.stop()
  return { recording: false }
}

export function getRecordingStatus(sessionId: string): RecordingStatus {
  const hs = sessions.get(sessionId)
  if (!hs) return { recording: false }
  return { recording: hs.recordingWriter.isRecording(), recordingId: hs.recordingWriter.currentRecordingId() }
}

export function listAllRecordings(): RecordingSummary[] {
  return listRecordings(env.RECORDINGS_DIR)
}

export async function enterReplayMode(sessionId: string, recordingId: string): Promise<RecordingHeader> {
  const hs = sessions.get(sessionId)
  if (!hs) throw new Error('No active session')
  const header = await hs.replayEngine.load(recordingId)
  hs.mode = 'replay'
  return header
}

export function exitReplayMode(sessionId: string): void {
  const hs = sessions.get(sessionId)
  if (!hs) return
  hs.mode = 'live'
  sandboxTracker.setOwner({ kind: 'live', sessionId })
}

export function getMode(sessionId: string): SessionMode {
  return sessions.get(sessionId)?.mode ?? 'live'
}

export async function replayStepTo(sessionId: string, targetIndex: number): Promise<ReplayStep> {
  const hs = sessions.get(sessionId)
  if (!hs) throw new Error('No active session')
  return hs.replayEngine.stepTo(targetIndex, env.INTROSPECT_WORKSPACE_DIR)
}

export async function replayJumpToCheckpoint(sessionId: string, checkpointIndex: number): Promise<ReplayStep> {
  const hs = sessions.get(sessionId)
  if (!hs) throw new Error('No active session')
  return hs.replayEngine.jumpToCheckpoint(checkpointIndex, env.INTROSPECT_WORKSPACE_DIR)
}
