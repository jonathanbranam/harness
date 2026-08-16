import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useDeckSocket } from '../hooks/useDeckSocket'
import { useTheme } from '../hooks/useTheme'
import { ChatPanel } from '../components/ChatPanel'
import { DeckCanvas } from '../components/DeckCanvas'
import { DeckSwitcher } from '../components/DeckSwitcher'
import { SlideSwitcher } from '../components/SlideSwitcher'
import { ApprovalDialog } from '../components/ApprovalDialog'
import { PresentationView } from '../components/PresentationView'

export function DeckPage() {
  const { logout } = useAuth()
  const {
    connected,
    deckState,
    transcript,
    pendingApproval,
    canvasRef,
    sendPrompt,
    sendSelection,
    sendObjectUpdate,
    sendAddShape,
    sendSetSlideBackground,
    respondApproval,
    selectDeck,
    createDeck,
    deleteDeck,
    renameDeck,
    addSlide,
    removeSlide,
    selectSlide,
    undo,
    redo,
  } = useDeckSocket()
  const { theme, toggleTheme } = useTheme()
  const [isPreviewing, setIsPreviewing] = useState(false)

  if (isPreviewing) {
    return (
      <div className="h-screen flex flex-col bg-white text-gray-900 dark:bg-gray-950 dark:text-white">
        <PresentationView
          deckState={deckState}
          canvasRef={canvasRef}
          slides={deckState.slides}
          initialSlideId={deckState.activeSlideId}
          selectSlide={selectSlide}
          onExit={(lastShownSlideId) => {
            setIsPreviewing(false)
            if (lastShownSlideId !== deckState.activeSlideId) selectSlide(lastShownSlideId)
          }}
        />
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-white text-gray-900 dark:bg-gray-950 dark:text-white">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800">
        <span className="font-semibold">Deck Harness</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm disabled:opacity-40 disabled:hover:bg-indigo-600"
            disabled={!deckState.activeDeckId}
            onClick={() => setIsPreviewing(true)}
          >
            Present
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

      <DeckSwitcher
        decks={deckState.decks}
        activeDeckId={deckState.activeDeckId}
        onSelect={selectDeck}
        onCreate={createDeck}
        onDelete={deleteDeck}
        onRename={renameDeck}
      />
      <SlideSwitcher slides={deckState.slides} activeSlideId={deckState.activeSlideId} onSelect={selectSlide} onAdd={addSlide} onRemove={removeSlide} />

      <div className="flex-1 grid grid-cols-[1fr_380px] min-h-0">
        <DeckCanvas
          ref={canvasRef}
          deckState={deckState}
          onSelectionChange={sendSelection}
          onObjectUpdate={sendObjectUpdate}
          onAddShape={sendAddShape}
          onSetSlideBackground={sendSetSlideBackground}
          onUndo={undo}
          onRedo={redo}
        />
        <div className="border-l border-gray-200 dark:border-gray-800 min-h-0">
          <ChatPanel transcript={transcript} connected={connected} onSend={sendPrompt} />
        </div>
      </div>

      {pendingApproval && <ApprovalDialog request={pendingApproval} onRespond={(approved) => respondApproval(pendingApproval.toolCallId, approved)} />}
    </div>
  )
}
