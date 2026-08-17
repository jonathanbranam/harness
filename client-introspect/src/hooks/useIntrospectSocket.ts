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

/**
 * Chronological, per-category token accounting for the Apparatus view. Distinct
 * from `ContextBlock[]` (which drives the chat pane's full-text transcript): this
 * is aggregated per-category token data, sourced from `message_end`'s `usage`,
 * `message_update`'s `thinking_delta`, and `tool_result`, not from block text.
 */
export type ApparatusEntryKind = 'user' | 'skill' | 'thinking' | 'output' | 'toolResult' | 'reprocessed' | 'toolMarker'

export interface ApparatusEntry {
  id: string
  kind: ApparatusEntryKind
  /** Always 0 for `toolMarker` entries — tool calls are rendered as overlay markers, not binned into the grid (their true context-window share is negligible). */
  tokens: number
  /** Ordinal of the user prompt this entry resulted from (0 before the first prompt). */
  turn: number
  label?: string
  snippet?: string
  toolName?: string
  status?: 'running' | 'done' | 'error'
}

/** Rough chars-per-token heuristic, used only where no exact provider-reported token count exists. */
function estimateTokens(text: string): number {
  if (!text || text.trim() === '') return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

/**
 * Matches the skill-injection format `agent-session.js` wraps auto-loaded skill
 * files in: `<skill name="..." location="...">\n{body}\n</skill>` optionally
 * followed by `\n\n{the user's own typed text}`. Lets the apparatus view split a
 * user message into its "skill auto-load" and "user prompt" token categories.
 */
const SKILL_BLOCK_RE = /^<skill name="([^"]+)" location="([^"]+)">\n([\s\S]*?)\n<\/skill>(?:\n\n([\s\S]+))?$/

function extractUsage(message: unknown): { input: number; output: number; reasoning?: number } | undefined {
  if (!message || typeof message !== 'object') return undefined
  const usage = (message as { usage?: unknown }).usage
  if (!usage || typeof usage !== 'object') return undefined
  const { input, output, reasoning } = usage as { input?: unknown; output?: unknown; reasoning?: unknown }
  if (typeof input !== 'number' || typeof output !== 'number') return undefined
  return { input, output, reasoning: typeof reasoning === 'number' ? reasoning : undefined }
}

export type SessionMode = 'live' | 'replay'

export interface RecordingSummary {
  id: string
  name: string
  createdAt: string
  stoppedAt?: string
  checkpointCount: number
}

export interface RecordingCheckpoint {
  index: number
  commitHash: string
  createdAt: string
}

export interface RecordingHeader {
  id: string
  name: string
  createdAt: string
  stoppedAt?: string
  checkpoints: RecordingCheckpoint[]
}

export interface ReplayPosition {
  index: number
  total: number
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

/** Extracts the text of a pi `AgentMessage.content` (a string, or an array of text/image content parts). */
function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === 'object' && (part as { type?: string }).type === 'text' ? ((part as { text?: string }).text ?? '') : ''))
      .join('')
  }
  return ''
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
  const [foundationTokens, setFoundationTokens] = useState(0)
  const [apparatusEntries, setApparatusEntries] = useState<ApparatusEntry[]>([])
  // Accumulates thinking_delta text per in-flight assistant message id, consumed
  // (and cleared) when that message's message_end supplies usage.reasoning or,
  // absent that, needs the accumulated text for the char-length fallback estimate.
  const thinkingTextRef = useRef<Map<string, string>>(new Map())
  // Tool-result content tokens measured since the last assistant turn's
  // message_end, attributed to that turn's "tool-result content" category and
  // reset once consumed.
  const toolResultTokensSinceLastTurnRef = useRef(0)
  // User/skill tokens entered since the last message_end, subtracted out of that
  // turn's usage.input so the "reprocessed context" residual doesn't double-count
  // the user's own newly-typed prompt (see design.md Decision 5).
  const pendingUserSkillTokensRef = useRef(0)
  // Ordinal of the current user prompt, incremented on each user message_start.
  const turnCounterRef = useRef(0)
  const [usage, setUsage] = useState<UsageState>({
    tokens: null,
    contextWindow: 0,
    percent: null,
    estimatedCost: 0,
  })
  const [mode, setMode] = useState<SessionMode>('live')
  const [recording, setRecording] = useState(false)
  const [recordingId, setRecordingId] = useState<string | undefined>(undefined)
  const [recordings, setRecordings] = useState<RecordingSummary[]>([])
  const [replayHeader, setReplayHeader] = useState<RecordingHeader | undefined>(undefined)
  const [replayPosition, setReplayPosition] = useState<ReplayPosition | undefined>(undefined)
  const [replayPlaying, setReplayPlaying] = useState(false)

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
      if (!active || wsRef.current !== ws) return
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
      const message = event.message as { id?: string; role?: string; content?: unknown } | undefined
      if (message?.role === 'assistant') {
        streamingIdRef.current = message.id ?? genId()
        return
      }
      // The user's own prompt is a forwarded event like any other (both live
      // and replay), not a client-local echo — see `sendPrompt`, which no
      // longer adds this bubble itself.
      if (message?.role === 'user') {
        const text = extractMessageText(message.content)
        if (text.trim() !== '') {
          setBlocks((b) => [{ id: message.id ?? genId(), role: 'user', text }, ...b])
        }

        turnCounterRef.current += 1
        const turn = turnCounterRef.current
        const skillMatch = text.match(SKILL_BLOCK_RE)
        const newEntries: ApparatusEntry[] = []
        let userSkillTokens = 0
        if (skillMatch) {
          const [, skillName, , skillBody, rest] = skillMatch
          const skillTokens = estimateTokens(skillBody)
          userSkillTokens += skillTokens
          newEntries.push({ id: genId(), kind: 'skill', tokens: skillTokens, turn, label: skillName, snippet: skillBody.slice(0, 200) })
          if (rest && rest.trim() !== '') {
            const userTokens = estimateTokens(rest)
            userSkillTokens += userTokens
            newEntries.push({ id: genId(), kind: 'user', tokens: userTokens, turn, snippet: rest.slice(0, 200) })
          }
        } else if (text.trim() !== '') {
          const userTokens = estimateTokens(text)
          userSkillTokens += userTokens
          newEntries.push({ id: genId(), kind: 'user', tokens: userTokens, turn, snippet: text.slice(0, 200) })
        }
        pendingUserSkillTokensRef.current += userSkillTokens
        if (newEntries.length) setApparatusEntries((e) => [...e, ...newEntries])
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
      if (assistantEvent?.type === 'thinking_delta' && streamingIdRef.current) {
        const id = streamingIdRef.current
        const delta = assistantEvent.delta ?? ''
        const prev = thinkingTextRef.current.get(id) ?? ''
        thinkingTextRef.current.set(id, prev + delta)
      }
      return
    }

    if (type === 'message_end') {
      const id = streamingIdRef.current
      if (id) {
        setBlocks((b) => b.map((block) => (block.id === id ? { ...block, streaming: false } : block)))
      }

      const message = event.message as { role?: string } | undefined
      const usage = message?.role === 'assistant' ? extractUsage(event.message) : undefined
      if (usage) {
        const thinkingText = id ? (thinkingTextRef.current.get(id) ?? '') : ''
        if (id) thinkingTextRef.current.delete(id)

        const toolResultTokens = toolResultTokensSinceLastTurnRef.current
        const userSkillTokens = pendingUserSkillTokensRef.current
        toolResultTokensSinceLastTurnRef.current = 0
        pendingUserSkillTokensRef.current = 0

        const reprocessedTokens = Math.max(0, usage.input - toolResultTokens - userSkillTokens)
        const thinkingPresent = thinkingText.trim() !== ''
        // A provider reporting `reasoning: 0` alongside real accumulated thinking
        // text is untrustworthy for sizing (see design.md's Kimi K2.7 example,
        // where reasoning is always 0 despite substantial thinking_delta text) —
        // fall back to the char-length estimate for any non-positive reasoning
        // count, not just an absent one.
        const thinkingTokens = thinkingPresent ? (usage.reasoning && usage.reasoning > 0 ? usage.reasoning : estimateTokens(thinkingText)) : 0
        const outputTokens = Math.max(0, usage.output - thinkingTokens)

        const turn = turnCounterRef.current
        const newEntries: ApparatusEntry[] = []
        if (toolResultTokens > 0) newEntries.push({ id: genId(), kind: 'toolResult', tokens: toolResultTokens, turn })
        if (reprocessedTokens > 0) newEntries.push({ id: genId(), kind: 'reprocessed', tokens: reprocessedTokens, turn })
        if (thinkingPresent) newEntries.push({ id: genId(), kind: 'thinking', tokens: thinkingTokens, turn, snippet: thinkingText.slice(0, 200) })
        if (outputTokens > 0) newEntries.push({ id: genId(), kind: 'output', tokens: outputTokens, turn })
        if (newEntries.length) setApparatusEntries((e) => [...e, ...newEntries])
      }

      streamingIdRef.current = null
      return
    }

    if (type === 'tool_execution_start') {
      const toolCallId = event.toolCallId as string
      const toolName = event.toolName as string
      setBlocks((b) => {
        const existing = b.find((block) => block.id === toolCallId)
        if (existing) {
          return b.map((block) => (block.id === toolCallId ? { id: toolCallId, role: 'tool', text: '', toolName, status: 'running' } : block))
        }
        return [{ id: toolCallId, role: 'tool', text: '', toolName, status: 'running' }, ...b]
      })
      setApparatusEntries((e) => {
        const existing = e.find((entry) => entry.id === toolCallId)
        if (existing) {
          return e.map((entry) =>
            entry.id === toolCallId ? { id: toolCallId, kind: 'toolMarker', tokens: 0, turn: turnCounterRef.current, toolName, status: 'running' } : entry,
          )
        }
        return [...e, { id: toolCallId, kind: 'toolMarker', tokens: 0, turn: turnCounterRef.current, toolName, status: 'running' }]
      })
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
      setApparatusEntries((e) =>
        e.map((entry) => (entry.id === toolCallId && entry.kind === 'toolMarker' ? { ...entry, status: isError ? 'error' : 'done' } : entry)),
      )
      return
    }

    if (type === 'tool_result') {
      const content = event.content as Array<{ type?: string; text?: string }> | undefined
      const usage = event.usage as { totalTokens?: number } | undefined
      const text = Array.isArray(content)
        ? content
            .filter((part) => part && part.type === 'text')
            .map((part) => part.text ?? '')
            .join('')
        : ''
      const tokens = typeof usage?.totalTokens === 'number' ? usage.totalTokens : estimateTokens(text)
      toolResultTokensSinceLastTurnRef.current += tokens
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
      const systemPrompt = (event.systemPrompt as string) ?? ''
      const skills = (event.skills as FoundationState['skills']) ?? []
      setFoundation({
        systemPrompt,
        skills,
        guides: (event.guides as string[]) ?? [],
        sensors: (event.sensors as string[]) ?? [],
      })
      setFoundationTokens(estimateTokens(systemPrompt) + skills.reduce((sum, skill) => sum + estimateTokens(`${skill.name} ${skill.description}`), 0))
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

    // Replay steps rebuild UI state from scratch each time (see
    // replay-engine.ts's determinism rationale) — clear accumulated state
    // before the replayed event prefix arrives.
    if (type === 'replay_reset') {
      setBlocks([])
      setFoundation({ systemPrompt: '', skills: [], guides: [], sensors: [] })
      setFoundationTokens(0)
      setApparatusEntries([])
      setUsage({ tokens: null, contextWindow: 0, percent: null, estimatedCost: 0 })
      streamingIdRef.current = null
      thinkingTextRef.current.clear()
      toolResultTokensSinceLastTurnRef.current = 0
      pendingUserSkillTokensRef.current = 0
      turnCounterRef.current = 0
      return
    }

    if (type === 'mode') {
      setMode(event.mode as SessionMode)
      return
    }

    // A brand-new session's sandbox/context replaces the previous one
    // entirely — clear accumulated UI state the same way a replay reset
    // does, plus any leftover replay-panel state from before the reset.
    if (type === 'session_reset') {
      setBlocks([])
      setFoundation({ systemPrompt: '', skills: [], guides: [], sensors: [] })
      setFoundationTokens(0)
      setApparatusEntries([])
      setUsage({ tokens: null, contextWindow: 0, percent: null, estimatedCost: 0 })
      setReplayHeader(undefined)
      setReplayPosition(undefined)
      streamingIdRef.current = null
      thinkingTextRef.current.clear()
      toolResultTokensSinceLastTurnRef.current = 0
      pendingUserSkillTokensRef.current = 0
      turnCounterRef.current = 0
      return
    }

    if (type === 'recording_status') {
      setRecording(Boolean(event.recording))
      setRecordingId(event.recordingId as string | undefined)
      return
    }

    if (type === 'recordings_list') {
      setRecordings((event.recordings as RecordingSummary[]) ?? [])
      return
    }

    if (type === 'replay_loaded') {
      setReplayHeader(event.header as RecordingHeader)
      setMode('replay')
      setReplayPlaying(false)
      return
    }

    if (type === 'replay_position') {
      setReplayPosition({ index: event.index as number, total: event.total as number })
      return
    }

    if (type === 'replay_ended') {
      setReplayPlaying(false)
      return
    }

    if (type === 'error') {
      const message = (event.message as string) || 'Unknown server error'
      setBlocks((b) => [{ id: genId(), role: 'system', text: `Server error: ${message}` }, ...b])
    }
  }

  const sendPrompt = useCallback((text: string) => {
    // No local echo here: the user bubble is rendered from the server's
    // forwarded `message_start` (role: 'user') event instead, so live and
    // replay both populate the chat panel from the same event stream.
    wsRef.current?.send(JSON.stringify({ type: 'prompt', text }))
  }, [])

  const startRecording = useCallback((name?: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'start_recording', name }))
  }, [])

  const stopRecording = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'stop_recording' }))
  }, [])

  const refreshRecordings = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'list_recordings' }))
  }, [])

  const loadRecording = useCallback((id: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'replay_load', recordingId: id }))
  }, [])

  const replayStepForward = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'replay_step', direction: 'forward' }))
  }, [])

  const replayStepBackward = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'replay_step', direction: 'backward' }))
  }, [])

  const replayJumpToCheckpoint = useCallback((checkpointIndex: number) => {
    wsRef.current?.send(JSON.stringify({ type: 'replay_jump', checkpointIndex }))
  }, [])

  const replayPlay = useCallback(() => {
    setReplayPlaying(true)
    wsRef.current?.send(JSON.stringify({ type: 'replay_play' }))
  }, [])

  const replayPause = useCallback(() => {
    setReplayPlaying(false)
    wsRef.current?.send(JSON.stringify({ type: 'replay_pause' }))
  }, [])

  const exitReplay = useCallback(() => {
    setReplayPlaying(false)
    wsRef.current?.send(JSON.stringify({ type: 'replay_exit' }))
  }, [])

  const newSession = useCallback(() => {
    setReplayPlaying(false)
    wsRef.current?.send(JSON.stringify({ type: 'new_session' }))
  }, [])

  return {
    connected,
    blocks,
    foundation,
    foundationTokens,
    apparatusEntries,
    usage,
    sendPrompt,
    mode,
    recording,
    recordingId,
    recordings,
    startRecording,
    stopRecording,
    refreshRecordings,
    replayHeader,
    replayPosition,
    replayPlaying,
    loadRecording,
    replayStepForward,
    replayStepBackward,
    replayJumpToCheckpoint,
    replayPlay,
    replayPause,
    exitReplay,
    newSession,
  }
}
