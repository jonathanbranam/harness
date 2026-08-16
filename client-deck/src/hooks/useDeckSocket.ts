import { toPng } from 'html-to-image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { genId } from '../id'

// Duplicated from deck-harness-server/src/editor-state.ts (no shared
// `packages/` tier yet — see CLAUDE.md's "No packages/ tier yet"); keep this
// shape in sync with the server's DeckObject/UpdateAction types by hand.

export interface TextRun {
  text: string
  bold?: boolean
  italic?: boolean
}

export type TextBlock =
  | { kind: 'paragraph'; runs: TextRun[] }
  | { kind: 'listItem'; listType: 'bulleted' | 'numbered'; runs: TextRun[] }

export interface DeckObject {
  id: string
  x: number
  y: number
  width: number
  height: number
  text: TextBlock[]
  fillColor: string
  borderColor: string
  fontColor: string
  fontSize: number
}

export type UpdateAction =
  | 'setPosition'
  | 'setSize'
  | 'setText'
  | 'setFillColor'
  | 'setFontColor'
  | 'setBorderColor'
  | 'setFontSize'
  | 'applyGridLayout'
  | 'addObject'
  | 'removeObject'
  | 'applyTextStyle'

export interface UpdateActionCall {
  action: UpdateAction
  targetIds: string[]
  args: Record<string, unknown>
}

export interface DeckSummary {
  id: string
  name: string
  slideCount: number
}

export interface SlideSummary {
  id: string
}

export interface DeckState {
  decks: DeckSummary[]
  activeDeckId: string
  slides: SlideSummary[]
  activeSlideId: string
  objects: DeckObject[]
  selection: string[]
  canUndo: boolean
  canRedo: boolean
}

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
 * Owns the single WebSocket connection to deck-harness-server: forwards
 * pi's AgentSessionEvent stream into a simplified chat transcript (text
 * streaming + tool call status), keeps deck state in sync, and surfaces
 * pending permission-gate approvals. See websocket.ts on the server for the
 * message protocol this speaks.
 */
export function useDeckSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const streamingIdRef = useRef<string | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [connected, setConnected] = useState(false)
  const [deckState, setDeckState] = useState<DeckState>({
    decks: [],
    activeDeckId: '',
    slides: [],
    activeSlideId: '',
    objects: [],
    selection: [],
    canUndo: false,
    canRedo: false,
  })
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null)

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)

    // Renders the DOM node captured by canvasRef and returns the result to
    // the server over this same connection — see websocket.ts's
    // requestRender/pendingRenders, which backs the slide_view pi tool
    // (design.md's "captures the real canvas in the browser" decision).
    async function handleRenderRequest(requestId: string) {
      const node = canvasRef.current
      if (!node) {
        ws.send(JSON.stringify({ type: 'render_response', requestId, error: 'Canvas not mounted' }))
        return
      }
      try {
        // Overrides the live scale-to-fit transform (DeckCanvas.tsx) so the
        // capture always reflects the canvas's fixed 960x540 logical frame,
        // regardless of how large/small it's currently displayed on screen.
        const image = await toPng(node, { width: 960, height: 540, style: { transform: 'none' } })
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

      if (msg.type === 'deck_state') {
        setDeckState(msg.state as DeckState)
        return
      }

      if (msg.type === 'approval_required') {
        setPendingApproval(msg.request as ApprovalRequest)
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

  const sendSelection = useCallback((ids: string[]) => {
    wsRef.current?.send(JSON.stringify({ type: 'selection', ids }))
  }, [])

  // Routes user-originated canvas edits (drag, resize, text edit, format
  // toolbar) through the same UpdateAction shapes the presentation_update
  // tool uses, applied server-side via the same EditorStore.applyUpdate
  // call — see websocket.ts's object_update handler.
  const sendObjectUpdate = useCallback((actions: UpdateActionCall[]) => {
    wsRef.current?.send(JSON.stringify({ type: 'object_update', actions }))
  }, [])

  const respondApproval = useCallback((toolCallId: string, approved: boolean) => {
    wsRef.current?.send(JSON.stringify({ type: 'approval_response', toolCallId, approved }))
    setPendingApproval(null)
  }, [])

  const selectDeck = useCallback((deckId: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'select_deck', deckId }))
  }, [])

  const createDeck = useCallback((name: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'create_deck', name }))
  }, [])

  const deleteDeck = useCallback((deckId: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'delete_deck', deckId }))
  }, [])

  const renameDeck = useCallback((deckId: string, name: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'rename_deck', deckId, name }))
  }, [])

  const addSlide = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'add_slide' }))
  }, [])

  const removeSlide = useCallback((slideId: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'remove_slide', slideId }))
  }, [])

  const selectSlide = useCallback((slideId: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'select_slide', slideId }))
  }, [])

  const undo = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'undo' }))
  }, [])

  const redo = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'redo' }))
  }, [])

  return {
    connected,
    deckState,
    transcript,
    pendingApproval,
    canvasRef,
    sendPrompt,
    sendSelection,
    sendObjectUpdate,
    respondApproval,
    selectDeck,
    createDeck,
    deleteDeck,
    renameDeck,
    addSlide,
    removeSlide,
    selectSlide,
    undo,
    redo,
  }
}
