import type { TranscriptEntry } from './types'

export function ToolBadge({ entry }: { entry: Extract<TranscriptEntry, { kind: 'tool' }> }) {
  const color = entry.status === 'running' ? 'text-amber-400' : entry.status === 'error' ? 'text-red-400' : 'text-emerald-400'
  const dot = entry.status === 'running' ? '●' : entry.status === 'error' ? '✕' : '✓'
  return (
    <div className="text-xs font-mono bg-gray-100 dark:bg-gray-800/60 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1">
      <span className={color}>{dot}</span> <span className="text-gray-700 dark:text-gray-300">{entry.toolName}</span>
      {entry.resultSummary && <span className="text-gray-500"> — {entry.resultSummary}</span>}
    </div>
  )
}
