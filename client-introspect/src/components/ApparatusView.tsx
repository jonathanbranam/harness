import type { ContextBlock, FoundationState, UsageState } from '../hooks/useIntrospectSocket'
import { MarkdownMessage } from './MarkdownMessage'

function Gauge({ percent }: { percent: number | null }) {
  const value = percent ?? 0
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>context</span>
        <span>{value.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${value > 80 ? 'bg-red-500' : value > 50 ? 'bg-amber-400' : 'bg-emerald-400'}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  )
}

function Block({ block, muted }: { block: ContextBlock; muted: boolean }) {
  if (block.role === 'tool') {
    const color = block.status === 'running' ? 'text-amber-400' : block.status === 'error' ? 'text-red-400' : 'text-emerald-400'
    const dot = block.status === 'running' ? '●' : block.status === 'error' ? '✕' : '✓'
    return (
      <div className={`text-xs font-mono border border-gray-700 rounded-md px-2 py-1 ${muted ? 'bg-gray-900/50 text-gray-500' : 'bg-gray-800/60 text-gray-300'}`}>
        <span className={color}>{dot}</span> <span>{block.toolName}</span>
        {block.text && <span className="text-gray-500"> — {block.text}</span>}
      </div>
    )
  }

  return (
    <div
      className={`rounded-lg px-3 py-2 text-sm border ${block.role !== 'assistant' ? 'whitespace-pre-wrap' : ''} ${muted ? 'bg-gray-900/50 border-gray-800 text-gray-500' : 'bg-gray-800 border-gray-700 text-gray-100'}`}
    >
      {block.role === 'assistant' ? (
        <div className={muted ? 'opacity-50' : ''}>
          <MarkdownMessage text={block.text} />
        </div>
      ) : (
        block.text
      )}
      {block.role === 'assistant' && block.streaming && <span className="animate-pulse">▍</span>}
    </div>
  )
}

export function ApparatusView({
  blocks,
  foundation,
  usage,
}: {
  blocks: ContextBlock[]
  foundation: FoundationState
  usage: UsageState
}) {
  const visibleBlocks = blocks.filter((block) => block.role === 'tool' || block.text.trim() !== '')
  const total = visibleBlocks.length
  const lower = Math.floor(total * 0.3)
  const upper = Math.floor(total * 0.7)

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white">
      <div className="px-4 py-3 border-b border-gray-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold">Apparatus</span>
          <div className="text-right text-xs text-gray-400">
            <div>{usage.tokens != null ? usage.tokens.toLocaleString() : '—'} tokens</div>
            <div>~${usage.estimatedCost.toFixed(4)}</div>
          </div>
        </div>
        <Gauge percent={usage.percent} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
        {visibleBlocks.map((block, index) => {
          const muted = total > 6 && index >= lower && index <= upper
          return <Block key={block.id} block={block} muted={muted} />
        })}
      </div>

      <div className="border-t border-gray-800 p-4 bg-gray-900/50">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Foundation</h3>
        <div className="text-xs text-gray-500 mb-2 line-clamp-3">{foundation.systemPrompt || 'No system prompt loaded'}</div>
        {foundation.skills.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {foundation.skills.map((skill) => (
              <span key={skill.name} className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-xs">
                {skill.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
