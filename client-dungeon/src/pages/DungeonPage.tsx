import { useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { findLatestPreview, useDungeonSocket, type AttackPreviewResult, type MovementPreviewResult } from '../hooks/useDungeonSocket'
import { useTheme } from '../hooks/useTheme'
import { BoardCanvas } from '../components/BoardCanvas'
import { ChatPanel } from '../components/ChatPanel'
import { ApprovalDialog } from '../components/ApprovalDialog'

export function DungeonPage() {
  const { logout } = useAuth()
  const { connected, transcript, pendingApproval, boardState, sendPrompt, respondApproval } = useDungeonSocket()
  const { theme, toggleTheme } = useTheme()

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

      <div className="flex-1 grid grid-cols-[1fr_380px] min-h-0">
        <BoardCanvas boardState={boardState} movementPreview={movementPreview} attackPreview={attackPreview} />
        <div className="border-l border-gray-200 dark:border-gray-800 min-h-0">
          <ChatPanel transcript={transcript} connected={connected} onSend={sendPrompt} />
        </div>
      </div>

      {pendingApproval && <ApprovalDialog request={pendingApproval} onRespond={(approved) => respondApproval(pendingApproval.toolCallId, approved)} />}
    </div>
  )
}
