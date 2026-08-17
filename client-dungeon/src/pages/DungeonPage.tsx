import { useMemo } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { ChatPanel, PaneHeader, PaneRail, usePaneManager } from '@harness/ui'
import { useAuth } from '../hooks/useAuth'
import { findLatestPreview, useDungeonSocket, type AttackPreviewResult, type MovementPreviewResult } from '../hooks/useDungeonSocket'
import { useTheme } from '../hooks/useTheme'
import { BoardCanvas } from '../components/BoardCanvas'
import { ApprovalDialog } from '../components/ApprovalDialog'

const BOARD_PANE = 'board'
const CHAT_PANE = 'chat'
/** Ordered list driving every maximize/minimize/restore computation in
 * `usePaneManager` — nothing there hardcodes "the other pane"; it always
 * iterates this list, so a third pane added later only needs an entry here
 * plus a rendered `<Panel>`. */
const PANE_IDS = [BOARD_PANE, CHAT_PANE] as const
type PaneId = (typeof PANE_IDS)[number]
const PANE_TITLES: Record<PaneId, string> = { [BOARD_PANE]: 'Board', [CHAT_PANE]: 'Chat with pi' }
const DEFAULT_SIZES: Record<PaneId, number> = { [BOARD_PANE]: 75, [CHAT_PANE]: 25 }
const RAIL_SIZE = '44px'
const MIN_SIZE = '18%'

export function DungeonPage() {
  const { logout } = useAuth()
  const { connected, transcript, pendingApproval, boardState, sendPrompt, respondApproval } = useDungeonSocket()
  const { theme, toggleTheme } = useTheme()
  const { paneModes, panelRefs, minimizePane, maximizePane, restorePane, handleLayoutChanged } = usePaneManager(PANE_IDS, DEFAULT_SIZES)

  const movementPreview = useMemo(
    () => findLatestPreview(transcript, 'dungeon_preview_movement') as MovementPreviewResult | undefined,
    [transcript],
  )
  const attackPreview = useMemo(
    () => findLatestPreview(transcript, 'dungeon_preview_attack') as AttackPreviewResult | undefined,
    [transcript],
  )

  return (
    <div className="h-screen flex flex-col bg-white text-gray-900 dark:bg-gray-950 dark:text-white">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800">
        <span className="font-semibold">Dungeon Harness</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        <Group orientation="horizontal" onLayoutChanged={handleLayoutChanged} className="h-full">
          <Panel
            id={BOARD_PANE}
            panelRef={panelRefs[BOARD_PANE]}
            defaultSize={`${DEFAULT_SIZES[BOARD_PANE]}%`}
            minSize={MIN_SIZE}
            collapsible
            collapsedSize={RAIL_SIZE}
            className="flex flex-col min-h-0"
          >
            {paneModes[BOARD_PANE] === 'minimized' ? (
              <PaneRail
                title={PANE_TITLES[BOARD_PANE]}
                mode={paneModes[BOARD_PANE]}
                onRestore={() => restorePane(BOARD_PANE)}
                onMaximize={() => maximizePane(BOARD_PANE)}
              />
            ) : (
              <div className="flex flex-col h-full min-h-0">
                <PaneHeader
                  title={PANE_TITLES[BOARD_PANE]}
                  mode={paneModes[BOARD_PANE]}
                  onMinimize={() => minimizePane(BOARD_PANE)}
                  onMaximize={() => maximizePane(BOARD_PANE)}
                  onRestore={() => restorePane(BOARD_PANE)}
                />
                <div className="flex-1 min-h-0">
                  <BoardCanvas boardState={boardState} movementPreview={movementPreview} attackPreview={attackPreview} />
                </div>
              </div>
            )}
          </Panel>

          <Separator className="w-1 bg-gray-200 dark:bg-gray-800 hover:bg-indigo-400 dark:hover:bg-indigo-500 transition-colors cursor-col-resize" />

          <Panel
            id={CHAT_PANE}
            panelRef={panelRefs[CHAT_PANE]}
            defaultSize={`${DEFAULT_SIZES[CHAT_PANE]}%`}
            minSize={MIN_SIZE}
            collapsible
            collapsedSize={RAIL_SIZE}
            className="flex flex-col min-h-0 border-l border-gray-200 dark:border-gray-800"
          >
            {paneModes[CHAT_PANE] === 'minimized' ? (
              <PaneRail
                title={PANE_TITLES[CHAT_PANE]}
                mode={paneModes[CHAT_PANE]}
                onRestore={() => restorePane(CHAT_PANE)}
                onMaximize={() => maximizePane(CHAT_PANE)}
              />
            ) : (
              <div className="flex flex-col h-full min-h-0">
                <PaneHeader
                  title={PANE_TITLES[CHAT_PANE]}
                  mode={paneModes[CHAT_PANE]}
                  onMinimize={() => minimizePane(CHAT_PANE)}
                  onMaximize={() => maximizePane(CHAT_PANE)}
                  onRestore={() => restorePane(CHAT_PANE)}
                />
                <div className="flex-1 min-h-0">
                  <ChatPanel transcript={transcript} connected={connected} onSend={sendPrompt} placeholder="Ask pi…" />
                </div>
              </div>
            )}
          </Panel>
        </Group>
      </div>

      {pendingApproval && <ApprovalDialog request={pendingApproval} onRespond={(approved) => respondApproval(pendingApproval.toolCallId, approved)} />}
    </div>
  )
}
