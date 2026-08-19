import { useCallback, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { ChatPanel, PaneHeader, PaneRail, usePaneManager } from '@harness/ui'
import { useAuth } from '../hooks/useAuth'
import { useDungeonSocket } from '../hooks/useDungeonSocket'
import { useTheme } from '../hooks/useTheme'
import { BoardView } from '../components/BoardView'
import { BenchControls } from '../components/BenchControls'
import { BookmarkRail } from '../components/BookmarkRail'
import { TransportStrip } from '../components/TransportStrip'
import { ApprovalDialog } from '../components/ApprovalDialog'
import { NO_FIELDS, type ActionId, type FieldToggles, type Tile, type Unit, type UnitType } from '../bench/types'

const BOARD_PANE = 'board'
const CHAT_PANE = 'chat'
/** Ordered list driving every maximize/minimize/restore computation in
 * `usePaneManager` — nothing there hardcodes "the other pane"; it always
 * iterates this list, so a third pane added later only needs an entry here
 * plus a rendered `<Panel>`. */
const PANE_IDS = [BOARD_PANE, CHAT_PANE] as const
type PaneId = (typeof PANE_IDS)[number]
const PANE_TITLES: Record<PaneId, string> = { [BOARD_PANE]: 'Bench', [CHAT_PANE]: 'Chat with pi' }
const DEFAULT_SIZES: Record<PaneId, number> = { [BOARD_PANE]: 65, [CHAT_PANE]: 35 }
const RAIL_SIZE = '44px'
const MIN_SIZE = '18%'

export function DungeonPage() {
  const { logout } = useAuth()
  const { connected, transcript, pendingApproval, benchState, benchError, canvasRef, sendPrompt, sendIntent, respondApproval } = useDungeonSocket()
  const { theme, toggleTheme } = useTheme()
  const { paneModes, panelRefs, minimizePane, maximizePane, restorePane, handleLayoutChanged } = usePaneManager(PANE_IDS, DEFAULT_SIZES)

  const [mode, setMode] = useState<'setup' | 'play'>('setup')
  const [palette, setPalette] = useState<UnitType | null>(null)
  // Which action the designer has armed. Selecting a unit arms Move, so the
  // board lights its reach by default — the same place the game starts.
  const [armedAction, setArmedAction] = useState<ActionId>('move')
  const [fields, setFields] = useState<FieldToggles>(NO_FIELDS)

  const selection = benchState?.selection ?? null

  // Clicking a unit always selects it — in either mode, on either side. Driving
  // the enemy by hand is the point of the bench, so nothing here distinguishes
  // PCs from NPCs.
  const handleUnitClick = useCallback(
    (unit: Unit) => {
      // Aiming takes precedence over selecting, as it does in the game: with an
      // action armed, a click on a unit standing on one of its target tiles is a
      // click on that tile. Without this, the enemy you were aiming at simply
      // becomes the selected unit and the attack never happens.
      const armed = selection?.actions.find((a) => a.id === armedAction)
      if (
        mode === 'play' &&
        armedAction === 'attack' &&
        armed?.available &&
        armed.targets.some((t) => t.col === unit.col && t.row === unit.row)
      ) {
        sendIntent({ kind: 'commit', action: 'attack', col: unit.col, row: unit.row })
        setArmedAction('move')
        return
      }
      setArmedAction('move')
      sendIntent({ kind: 'select', unitId: unit.id })
    },
    [armedAction, mode, selection, sendIntent],
  )

  const handleTileClick = useCallback(
    (tile: Tile) => {
      if (mode === 'setup') {
        if (palette) {
          sendIntent({ kind: 'place', unitType: palette, col: tile.col, row: tile.row })
          return
        }
        if (selection) sendIntent({ kind: 'relocate', unitId: selection.unitId, col: tile.col, row: tile.row })
        return
      }

      if (!selection) return

      // Aim by tile, exactly as the game does. The engine decides which tiles an
      // action may be aimed at; a click anywhere else disarms rather than acting,
      // so a stray click can never resolve an attack somewhere the designer did
      // not point at.
      const action = selection.actions.find((a) => a.id === armedAction)
      if (!action?.available) return
      if (!action.targets.some((t) => t.col === tile.col && t.row === tile.row)) {
        setArmedAction('move')
        return
      }

      sendIntent({ kind: 'commit', action: armedAction, col: tile.col, row: tile.row })
      if (armedAction === 'attack') setArmedAction('move')
    },
    [armedAction, mode, palette, selection, sendIntent],
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
                <TransportStrip state={benchState} onIntent={sendIntent} />
                <BenchControls
                  state={benchState}
                  mode={mode}
                  onModeChange={setMode}
                  palette={palette}
                  onPaletteChange={setPalette}
                  armedAction={armedAction}
                  onArmAction={setArmedAction}
                  onIntent={sendIntent}
                  fields={fields}
                  onFieldsChange={setFields}
                  lastError={benchError}
                />
                <div className="flex-1 min-h-0 flex">
                  <BookmarkRail bookmarks={benchState?.bookmarks ?? []} onIntent={sendIntent} />
                  <div className="flex-1 min-h-0">
                    <BoardView
                      ref={canvasRef}
                      state={benchState}
                      armedAction={armedAction}
                      fields={fields}
                      onTileClick={handleTileClick}
                      onUnitClick={handleUnitClick}
                    />
                  </div>
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
