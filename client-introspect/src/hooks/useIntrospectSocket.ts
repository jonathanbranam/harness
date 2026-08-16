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
    // The initial connection can briefly fail/retry (and in dev, React's
    // StrictMode double-mount opens then immediately closes a throwaway
    // socket, which fires a spurious error/close on that first socket).
    // Guard every handler against stale sockets via `wsRef.current !== ws`,
    // and give the connection a few seconds of grace before surfacing an
    // error, so a quick reconnect never shows a permanent false-positive
    // banner.
    let active = true
    let errorTimer: ReturnType<typeof setTimeout> | null = null

    const clearErrorTimer = () => {
      if (errorTimer) {
        clearTimeout(errorTimer)
        errorTimer = null
      }
    }

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)
    wsRef.current = ws

    const scheduleErrorReport = () => {
      if (!active || wsRef.current !== ws || errorTimer) return
      errorTimer = setTimeout(() => {
        errorTimer = null
        if (!active || wsRef.current !== ws) return
        setBlocks((b) => [{ id: genId(), role: 'system', text: 'WebSocket connection error.' }, ...b])
      }, 3000)
    }

    ws.onopen = () => {
      if (!active || wsRef.current !== ws) return
      setConnected(true)
      clearErrorTimer()
    }
    ws.onclose = () => {
      if (!active || wsRef.current !== ws) return
      setConnected(false)
      scheduleErrorReport()
    }
    ws.onerror = (err) => {
      if (!active || wsRef.current !== ws) return
      console.error('WebSocket error', err)
      scheduleErrorReport()
    }

    ws.onmessage = (evt) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(evt.data)
      } catch {
        setBlocks((b) => [{ id: genId(), role: 'system', text: 'Received invalid JSON from server.' }, ...b])
        return
      }
      handleEvent(msg)
    }

    return () => {
      active = false
      clearErrorTimer()
      ws.close()
    }
  }, [])

  const handleEvent = (event: Record<string, unknown>) => {
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
        setBlocks((b) => {
          const existing = b.find((block) => block.id === id)
          if (existing) {
            return b.map((block) => (block.id === id ? { ...block, text: block.text + delta } : block))
          }
          // Some assistant turns emit whitespace-only text chunks (e.g. a
          // bare newline) between tool calls with no other text — skip
          // creating a block until a chunk has actual content, so those
          // don't show up as empty/blank bubbles.
          if (delta.trim() === '') return b
          return [{ id, role: 'assistant', text: delta, streaming: true }, ...b]
        })
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
      return
    }

    if (type === 'error') {
      const message = (event.message as string) || 'Unknown server error'
      setBlocks((b) => [{ id: genId(), role: 'system', text: `Server error: ${message}` }, ...b])
    }
  }

  const sendPrompt = useCallback((text: string) => {
    setBlocks((b) => [{ id: genId(), role: 'user', text }, ...b])
    wsRef.current?.send(JSON.stringify({ type: 'prompt', text }))
  }, [])

  return { connected, blocks, foundation, usage, sendPrompt }
}
