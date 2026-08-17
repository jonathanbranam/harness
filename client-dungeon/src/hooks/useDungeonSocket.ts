import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessageEntry, ToolCallEntry as SharedToolCallEntry } from '@harness/ui'
import { genId } from '../id'

export type { ChatMessageEntry }

export interface ApprovalRequest {
  toolCallId: string
  toolName: string
  input: unknown
}

// Duplicated from dungeon-harness-server/src/board-engine/types.ts (no
// shared `packages/` tier yet — see CLAUDE.md's "No packages/ tier yet");
// keep this shape in sync with the server's BoardState/PlacedUnit types by
// hand.

export type Archetype = 'melee' | 'rogue' | 'ranger' | 'magic-user' | 'short-range' | 'long-range'
export type Faction = 'pc' | 'npc'
export type Direction = 'up' | 'down' | 'left' | 'right'
export type TerrainType = 'plains' | 'forest' | 'water' | 'stone'

export interface UnitDef {
  maxHp: number
  movement: { range: number }
  attack: {
    damage: number
    targeting: { mode: 'direction'; arc: 'cardinal'; minRange: number; maxRange: number }
    propagation: { shape: 'single' | 'line' | 'plus'; penetration: 'none' | 'stop_at_first' }
  }
}

export interface Cell {
  col: number
  row: number
}

export interface PlacedUnit {
  id: string
  archetype: Archetype
  faction: Faction
  position: Cell
  unitDef: UnitDef
}

export interface BoardCell {
  terrain: TerrainType
}

export interface BoardState {
  width: number
  height: number
  cells: BoardCell[][]
  units: PlacedUnit[]
}

export interface ToolCallEntry extends SharedToolCallEntry {
  /** The tool's raw `details` value (event.result), not just resultSummary's truncated string — BoardCanvas's movement/attack preview overlay reads dungeon_preview_movement/dungeon_preview_attack results from here (see findLatestPreview below). */
  result?: unknown
}

export type TranscriptEntry = ChatMessageEntry | ToolCallEntry

export interface MovementPreviewResult {
  path: Cell[]
}

export interface AttackPreviewResult {
  footprint: Cell[]
  hits: Cell[]
}

/** Scans the transcript backwards for the most recent successful dungeon_preview_movement/dungeon_preview_attack result, so BoardCanvas can overlay whichever preview the agent (or a direct tool call) computed last. */
export function findLatestPreview(transcript: TranscriptEntry[], toolName: 'dungeon_preview_movement' | 'dungeon_preview_attack'): unknown {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const entry = transcript[i]
    if (entry.kind !== 'tool' || entry.toolName !== toolName || entry.status !== 'done') continue
    if (!entry.result || typeof entry.result !== 'object' || 'error' in entry.result) continue
    return entry.result
  }
  return undefined
}

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
 * streaming + tool call status), and surfaces pending permission-gate
 * approvals. See websocket.ts on the server for the message protocol this
 * speaks — trimmed from client-deck's useDeckSocket per design.md's decision
 * (no DeckState, no canvasRef/render-request handling, no shape/image/deck/
 * slide senders).
 */
export function useDungeonSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const streamingIdRef = useRef<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null)
  const [boardState, setBoardState] = useState<BoardState | null>(null)

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)

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
        setBoardState(msg.state as BoardState)
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
    sendPrompt,
    respondApproval,
  }
}
