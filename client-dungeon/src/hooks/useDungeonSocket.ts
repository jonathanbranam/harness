import { useCallback, useEffect, useRef, useState } from 'react'
import { genId } from '../id'

export interface ApprovalRequest {
  toolCallId: string
  toolName: string
  input: unknown
}

export interface ChatMessageEntry {
  kind: 'message'
  id: string
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
}

export interface ToolCallEntry {
  kind: 'tool'
  id: string
  toolCallId: string
  toolName: string
  status: 'running' | 'done' | 'error'
  resultSummary?: string
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
        setTranscript((t) =>
          t.map((e) => (e.kind === 'tool' && e.toolCallId === toolCallId ? { ...e, status: isError ? 'error' : 'done', resultSummary } : e)),
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
    sendPrompt,
    respondApproval,
  }
}
