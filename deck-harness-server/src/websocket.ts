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
import { type DeckState, editorStore, type UpdateActionCall } from './editor-state'
import type { ApprovalRequest, RequestApproval } from './pi-extensions/permission-gate'
import type { RenderRequest, RenderResult, RequestRender } from './pi-extensions/slide-visual-inspection'
import { getOrCreateSession } from './session-store'

const RENDER_TIMEOUT_MS = 15_000

type ClientMessage =
  | { type: 'prompt'; text: string }
  | { type: 'selection'; ids: string[] }
  | { type: 'object_update'; actions: UpdateActionCall[] }
  | { type: 'approval_response'; toolCallId: string; approved: boolean }
  | { type: 'select_deck'; deckId: string }
  | { type: 'create_deck'; name: string }
  | { type: 'delete_deck'; deckId: string }
  | { type: 'rename_deck'; deckId: string; name: string }
  | { type: 'add_slide' }
  | { type: 'remove_slide'; slideId: string }
  | { type: 'select_slide'; slideId: string }
  | { type: 'render_response'; requestId: string; image?: string; error?: string }

type ServerMessage =
  | { type: 'history'; messages: unknown }
  | { type: 'agent_event'; event: unknown }
  | { type: 'deck_state'; state: DeckState }
  | { type: 'approval_required'; request: ApprovalRequest }
  | { type: 'render_request'; request: RenderRequest }
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
  const pendingRenders = new Map<string, (result: RenderResult) => void>()
  let ws: WSContext | undefined
  let unsubscribeDeck: (() => void) | undefined
  let unsubscribeAgent: (() => void) | undefined

  const requestApproval: RequestApproval = (request) =>
    new Promise((resolve) => {
      pendingApprovals.set(request.toolCallId, resolve)
      if (ws) safeSend(ws, { type: 'approval_required', request })
    })

  // Mirrors requestApproval's pending-map pattern (see permission-gate.ts),
  // plus a timeout since a render round trip depends on the originating
  // browser tab's main thread staying responsive (design.md's render-request
  // risk/mitigation).
  const requestRender: RequestRender = (request) =>
    new Promise((resolve) => {
      if (!ws) {
        resolve({ ok: false, error: 'No browser connection to render from' })
        return
      }
      const timeout = setTimeout(() => {
        if (pendingRenders.delete(request.requestId)) resolve({ ok: false, error: 'Render request timed out' })
      }, RENDER_TIMEOUT_MS)
      pendingRenders.set(request.requestId, (result) => {
        clearTimeout(timeout)
        resolve(result)
      })
      safeSend(ws, { type: 'render_request', request })
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
        const session = await getOrCreateSession(token, { requestApproval, requestRender })
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

        // User-originated edits (drag, resize, in-place text editing,
        // formatting toolbar) go through the exact same applyUpdate call the
        // presentation_update tool uses, so id-scoping/validation and
        // mutation behavior never diverge between the two actors — see
        // design.md's "One mutation path, reused by both actors". Actions
        // apply in order within one batch so a formatting op can commit a
        // setText immediately before an applyTextStyle addressed against it.
        case 'object_update': {
          for (const call of msg.actions) {
            const result = editorStore.applyUpdate(call.action, call.targetIds, call.args ?? {})
            if (result.errors.length > 0) safeSend(socket, { type: 'error', message: result.errors.join('; ') })
          }
          return
        }

        case 'approval_response':
          pendingApprovals.get(msg.toolCallId)?.(msg.approved)
          pendingApprovals.delete(msg.toolCallId)
          return

        case 'render_response': {
          const resolve = pendingRenders.get(msg.requestId)
          if (!resolve) return
          pendingRenders.delete(msg.requestId)
          resolve(msg.image ? { ok: true, dataUrl: msg.image } : { ok: false, error: msg.error ?? 'Render failed' })
          return
        }

        case 'select_deck': {
          const result = editorStore.selectDeck(msg.deckId)
          if (!result.ok) safeSend(socket, { type: 'error', message: result.error! })
          return
        }

        case 'create_deck':
          editorStore.createDeck(msg.name)
          return

        case 'delete_deck': {
          const result = editorStore.deleteDeck(msg.deckId)
          if (!result.ok) safeSend(socket, { type: 'error', message: result.error! })
          return
        }

        case 'rename_deck': {
          const result = editorStore.renameDeck(msg.deckId, msg.name)
          if (!result.ok) safeSend(socket, { type: 'error', message: result.error! })
          return
        }

        case 'add_slide':
          editorStore.addSlide()
          return

        case 'remove_slide': {
          const result = editorStore.removeSlide(msg.slideId)
          if (!result.ok) safeSend(socket, { type: 'error', message: result.error! })
          return
        }

        case 'select_slide': {
          const result = editorStore.selectSlide(msg.slideId)
          if (!result.ok) safeSend(socket, { type: 'error', message: result.error! })
          return
        }

        case 'prompt': {
          try {
            // rebind: this connection is about to originate a new agent
            // turn, so any tool calls during it (approvals, slide_view
            // renders) must route here — see session-store.ts's
            // getOrCreateSession doc comment.
            const session = await getOrCreateSession(token, { requestApproval, requestRender }, { rebind: true })
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
      // Deny/fail anything still pending so the agent doesn't hang forever
      // waiting on a browser tab that just went away.
      for (const resolve of pendingApprovals.values()) resolve(false)
      pendingApprovals.clear()
      for (const resolve of pendingRenders.values()) resolve({ ok: false, error: 'Browser connection closed' })
      pendingRenders.clear()
    },
  }
}
