import type { BenchIntent, BenchState } from '../bench/types'

interface TransportStripProps {
  state: BenchState | null
  onIntent: (intent: BenchIntent) => void
}

const BUTTON = 'px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:hover:bg-transparent'

/**
 * The session as a trajectory rather than a one-way animation.
 *
 * Every action is a frame — moves, attacks, placements, board swaps, number
 * changes — so the designer can walk back to the moment something interesting
 * happened and look at it in a paused state, which is where reach and threat are
 * legible. Scrubbing is the primary gesture here, not a nicety: dragging the bar
 * is how you find the moment, and the buttons are for the last step or two.
 */
export function TransportStrip({ state, onIntent }: TransportStripProps) {
  if (!state) return null

  const { timeline, canUndo, canRedo } = state
  const last = timeline.labels.length - 1
  const label = timeline.labels[timeline.cursor] ?? ''

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800">
      <button type="button" className={BUTTON} disabled={!canUndo} onClick={() => onIntent({ kind: 'undo' })} aria-label="Step back">
        ◀
      </button>
      <button type="button" className={BUTTON} disabled={!canRedo} onClick={() => onIntent({ kind: 'redo' })} aria-label="Step forward">
        ▶
      </button>

      <input
        type="range"
        min={0}
        max={Math.max(0, last)}
        value={timeline.cursor}
        onChange={(event) => onIntent({ kind: 'stepTo', index: Number(event.target.value) })}
        disabled={last === 0}
        aria-label="Scrub through this session"
        className="flex-1 min-w-24 accent-indigo-500"
      />

      <span className="text-[10px] tabular-nums text-gray-500 dark:text-gray-400">
        {timeline.cursor}/{last}
      </span>
      <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[40%]" title={label}>
        {label}
      </span>
    </div>
  )
}
