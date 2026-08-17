import { Group, Panel, Separator } from 'react-resizable-panels'
import { PaneHeader, PaneRail, usePaneManager } from '@harness/ui'
import { useAuth } from '../hooks/useAuth'
import { useIntrospectSocket } from '../hooks/useIntrospectSocket'
import { useTheme } from '../hooks/useTheme'
import { ChatPanel } from '../components/ChatPanel'
import { ApparatusView } from '../components/ApparatusView'
import { SessionTimeline } from '../components/SessionTimeline'

const CHAT_PANE = 'chat'
const APPARATUS_PANE = 'apparatus'
/** Ordered list driving every maximize/minimize/restore computation in
 * `usePaneManager` — nothing there hardcodes "the other pane"; it always
 * iterates this list, so a third pane added later only needs an entry here
 * plus a rendered `<Panel>`. */
const PANE_IDS = [CHAT_PANE, APPARATUS_PANE] as const
type PaneId = (typeof PANE_IDS)[number]

const PANE_TITLES: Record<PaneId, string> = { [CHAT_PANE]: 'Chat with pi', [APPARATUS_PANE]: 'Apparatus' }
const DEFAULT_SIZES: Record<PaneId, number> = { [CHAT_PANE]: 65, [APPARATUS_PANE]: 35 }
const RAIL_SIZE = '44px'
const MIN_SIZE = '18%'

export function IntrospectPage() {
  const { logout } = useAuth()
  const {
    connected,
    blocks,
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
  const { paneModes, panelRefs, minimizePane, maximizePane, restorePane, handleLayoutChanged } = usePaneManager(PANE_IDS, DEFAULT_SIZES)

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
            panelRef={panelRefs[CHAT_PANE]}
            defaultSize={`${DEFAULT_SIZES[CHAT_PANE]}%`}
            minSize={MIN_SIZE}
            collapsible
            collapsedSize={RAIL_SIZE}
            className="flex flex-col min-h-0 border-r border-gray-200 dark:border-gray-800"
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
            panelRef={panelRefs[APPARATUS_PANE]}
            defaultSize={`${DEFAULT_SIZES[APPARATUS_PANE]}%`}
            minSize={MIN_SIZE}
            collapsible
            collapsedSize={RAIL_SIZE}
            className="flex flex-col min-h-0"
          >
            {paneModes[APPARATUS_PANE] === 'minimized' ? (
              <PaneRail
                title={PANE_TITLES[APPARATUS_PANE]}
                mode={paneModes[APPARATUS_PANE]}
                onRestore={() => restorePane(APPARATUS_PANE)}
                onMaximize={() => maximizePane(APPARATUS_PANE)}
              />
            ) : (
              <div className="flex flex-col h-full min-h-0">
                <PaneHeader
                  title={PANE_TITLES[APPARATUS_PANE]}
                  mode={paneModes[APPARATUS_PANE]}
                  onMinimize={() => minimizePane(APPARATUS_PANE)}
                  onMaximize={() => maximizePane(APPARATUS_PANE)}
                  onRestore={() => restorePane(APPARATUS_PANE)}
                />
                <div className="flex-1 min-h-0">
                  <ApparatusView entries={apparatusEntries} foundationTokens={foundationTokens} usage={usage} />
                </div>
              </div>
            )}
          </Panel>
        </Group>
      </div>
    </div>
  )
}
