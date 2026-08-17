import { PaneIconButton } from './PaneIconButton'
import type { PaneMode } from './usePaneManager'

export function PaneHeader({
  title,
  mode,
  onMinimize,
  onMaximize,
  onRestore,
}: {
  title: string
  mode: PaneMode
  onMinimize: () => void
  onMaximize: () => void
  onRestore: () => void
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1 border-b border-gray-200 dark:border-gray-800 flex-none">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</span>
      <div className="flex items-center gap-1">
        {mode === 'maximized' ? (
          <PaneIconButton title="Restore" onClick={onRestore}>
            ↺
          </PaneIconButton>
        ) : (
          <PaneIconButton title="Maximize" onClick={onMaximize}>
            ⤢
          </PaneIconButton>
        )}
        <PaneIconButton title="Minimize" onClick={onMinimize}>
          ▭
        </PaneIconButton>
      </div>
    </div>
  )
}
