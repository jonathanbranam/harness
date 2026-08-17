import { useCallback, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Group, Panel, Separator, usePanelRef, type Layout, type LayoutChangedMeta, type PanelImperativeHandle } from 'react-resizable-panels'
import { useAuth } from '../hooks/useAuth'
import { useIntrospectSocket } from '../hooks/useIntrospectSocket'
import { useTheme } from '../hooks/useTheme'
import { ChatPanel } from '../components/ChatPanel'
import { ApparatusView } from '../components/ApparatusView'
import { SessionTimeline } from '../components/SessionTimeline'

const CHAT_PANE = 'chat'
const APPARATUS_PANE = 'apparatus'
/** Ordered list driving every maximize/minimize/restore computation below —
 * nothing in that logic hardcodes "the other pane"; it always iterates this
 * list, so a third pane added later only needs an entry here plus a ref and
 * a rendered `<Panel>` (design.md Decision 1 / "Generalized to more than two
 * panes" requirement). */
const PANE_IDS = [CHAT_PANE, APPARATUS_PANE] as const
type PaneId = (typeof PANE_IDS)[number]
type PaneMode = 'normal' | 'minimized' | 'maximized'

const PANE_TITLES: Record<PaneId, string> = { [CHAT_PANE]: 'Chat with pi', [APPARATUS_PANE]: 'Apparatus' }
const DEFAULT_SIZES: Record<PaneId, number> = { [CHAT_PANE]: 65, [APPARATUS_PANE]: 35 }
const RAIL_SIZE = '44px'
const MIN_SIZE = '18%'

function PaneIconButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white text-sm leading-none px-1"
    >
      {children}
    </button>
  )
}

function PaneRail({ id, mode, onRestore, onMaximize }: { id: PaneId; mode: PaneMode; onRestore: () => void; onMaximize: () => void }) {
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
      <span className="flex-1 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
        {PANE_TITLES[id]}
      </span>
    </div>
  )
}

