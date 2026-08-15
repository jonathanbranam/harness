// Per-connection WebSocket protocol: forwards pi's AgentSessionEvent stream
// and deck-state changes to the browser, and routes browser messages back to
// session.prompt() / the permission-gate approval flow — see the "Message
// flow" and "Approval flow for web UI" sections of
// docs/talks/deck-harness/planning.md.
//
// createDeckSocketHandlers() is called once per upgraded connection (see
// @hono/node-ws: the function passed to upgradeWebSocket runs per request),
// so all state closed over here (pendingApprovals, the unsubscribe handles)
// is naturally scoped to that one connection.

import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'
import type { WSContext, WSEvents } from 'hono/ws'
import { SESSION_COOKIE } from './auth'
import { type DeckState, editorStore } from './editor-state'
import type { ApprovalRequest, RequestApproval } from './pi-extensions/permission-gate'
import { getOrCreateSession } from './session-store'

type ClientMessage =
  | { type: 'prompt'; text: string }
  | { type: 'selection'; ids: string[] }
  | { type: 'approval_response'; toolCallId: string; approved: boolean }

type ServerMessage =
  | { type: 'history'; messages: unknown }
  | { type: 'agent_event'; event: unknown }
  | { type: 'deck_state'; state: DeckState }
  | { type: 'approval_required'; request: ApprovalRequest }
  | { type: 'error'; message: string }

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

export function createDeckSocketHandlers(c: Context): WSEvents {
  const token = getCookie(c, SESSION_COOKIE)

  const pendingApprovals = new Map<string, (approved: boolean) => void>()
  let ws: WSContext | undefined
  let unsubscribeDeck: (() => void) | undefined
  let unsubscribeAgent: (() => void) | undefined

  const requestApproval: RequestApproval = (request) =>
    new Promise((resolve) => {
      pendingApprovals.set(request.toolCallId, resolve)
      if (ws) safeSend(ws, { type: 'approval_required', request })
    })

  return {
    onOpen: async (_evt, socket) => {
      ws = socket
      // requireAuth gates the /ws route, so this should be unreachable, but
      // don't trust an upgraded socket with a stale/missing cookie.
      if (!token) {
        safeSend(socket, { type: 'error', message: 'Unauthorized' })
        socket.close()
        return
      }

      unsubscribeDeck = editorStore.subscribe((state) => safeSend(socket, { type: 'deck_state', state }))
      safeSend(socket, { type: 'deck_state', state: editorStore.getState() })

      try {
        const session = await getOrCreateSession(token, requestApproval)
        safeSend(socket, { type: 'history', messages: session.messages })
        unsubscribeAgent = session.subscribe((event) => safeSend(socket, { type: 'agent_event', event }))
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

      switch (msg.type) {
        case 'selection':
          editorStore.setSelection(msg.ids)
          return

        case 'approval_response':
          pendingApprovals.get(msg.toolCallId)?.(msg.approved)
          pendingApprovals.delete(msg.toolCallId)
          return

        case 'prompt': {
          try {
            const session = await getOrCreateSession(token, requestApproval)
            await session.prompt(msg.text, session.isStreaming ? { streamingBehavior: 'steer' } : undefined)
          } catch (err) {
            safeSend(socket, { type: 'error', message: err instanceof Error ? err.message : 'Prompt failed' })
          }
          return
        }
      }
    },

    onClose: () => {
      unsubscribeDeck?.()
      unsubscribeAgent?.()
      // Deny anything still pending so the agent doesn't hang forever
      // waiting on a browser tab that just went away.
      for (const resolve of pendingApprovals.values()) resolve(false)
      pendingApprovals.clear()
    },
  }
}
