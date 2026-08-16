import type { Context } from 'hono'
import type { WSContext, WSEvents } from 'hono/ws'
import {
  enterReplayMode,
  exitReplayMode,
  getMode,
  getOrCreateSession,
  getRecordingStatus,
  listAllRecordings,
  replayJumpToCheckpoint,
  replayStepTo,
  startRecording,
  stopRecording,
  type HarnessSession,
} from './session-store'
import { sandboxTracker } from './workspace-manager'
import type { ReplayStep } from './replay-engine'

type ClientMessage =
  | { type: 'prompt'; text: string }
  | { type: 'start_recording'; name?: string }
  | { type: 'stop_recording' }
  | { type: 'list_recordings' }
  | { type: 'replay_load'; recordingId: string }
  | { type: 'replay_step'; direction?: 'forward' | 'backward' }
  | { type: 'replay_jump'; checkpointIndex: number }
  | { type: 'replay_play' }
  | { type: 'replay_pause' }
  | { type: 'replay_exit' }

type ServerMessage = { type: 'error'; message: string } | Record<string, unknown>

/** How often `replay_play` advances one event, in ms. Simple fixed pace — see design.md's "keep the timeline simple" note. */
const REPLAY_PLAY_INTERVAL_MS = 800

function safeSend(ws: WSContext, msg: ServerMessage) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg))
}

function parseClientMessage(raw: unknown): ClientMessage | undefined {
  try {
    const msg = JSON.parse(String(raw))
    if (msg && typeof msg === 'object' && typeof msg.type === 'string') return msg as ClientMessage
  } catch {
    // fall through
  }
  return undefined
}

export function createIntrospectSocketHandlers(c: Context): WSEvents {
  const token = c.get('sessionToken')
  let ws: WSContext | undefined
  let harnessSession: HarnessSession | undefined
  let unsubscribe: (() => void) | undefined
  let playTimer: ReturnType<typeof setInterval> | undefined

  const forwardEvent = (event: unknown) => {
    if (ws) safeSend(ws, event as ServerMessage)
  }

  function attachListener(hs: HarnessSession) {
    if (unsubscribe) return
    unsubscribe = () => hs.events.off('event', forwardEvent)
    hs.events.on('event', forwardEvent)
  }

  function stopPlayback() {
    if (playTimer) {
      clearInterval(playTimer)
      playTimer = undefined
    }
  }

  function emitReplayStep(socket: WSContext, step: ReplayStep) {
    safeSend(socket, { type: 'replay_reset' })
    for (const event of step.events) safeSend(socket, event as ServerMessage)
    safeSend(socket, { type: 'replay_position', index: step.index, total: step.total })
    if (step.index >= step.total - 1) {
      stopPlayback()
      safeSend(socket, { type: 'replay_ended' })
    }
  }

  return {
    onOpen: async (_evt, socket) => {
      ws = socket
      if (!token) {
        safeSend(socket, { type: 'error', message: 'Unauthorized' })
        socket.close()
        return
      }

      try {
        harnessSession = await getOrCreateSession(token)
        attachListener(harnessSession)
        safeSend(socket, { type: 'mode', mode: getMode(token) })
        safeSend(socket, { type: 'recording_status', ...getRecordingStatus(token) })
      } catch (err) {
        console.error('[ws] failed to create session', err)
        safeSend(socket, { type: 'error', message: err instanceof Error ? err.message : 'Failed to start agent session' })
      }
    },

    onMessage: async (evt, socket) => {
      if (!token) return
      const msg = parseClientMessage(evt.data)
      if (!msg) {
        safeSend(socket, { type: 'error', message: 'Invalid message' })
        return
      }

      if (msg.type === 'prompt') {
        if (getMode(token) === 'replay') {
          safeSend(socket, { type: 'error', message: 'Cannot prompt while in replay mode; exit replay first' })
          return
        }
        try {
          const hs = harnessSession ?? (await getOrCreateSession(token))
          harnessSession = hs
          attachListener(hs)
          sandboxTracker.beginTurn()
          try {
            await hs.session.prompt(msg.text, hs.session.isStreaming ? { streamingBehavior: 'steer' } : undefined)
          } finally {
            sandboxTracker.endTurn()
          }
        } catch (err) {
          console.error('[ws] prompt failed', err)
          safeSend(socket, { type: 'error', message: err instanceof Error ? err.message : 'Prompt failed' })
        }
        return
      }

      if (msg.type === 'start_recording') {
        try {
          const status = await startRecording(token, msg.name?.trim() || `Recording ${new Date().toLocaleString()}`)
          safeSend(socket, { type: 'recording_status', ...status })
        } catch (err) {
          safeSend(socket, { type: 'error', message: err instanceof Error ? err.message : 'Failed to start recording' })
        }
        return
      }

      if (msg.type === 'stop_recording') {
        const status = await stopRecording(token)
        safeSend(socket, { type: 'recording_status', ...status })
        return
      }

      if (msg.type === 'list_recordings') {
        safeSend(socket, { type: 'recordings_list', recordings: listAllRecordings() })
        return
      }

      if (msg.type === 'replay_load') {
        try {
          stopPlayback()
          const header = await enterReplayMode(token, msg.recordingId)
          safeSend(socket, { type: 'replay_loaded', header })
          const step = await replayJumpToCheckpoint(token, 0)
          emitReplayStep(socket, step)
        } catch (err) {
          safeSend(socket, { type: 'error', message: err instanceof Error ? err.message : 'Failed to load recording' })
        }
        return
      }

      if (msg.type === 'replay_step') {
        try {
          const hs = harnessSession
          const delta = msg.direction === 'backward' ? -1 : 1
          const nextIndex = (hs?.replayEngine.getCurrentIndex() ?? -1) + delta
          const step = await replayStepTo(token, nextIndex)
          emitReplayStep(socket, step)
        } catch (err) {
          safeSend(socket, { type: 'error', message: err instanceof Error ? err.message : 'Replay step failed' })
        }
        return
      }

      if (msg.type === 'replay_jump') {
        try {
          const step = await replayJumpToCheckpoint(token, msg.checkpointIndex)
          emitReplayStep(socket, step)
        } catch (err) {
          safeSend(socket, { type: 'error', message: err instanceof Error ? err.message : 'Replay jump failed' })
        }
        return
      }

      if (msg.type === 'replay_play') {
        stopPlayback()
        playTimer = setInterval(() => {
          const hs = harnessSession
          const nextIndex = (hs?.replayEngine.getCurrentIndex() ?? -1) + 1
          replayStepTo(token, nextIndex)
            .then((step) => emitReplayStep(socket, step))
            .catch((err) => {
              stopPlayback()
              safeSend(socket, { type: 'error', message: err instanceof Error ? err.message : 'Replay playback failed' })
            })
        }, REPLAY_PLAY_INTERVAL_MS)
        return
      }

      if (msg.type === 'replay_pause') {
        stopPlayback()
        return
      }

      if (msg.type === 'replay_exit') {
        stopPlayback()
        exitReplayMode(token)
        safeSend(socket, { type: 'mode', mode: 'live' })
        return
      }
    },

    onClose: () => {
      stopPlayback()
      unsubscribe?.()
    },
  }
}