function PaneHeader({ id, mode, onMinimize, onMaximize, onRestore }: { id: PaneId; mode: PaneMode; onMinimize: () => void; onMaximize: () => void; onRestore: () => void }) {
  return (
    <div className="flex items-center justify-between px-2 py-1 border-b border-gray-200 dark:border-gray-800 flex-none">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{PANE_TITLES[id]}</span>
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

export function IntrospectPage() {
  const { logout } = useAuth()
  const {
    connected,
    blocks,
    foundation,
    foundationTokens,
    apparatusEntries,
    usage,
    sendPrompt,
    mode,
    recording,
    recordings,
    startRecording,
    stopRecording,
    refreshRecordings,
    replayHeader,
    replayPosition,
    replayPlaying,
    loadRecording,
    replayStepForward,
    replayStepBackward,
    replayJumpToCheckpoint,
    replayPlay,
    replayPause,
    exitReplay,
    newSession,
  } = useIntrospectSocket()
  const { theme, toggleTheme } = useTheme()

  const chatPanelRef = usePanelRef()
  const apparatusPanelRef = usePanelRef()
  const panelRefs: Record<PaneId, RefObject<PanelImperativeHandle | null>> = {
    [CHAT_PANE]: chatPanelRef,
    [APPARATUS_PANE]: apparatusPanelRef,
  }

  const [paneModes, setPaneModes] = useState<Record<PaneId, PaneMode>>({ [CHAT_PANE]: 'normal', [APPARATUS_PANE]: 'normal' })
  const lastExplicitSizeRef = useRef<Record<PaneId, number>>({ ...DEFAULT_SIZES })

  const handleLayoutChanged = useCallback((layout: Layout, meta: LayoutChangedMeta) => {
    if (!meta.isUserInteraction) return
    for (const id of PANE_IDS) {
      if (typeof layout[id] === 'number') lastExplicitSizeRef.current[id] = layout[id]
    }
  }, [])

  const minimizePane = useCallback((id: PaneId) => {
    panelRefs[id].current?.collapse()
    setPaneModes((m) => ({ ...m, [id]: 'minimized' }))
  }, [])

  const maximizePane = useCallback((id: PaneId) => {
    setPaneModes((m) => {
      const next = { ...m }
      for (const otherId of PANE_IDS) {
        if (otherId === id) continue
        panelRefs[otherId].current?.collapse()
        next[otherId] = 'minimized'
      }
      next[id] = 'maximized'
      return next
    })
    panelRefs[id].current?.expand()
  }, [])

  const restorePane = useCallback((id: PaneId) => {
    setPaneModes((m) => {
      const wasMaximized = m[id] === 'maximized'
      const next = { ...m, [id]: 'normal' as PaneMode }

      panelRefs[id].current?.expand()
      panelRefs[id].current?.resize(`${lastExplicitSizeRef.current[id]}%`)

      if (wasMaximized) {
        for (const otherId of PANE_IDS) {
          if (otherId === id || m[otherId] !== 'minimized') continue
          panelRefs[otherId].current?.expand()
          panelRefs[otherId].current?.resize(`${lastExplicitSizeRef.current[otherId]}%`)
          next[otherId] = 'normal'
        }
      }
      return next
    })
  }, [])

  return (
    <div className="h-screen flex flex-col bg-white text-gray-900 dark:bg-gray-950 dark:text-white">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800">
        <span className="font-semibold">Introspect Harness</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={newSession}
            title="Reset the sandbox workspace and agent context, starting a fresh session without logging out"
            className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            New session
          </button>
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
            id={CHAT_PANE}
            panelRef={chatPanelRef}
            defaultSize={`${DEFAULT_SIZES[CHAT_PANE]}%`}
            minSize={MIN_SIZE}
            collapsible
            collapsedSize={RAIL_SIZE}
            className="flex flex-col min-h-0 border-r border-gray-200 dark:border-gray-800"
          >
            {paneModes[CHAT_PANE] === 'minimized' ? (
              <PaneRail id={CHAT_PANE} mode={paneModes[CHAT_PANE]} onRestore={() => restorePane(CHAT_PANE)} onMaximize={() => maximizePane(CHAT_PANE)} />
            ) : (
              <div className="flex flex-col h-full min-h-0">
                <PaneHeader
                  id={CHAT_PANE}
                  mode={paneModes[CHAT_PANE]}
                  onMinimize={() => minimizePane(CHAT_PANE)}
                  onMaximize={() => maximizePane(CHAT_PANE)}
                  onRestore={() => restorePane(CHAT_PANE)}
                />
                <div className="flex-1 min-h-0">
                  <ChatPanel blocks={blocks} connected={connected} onSend={sendPrompt} disabled={mode === 'replay'} />
                </div>
                <SessionTimeline
                  connected={connected}
                  mode={mode}
                  recording={recording}
                  recordings={recordings}
                  replayHeader={replayHeader}
                  replayPosition={replayPosition}
                  replayPlaying={replayPlaying}
                  onStartRecording={startRecording}
                  onStopRecording={stopRecording}
                  onRefreshRecordings={refreshRecordings}
                  onLoadRecording={loadRecording}
                  onStepForward={replayStepForward}
                  onStepBackward={replayStepBackward}
                  onJumpToCheckpoint={replayJumpToCheckpoint}
                  onPlay={replayPlay}
                  onPause={replayPause}
                  onExitReplay={exitReplay}
                />
              </div>
            )}
          </Panel>

          <Separator className="w-1 bg-gray-200 dark:bg-gray-800 hover:bg-indigo-400 dark:hover:bg-indigo-500 transition-colors cursor-col-resize" />

          <Panel
            id={APPARATUS_PANE}
            panelRef={apparatusPanelRef}
            defaultSize={`${DEFAULT_SIZES[APPARATUS_PANE]}%`}
            minSize={MIN_SIZE}
            collapsible
            collapsedSize={RAIL_SIZE}
            className="flex flex-col min-h-0"
          >
            {paneModes[APPARATUS_PANE] === 'minimized' ? (
              <PaneRail
                id={APPARATUS_PANE}
                mode={paneModes[APPARATUS_PANE]}
                onRestore={() => restorePane(APPARATUS_PANE)}
                onMaximize={() => maximizePane(APPARATUS_PANE)}
              />
            ) : (
              <div className="flex flex-col h-full min-h-0">
                <PaneHeader
                  id={APPARATUS_PANE}
                  mode={paneModes[APPARATUS_PANE]}
                  onMinimize={() => minimizePane(APPARATUS_PANE)}
                  onMaximize={() => maximizePane(APPARATUS_PANE)}
                  onRestore={() => restorePane(APPARATUS_PANE)}
                />
                <div className="flex-1 min-h-0">
                  <ApparatusView entries={apparatusEntries} foundation={foundation} foundationTokens={foundationTokens} usage={usage} />
                </div>
              </div>
            )}
          </Panel>
        </Group>
      </div>
    </div>
  )
}
