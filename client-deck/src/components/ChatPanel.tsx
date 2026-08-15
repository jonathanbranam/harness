import { useState, type FormEvent } from 'react'
import type { TranscriptEntry } from '../hooks/useDeckSocket'

function ToolBadge({ entry }: { entry: Extract<TranscriptEntry, { kind: 'tool' }> }) {
  const color = entry.status === 'running' ? 'text-amber-400' : entry.status === 'error' ? 'text-red-400' : 'text-emerald-400'
  const dot = entry.status === 'running' ? '●' : entry.status === 'error' ? '✕' : '✓'
  return (
    <div className="text-xs font-mono bg-gray-800/60 border border-gray-700 rounded-md px-2 py-1">
      <span className={color}>{dot}</span> <span className="text-gray-300">{entry.toolName}</span>
      {entry.resultSummary && <span className="text-gray-500"> — {entry.resultSummary}</span>}
    </div>
  )
}

export function ChatPanel({
  transcript,
  connected,
  onSend,
}: {
  transcript: TranscriptEntry[]
  connected: boolean
  onSend: (text: string) => void
}) {
  const [draft, setDraft] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span className="text-sm font-medium">Chat with pi</span>
        <span className={`text-xs ${connected ? 'text-emerald-400' : 'text-red-400'}`}>{connected ? 'connected' : 'disconnected'}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {transcript.map((entry) =>
          entry.kind === 'tool' ? (
            <ToolBadge key={entry.id} entry={entry} />
          ) : (
            <div key={entry.id} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  entry.role === 'user' ? 'bg-indigo-600' : 'bg-gray-800'
                }`}
              >
                {entry.text}
                {entry.streaming && <span className="animate-pulse">▍</span>}
              </div>
            </div>
          ),
        )}
      </div>

      <form onSubmit={submit} className="p-3 border-t border-gray-800 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask pi to edit the deck…"
          className="flex-1 rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <button type="submit" disabled={!draft.trim()} className="rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 text-sm font-medium">
          Send
        </button>
      </form>
    </div>
  )
}
