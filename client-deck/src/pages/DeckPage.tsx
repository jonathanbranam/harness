import { useAuth } from '../hooks/useAuth'
import { useDeckSocket } from '../hooks/useDeckSocket'
import { ChatPanel } from '../components/ChatPanel'
import { DeckCanvas } from '../components/DeckCanvas'
import { DeckSwitcher } from '../components/DeckSwitcher'
import { SlideSwitcher } from '../components/SlideSwitcher'
import { ApprovalDialog } from '../components/ApprovalDialog'

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
    respondApproval,
    selectDeck,
    createDeck,
    deleteDeck,
    addSlide,
    removeSlide,
    selectSlide,
  } = useDeckSocket()

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <span className="font-semibold">Deck Harness</span>
        <button type="button" onClick={() => void logout()} className="text-sm text-gray-400 hover:text-white">
          Sign out
        </button>
      </header>

      <DeckSwitcher decks={deckState.decks} activeDeckId={deckState.activeDeckId} onSelect={selectDeck} onCreate={createDeck} onDelete={deleteDeck} />
      <SlideSwitcher slides={deckState.slides} activeSlideId={deckState.activeSlideId} onSelect={selectSlide} onAdd={addSlide} onRemove={removeSlide} />

      <div className="flex-1 grid grid-cols-[1fr_380px] min-h-0">
        <DeckCanvas ref={canvasRef} deckState={deckState} onSelectionChange={sendSelection} />
        <div className="border-l border-gray-800 min-h-0">
          <ChatPanel transcript={transcript} connected={connected} onSend={sendPrompt} />
        </div>
      </div>

      {pendingApproval && <ApprovalDialog request={pendingApproval} onRespond={(approved) => respondApproval(pendingApproval.toolCallId, approved)} />}
    </div>
  )
}
