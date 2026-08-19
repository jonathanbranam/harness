import { captureNode, type ChatMessageEntry, type ToolCallEntry as SharedToolCallEntry } from '@harness/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BenchIntent, BenchState } from '../bench/types'
import { genId } from '../id'

export type { ChatMessageEntry }

export interface ApprovalRequest {
  toolCallId: string
  toolName: string
  input: unknown
}

export interface ToolCallEntry extends SharedToolCallEntry {
  /** The tool's raw `details` value (event.result), not just resultSummary's truncated string. */
  result?: unknown
}

export type TranscriptEntry = ChatMessageEntry | ToolCallEntry

function summarize(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.slice(0, 200)
  try {
    return JSON.stringify(value).slice(0, 200)
  } catch {
    return ''
  }
}

/**
 * Owns the single WebSocket connection to dungeon-harness-server: forwards
 * pi's AgentSessionEvent stream into a simplified chat transcript (text
 * streaming + tool call status), surfaces pending permission-gate approvals,
 * and answers render requests backing the dungeon_board_view pi tool via the
 * shared captureNode utility. See websocket.ts on the server for the message
 * protocol this speaks.
 *
 * Bench state arrives here whenever the server's `BenchStore` changes — from a
 * designer's click or from an agent tool call, which are the same path — and
 * intents go back the other way. The client never computes a rule; it renders
 * what the engine produced. `canvasRef` points at the board, so
 * `dungeon_board_view` captures exactly what the designer is looking at.
 */
export function useDungeonSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const streamingIdRef = useRef<string | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [connected, setConnected] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null)
  const [benchState, setBenchState] = useState<BenchState | null>(null)
  const [benchError, setBenchError] = useState<string | null>(null)

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)

    // Renders the DOM node captured by canvasRef and returns the result to
    // the server over this same connection — see websocket.ts's
    // requestRender/pendingRenders, which backs the dungeon_board_view pi
    // tool. The capture size comes from the node's own layout box, so
    // whatever the bench mounts on this ref captures at its rendered size
    // with no scale-to-fit transform to defeat.
    async function handleRenderRequest(requestId: string) {
      const node = canvasRef.current
      if (!node) {
        ws.send(JSON.stringify({ type: 'render_response', requestId, error: 'Nothing mounted to capture' }))
        return
      }
      try {
        const { width, height } = node.getBoundingClientRect()
        const image = await captureNode(node, { width: Math.round(width), height: Math.round(height) })
        ws.send(JSON.stringify({ type: 'render_response', requestId, image }))
      } catch (err) {
        ws.send(JSON.stringify({ type: 'render_response', requestId, error: err instanceof Error ? err.message : 'Render failed' }))
      }
    }

    ws.onmessage = (evt) => {
      let msg: { type: string; [key: string]: unknown }
      try {
        msg = JSON.parse(evt.data)
      } catch {
        return
      }

      if (msg.type === 'approval_required') {
        setPendingApproval(msg.request as ApprovalRequest)
        return
      }

      if (msg.type === 'bench_state') {
        setBenchState(msg.state as BenchState)
        setBenchError(null)
        return
      }

      if (msg.type === 'bench_error') {
        // The engine refusing an action is information, not a fault: it means
        // the move or attack genuinely isn't legal.
        setBenchError(msg.message as string)
        return
      }

      if (msg.type === 'render_request') {
        const request = msg.request as { requestId: string }
        void handleRenderRequest(request.requestId)
        return
      }

      if (msg.type === 'error') {
        setTranscript((t) => [...t, { kind: 'message', id: genId(), role: 'assistant', text: `⚠ ${msg.message as string}` }])
        return
      }

      if (msg.type === 'agent_event') {
        handleAgentEvent(msg.event as Record<string, unknown>)
      }

      // 'history' (session.messages on reconnect) is intentionally not
      // replayed into the transcript — pi's AgentMessage content shape isn't
      // part of the public SDK surface documented for this purpose, so
      // reconnects start a fresh transcript view onto the same live session
      // rather than risk mis-rendering it. The agent's own state is
      // unaffected either way.
    }

    function handleAgentEvent(event: Record<string, unknown>) {
      const type = event.type as string

      if (type === 'message_start') {
        const message = event.message as { id?: string; role?: string } | undefined
        if (message?.role === 'assistant') {
          streamingIdRef.current = message.id ?? genId()
        }
        return
      }

      if (type === 'message_update') {
        const assistantEvent = event.assistantMessageEvent as { type?: string; delta?: string } | undefined
        if (assistantEvent?.type === 'text_delta' && streamingIdRef.current) {
          const id = streamingIdRef.current
          const delta = assistantEvent.delta ?? ''
          setTranscript((t) => {
            const existing = t.find((e) => e.kind === 'message' && e.id === id)
            if (existing) {
              return t.map((e) => (e.kind === 'message' && e.id === id ? { ...e, text: e.text + delta } : e))
            }
            // Some assistant turns emit whitespace-only text chunks (e.g. a
            // bare newline) between tool calls with no other text — skip
            // creating a bubble until a chunk has actual content, so those
            // don't show up as empty/blank bubbles.
            if (delta.trim() === '') return t
            return [...t, { kind: 'message', id, role: 'assistant', text: delta, streaming: true }]
          })
        }
        return
      }

      if (type === 'message_end') {
        const id = streamingIdRef.current
        if (id) {
          setTranscript((t) => t.map((e) => (e.kind === 'message' && e.id === id ? { ...e, streaming: false } : e)))
          streamingIdRef.current = null
        }
        return
      }

      if (type === 'tool_execution_start') {
        const toolCallId = event.toolCallId as string
        const toolName = event.toolName as string
        setTranscript((t) => [...t, { kind: 'tool', id: toolCallId, toolCallId, toolName, status: 'running' }])
        return
      }

      if (type === 'tool_execution_end') {
        const toolCallId = event.toolCallId as string
        const isError = event.isError as boolean | undefined
        const resultSummary = summarize(event.result)
        // event.result is the tool's full AgentToolResult ({ content, details,
        // ... }) — the JSON-serializable value a tool's execute() returns is
        // its "details" field.
        const result = (event.result as { details?: unknown } | undefined)?.details
        setTranscript((t) =>
          t.map((e) => (e.kind === 'tool' && e.toolCallId === toolCallId ? { ...e, status: isError ? 'error' : 'done', resultSummary, result } : e)),
        )
      }
    }

    return () => ws.close()
  }, [])

  const sendPrompt = useCallback((text: string) => {
    setTranscript((t) => [...t, { kind: 'message', id: genId(), role: 'user', text }])
    wsRef.current?.send(JSON.stringify({ type: 'prompt', text }))
  }, [])

  const sendIntent = useCallback((intent: BenchIntent) => {
    setBenchError(null)
    wsRef.current?.send(JSON.stringify({ type: 'bench_intent', intent }))
  }, [])

  const respondApproval = useCallback((toolCallId: string, approved: boolean) => {
    wsRef.current?.send(JSON.stringify({ type: 'approval_response', toolCallId, approved }))
    setPendingApproval(null)
  }, [])

  return {
    connected,
    transcript,
    pendingApproval,
    benchState,
    benchError,
    canvasRef,
    sendPrompt,
    sendIntent,
    respondApproval,
  }
}
