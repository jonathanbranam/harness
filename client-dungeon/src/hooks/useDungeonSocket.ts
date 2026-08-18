import { captureNode, type ChatMessageEntry, type ToolCallEntry as SharedToolCallEntry } from '@harness/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CELL_SIZE } from '../components/BoardCanvas'
import { genId } from '../id'

export type { ChatMessageEntry }

export interface ApprovalRequest {
  toolCallId: string
  toolName: string
  input: unknown
}

// Duplicated from dungeon-harness-server/src/board-state.ts (no shared
// `packages/` tier yet — see CLAUDE.md's "No packages/ tier yet"); keep this
// shape in sync with the server's BoardState/BoardObject types by hand.

export interface Cell {
  col: number
  row: number
}

export interface Point {
  x: number
  y: number
}

export interface BoardCell {
  fillColor: string
}

export interface CircleShape {
  id: string
  kind: 'shape'
  shapeType: 'circle'
  position: Point
  radius: number
  color: string
  label?: string
}

export interface RectangleShape {
  id: string
  kind: 'shape'
  shapeType: 'rectangle'
  position: Point
  width: number
  height: number
  color: string
  label?: string
}

export type ShapeObject = CircleShape | RectangleShape

export interface LineObject {
  id: string
  kind: 'line'
  points: Point[]
  color: string
  style: 'solid' | 'dashed'
}

export interface OverlayObject {
  id: string
  kind: 'overlay'
  cells: Cell[]
  color: string
}

export interface LabelObject {
  id: string
  kind: 'label'
  position: Point
  text: string
  color: string
}

export type BoardObject = ShapeObject | LineObject | OverlayObject | LabelObject

export interface BoardState {
  width: number
  height: number
  cells: BoardCell[][]
  objects: BoardObject[]
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
 * and (per extract-shared-canvas-capture) answers board-render requests
 * backing the dungeon_board_view pi tool via the shared captureNode utility.
 * See websocket.ts on the server for the message protocol this speaks —
 * trimmed from client-deck's useDeckSocket per design.md's decision (no
 * DeckState, no shape/image/deck/slide senders).
 */
export function useDungeonSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const streamingIdRef = useRef<string | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [connected, setConnected] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null)
  const [boardState, setBoardState] = useState<BoardState | null>(null)
  // ws.onmessage's handleRenderRequest closes over the effect's first run
  // (deps: []), so it can't read the `boardState` state variable directly —
  // this ref is kept in sync with every board_state message instead, mirroring
  // canvasRef's own ref-not-state pattern for the same reason.
  const boardStateRef = useRef<BoardState | null>(null)

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)

    // Renders the DOM node captured by canvasRef and returns the result to
    // the server over this same connection — see websocket.ts's
    // requestRender/pendingRenders, which backs the dungeon_board_view pi
    // tool. Mirrors client-deck's useDeckSocket.ts handleRenderRequest, but
    // BoardCanvas has no scale-to-fit transform to defeat, so no style
    // override is needed.
    async function handleRenderRequest(requestId: string) {
      const node = canvasRef.current
      const board = boardStateRef.current
      if (!node || !board) {
        ws.send(JSON.stringify({ type: 'render_response', requestId, error: 'Board not mounted' }))
        return
      }
      try {
        const image = await captureNode(node, { width: board.width * CELL_SIZE, height: board.height * CELL_SIZE })
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

      if (msg.type === 'board_state') {
        boardStateRef.current = msg.state as BoardState
        setBoardState(msg.state as BoardState)
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
        // ... }) — the JSON-serializable value board-bridge.ts's execute()
        // functions return is its "details" field.
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

  const respondApproval = useCallback((toolCallId: string, approved: boolean) => {
    wsRef.current?.send(JSON.stringify({ type: 'approval_response', toolCallId, approved }))
    setPendingApproval(null)
  }, [])

  return {
    connected,
    transcript,
    pendingApproval,
    boardState,
    canvasRef,
    sendPrompt,
    respondApproval,
  }
}
