// Per-connection WebSocket protocol: forwards pi's AgentSessionEvent stream and
// bench state to the browser, and routes browser messages back to
// session.prompt() / the permission-gate approval flow / the canvas-capture
// render round trip / the bench.
//
// The bench is per-session and authoritative: a designer's click arrives here as
// a `bench_intent` and goes through the same `BenchStore` the agent's tools call,
// so there is one board and one set of rules, never a client-side copy.
//
// createDungeonSocketHandlers() is called once per upgraded connection (see
// @hono/node-ws: the function passed to upgradeWebSocket runs per request),
// so all state closed over here (pendingApprovals, the unsubscribe handles)
// is naturally scoped to that one connection.

import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'
import type { WSContext, WSEvents } from 'hono/ws'
import { SESSION_COOKIE } from './auth'
import type { BenchState } from './bench/bench-store'
import { applyIntent, type BenchIntent } from './bench/intents'
import type { ApprovalRequest, RequestApproval } from './pi-extensions/permission-gate'
import type { RenderRequest, RenderResult, RequestRender } from './pi-extensions/board-visual-inspection'
import { getOrCreateBench, getOrCreateSession } from './session-store'

const RENDER_TIMEOUT_MS = 15_000

type ClientMessage =
  | { type: 'prompt'; text: string }
  | { type: 'bench_intent'; intent: BenchIntent }
  | { type: 'approval_response'; toolCallId: string; approved: boolean }
  | { type: 'render_response'; requestId: string; image?: string; error?: string }

type ServerMessage =
  | { type: 'history'; messages: unknown }
  | { type: 'agent_event'; event: unknown }
  | { type: 'bench_state'; state: BenchState }
  | { type: 'bench_error'; message: string }
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

export function createDungeonSocketHandlers(c: Context): WSEvents {
  const token = getCookie(c, SESSION_COOKIE)

  const pendingApprovals = new Map<string, (approved: boolean) => void>()
  const pendingRenders = new Map<string, (result: RenderResult) => void>()
  let ws: WSContext | undefined
  let unsubscribeAgent: (() => void) | undefined
  let unsubscribeBench: (() => void) | undefined

  const requestApproval: RequestApproval = (request) =>
    new Promise((resolve) => {
      pendingApprovals.set(request.toolCallId, resolve)
      if (ws) safeSend(ws, { type: 'approval_required', request })
    })

  // Mirrors requestApproval's pending-map pattern (see permission-gate.ts),
  // plus a timeout since a render round trip depends on the originating
  // browser tab's main thread staying responsive — mirrors deck-harness's
  // websocket.ts.
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

      try {
        // The bench first, so a reconnecting tab paints the current board
        // immediately rather than waiting for the next change.
        const bench = await getOrCreateBench(token, { requestApproval, requestRender })
        unsubscribeBench = bench.subscribe((state) => safeSend(socket, { type: 'bench_state', state }))
        safeSend(socket, { type: 'bench_state', state: bench.getState() })

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

        case 'bench_intent': {
          const bench = await getOrCreateBench(token, { requestApproval, requestRender })
          const result = applyIntent(bench, msg.intent)
          // A rejected intent is the engine saying "not legal", which the
          // designer needs to see — it is an answer, not a failure.
          if (!result.ok) safeSend(socket, { type: 'bench_error', message: result.error })
          return
        }

        case 'prompt': {
          try {
            // rebind: this connection is about to originate a new agent
            // turn, so any approval requests during it must route here —
            // see session-store.ts's getOrCreateSession doc comment.
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
      unsubscribeAgent?.()
      unsubscribeBench?.()
      // Deny/fail anything still pending so the agent doesn't hang forever
      // waiting on a browser tab that just went away.
      for (const resolve of pendingApprovals.values()) resolve(false)
      pendingApprovals.clear()
      for (const resolve of pendingRenders.values()) resolve({ ok: false, error: 'Browser connection closed' })
      pendingRenders.clear()
    },
  }
}
