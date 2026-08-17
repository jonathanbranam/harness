import { PaneIconButton } from './PaneIconButton'
import type { PaneMode } from './usePaneManager'

export function PaneRail({ title, mode, onRestore, onMaximize }: { title: string; mode: PaneMode; onRestore: () => void; onMaximize: () => void }) {
  return (
    <div className="flex flex-col items-center h-full py-3 gap-3 bg-gray-50 dark:bg-gray-900/60 border-r border-gray-200 dark:border-gray-800 last:border-r-0 last:border-l">
      <PaneIconButton title="Restore" onClick={onRestore}>
        ↺
      </PaneIconButton>
      {mode !== 'maximized' && (
        <PaneIconButton title="Maximize" onClick={onMaximize}>
          ⤢
        </PaneIconButton>
      )}
      <span
        className="flex-1 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap"
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
      >
        {title}
      </span>
    </div>
  )
}
