import { useRef } from 'react'
import { ChatInput } from './ChatInput'
import { MarkdownMessage } from './MarkdownMessage'
import { ToolBadge } from './ToolBadge'
import type { TranscriptEntry } from './types'
import { useStickToBottom } from './useStickToBottom'

export function ChatPanel({
  transcript,
  connected,
  onSend,
  placeholder = 'Ask pi…',
}: {
  transcript: TranscriptEntry[]
  connected: boolean
  onSend: (text: string) => void
  placeholder?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { handleScroll } = useStickToBottom(scrollRef, [transcript])

  return (
    <div className="flex flex-col h-full bg-white text-gray-900 dark:bg-gray-900 dark:text-white">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800">
        <span className="text-sm font-medium">Chat with pi</span>
        <span className={`text-xs ${connected ? 'text-emerald-400' : 'text-red-400'}`}>{connected ? 'connected' : 'disconnected'}</span>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-3 space-y-2">
        {transcript
          .filter((entry) => entry.kind === 'tool' || entry.text.trim() !== '')
          .map((entry) =>
            entry.kind === 'tool' ? (
              <ToolBadge key={entry.id} entry={entry} />
            ) : (
              <div key={entry.id} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    entry.role === 'user' ? 'bg-indigo-600 text-white whitespace-pre-wrap' : 'bg-gray-100 dark:bg-gray-800'
                  }`}
                >
                  {entry.role === 'assistant' ? <MarkdownMessage text={entry.text} /> : entry.text}
                  {entry.streaming && <span className="animate-pulse">▍</span>}
                </div>
              </div>
            ),
          )}
      </div>

      <ChatInput onSend={onSend} placeholder={placeholder} />
    </div>
  )
}
