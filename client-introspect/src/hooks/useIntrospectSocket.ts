import { useCallback, useEffect, useRef, useState } from 'react'
import { genId } from '../id'

export type ContextBlock =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string; streaming?: boolean }
  | { id: string; role: 'system'; text: string }
  | { id: string; role: 'tool'; text: string; toolName: string; status?: 'running' | 'done' | 'error' }

export interface FoundationState {
  systemPrompt: string
  skills: Array<{ name: string; description: string; filePath: string }>
  guides: string[]
  sensors: string[]
}

export interface UsageState {
  tokens: number | null
  contextWindow: number
  percent: number | null
  estimatedCost: number
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

export function useIntrospectSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const streamingIdRef = useRef<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [blocks, setBlocks] = useState<ContextBlock[]>([])
  const [foundation, setFoundation] = useState<FoundationState>({
    systemPrompt: '',
    skills: [],
    guides: [],
    sensors: [],
  })
  const [usage, setUsage] = useState<UsageState>({
    tokens: null,
    contextWindow: 0,
    percent: null,
    estimatedCost: 0,
  })

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)

    ws.onmessage = (evt) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(evt.data)
      } catch {
        return
      }
      handleEvent(msg)
    }

    return () => ws.close()
  }, [])

  const handleEvent = (event: Record<string, unknown>) => {
    const type = event.type as string

    if (type === 'message_start') {
      const message = event.message as { id?: string; role?: string } | undefined
      if (message?.role === 'assistant') {
        const id = message.id ?? genId()
        streamingIdRef.current = id
        setBlocks((b) => [{ id, role: 'assistant', text: '', streaming: true }, ...b])
      }
      return
    }

    if (type === 'message_update') {
      const assistantEvent = event.assistantMessageEvent as { type?: string; delta?: string } | undefined
      if (assistantEvent?.type === 'text_delta' && streamingIdRef.current) {
        const id = streamingIdRef.current
        const delta = assistantEvent.delta ?? ''
        setBlocks((b) => b.map((block) => (block.id === id ? { ...block, text: block.text + delta } : block)))
      }
      return
    }

    if (type === 'message_end') {
      const id = streamingIdRef.current
      if (id) {
        setBlocks((b) => b.map((block) => (block.id === id ? { ...block, streaming: false } : block)))
        streamingIdRef.current = null
      }
      return
    }

    if (type === 'tool_execution_start') {
      const toolCallId = event.toolCallId as string
      const toolName = event.toolName as string
      setBlocks((b) => [
        { id: toolCallId, role: 'tool', text: '', toolName, status: 'running' },
        ...b,
      ])
      return
    }

    if (type === 'tool_execution_end') {
      const toolCallId = event.toolCallId as string
      const isError = event.isError as boolean | undefined
      const resultSummary = summarize(event.result)
      setBlocks((b) =>
        b.map((block) =>
          block.id === toolCallId
            ? { ...block, status: isError ? 'error' : 'done', text: resultSummary }
            : block,
        ),
      )
      return
    }

    if (type === 'context_usage') {
      const tokens = event.tokens as number | null
      const contextWindow = event.contextWindow as number
      const percent = event.percent as number | null
      setUsage({
        tokens,
        contextWindow,
        percent,
        estimatedCost: tokens != null ? (tokens / 1_000_000) * 5 : 0,
      })
      return
    }

    if (type === 'foundation_update') {
      setFoundation({
        systemPrompt: (event.systemPrompt as string) ?? '',
        skills: (event.skills as FoundationState['skills']) ?? [],
        guides: (event.guides as string[]) ?? [],
        sensors: (event.sensors as string[]) ?? [],
      })
      return
    }

    if (type === 'agent_settled') {
      const id = streamingIdRef.current
      if (id) {
        setBlocks((b) => b.map((block) => (block.id === id ? { ...block, streaming: false } : block)))
        streamingIdRef.current = null
      }
    }
  }

  const sendPrompt = useCallback((text: string) => {
    setBlocks((b) => [{ id: genId(), role: 'user', text }, ...b])
    wsRef.current?.send(JSON.stringify({ type: 'prompt', text }))
  }, [])

  return { connected, blocks, foundation, usage, sendPrompt }
}
