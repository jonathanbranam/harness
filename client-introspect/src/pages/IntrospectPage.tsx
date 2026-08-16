import { useAuth } from '../hooks/useAuth'
import { useIntrospectSocket } from '../hooks/useIntrospectSocket'
import { useTheme } from '../hooks/useTheme'
import { ChatPanel } from '../components/ChatPanel'
import { ApparatusView } from '../components/ApparatusView'
import { SessionTimeline } from '../components/SessionTimeline'

export function IntrospectPage() {
  const { logout } = useAuth()
  const {
    connected,
    blocks,
    foundation,
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

      <div className="flex-1 grid grid-cols-[380px_1fr] min-h-0">
        <div className="border-r border-gray-200 dark:border-gray-800 min-h-0 flex flex-col">
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
        <ApparatusView blocks={blocks} foundation={foundation} usage={usage} />
      </div>
    </div>
  )
}
