import type { Context } from 'hono'
import type { WSContext, WSEvents } from 'hono/ws'
import { getOrCreateSession, type HarnessSession } from './session-store'

type ClientMessage = { type: 'prompt'; text: string }

type ServerMessage = { type: 'error'; message: string } | Record<string, unknown>

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

  const forwardEvent = (event: unknown) => {
    if (ws) safeSend(ws, event as ServerMessage)
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
        unsubscribe = () => harnessSession?.events.off('event', forwardEvent)
        harnessSession.events.on('event', forwardEvent)
      } catch (err) {
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
        try {
          const hs = harnessSession ?? (await getOrCreateSession(token))
          harnessSession = hs
          await hs.session.prompt(msg.text, hs.session.isStreaming ? { streamingBehavior: 'steer' } : undefined)
        } catch (err) {
          safeSend(socket, { type: 'error', message: err instanceof Error ? err.message : 'Prompt failed' })
        }
      }
    },

    onClose: () => {
      unsubscribe?.()
    },
  }
}
