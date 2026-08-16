import { useState, type FormEvent } from 'react'
import type { ContextBlock } from '../hooks/useIntrospectSocket'
import { MarkdownMessage } from './MarkdownMessage'

function ToolBadge({ block }: { block: Extract<ContextBlock, { role: 'tool' }> }) {
  const color = block.status === 'running' ? 'text-amber-400' : block.status === 'error' ? 'text-red-400' : 'text-emerald-400'
  const dot = block.status === 'running' ? '●' : block.status === 'error' ? '✕' : '✓'
  return (
    <div className="text-xs font-mono bg-gray-100 dark:bg-gray-800/60 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1">
      <span className={color}>{dot}</span> <span className="text-gray-700 dark:text-gray-300">{block.toolName}</span>
      {block.text && <span className="text-gray-500"> — {block.text}</span>}
    </div>
  )
}

export function ChatPanel({
  blocks,
  connected,
  onSend,
  disabled,
}: {
  blocks: ContextBlock[]
  connected: boolean
  onSend: (text: string) => void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (disabled) return
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
  }

  // Chat pane shows messages in chronological order (oldest at top), so reverse
  // the context-window array for display here.
  const chatBlocks = [...blocks].reverse().filter((block) => block.role === 'tool' || block.text.trim() !== '')

  return (
    <div className="flex flex-col h-full bg-white text-gray-900 dark:bg-gray-900 dark:text-white">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800">
        <span className="text-sm font-medium">Chat with pi</span>
        <span className={`text-xs ${connected ? 'text-emerald-400' : 'text-red-400'}`}>{connected ? 'connected' : 'disconnected'}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {chatBlocks.map((block) =>
          block.role === 'tool' ? (
            <ToolBadge key={block.id} block={block} />
          ) : (
            <div key={block.id} className={`flex ${block.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  block.role === 'user' ? 'bg-indigo-600 text-white whitespace-pre-wrap' : 'bg-gray-100 dark:bg-gray-800'
                } ${block.role === 'system' ? 'whitespace-pre-wrap' : ''}`}
              >
                {block.role === 'assistant' ? <MarkdownMessage text={block.text} /> : block.text}
                {block.role === 'assistant' && block.streaming && <span className="animate-pulse">▍</span>}
              </div>
            </div>
          ),
        )}
      </div>

      <form onSubmit={submit} className="p-3 border-t border-gray-200 dark:border-gray-800 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled}
          placeholder={disabled ? 'Replaying — exit replay to chat' : 'Ask pi to explore the workspace…'}
          className="flex-1 rounded-md bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !draft.trim()}
          className="rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 text-sm font-medium"
        >
          Send
        </button>
      </form>
    </div>
  )
}
