import { useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { ChatPanel, PaneHeader, PaneRail, usePaneManager } from '@harness/ui'
import { useAuth } from '../hooks/useAuth'
import { useDeckSocket } from '../hooks/useDeckSocket'
import { useTheme } from '../hooks/useTheme'
import { DeckCanvas } from '../components/DeckCanvas'
import { DeckSwitcher } from '../components/DeckSwitcher'
import { SlideSwitcher } from '../components/SlideSwitcher'
import { ApprovalDialog } from '../components/ApprovalDialog'
import { PresentationView } from '../components/PresentationView'

const CANVAS_PANE = 'canvas'
const CHAT_PANE = 'chat'
/** Ordered list driving every maximize/minimize/restore computation in
 * `usePaneManager` — nothing there hardcodes "the other pane"; it always
 * iterates this list, so a third pane added later only needs an entry here
 * plus a rendered `<Panel>`. */
const PANE_IDS = [CANVAS_PANE, CHAT_PANE] as const
type PaneId = (typeof PANE_IDS)[number]
const PANE_TITLES: Record<PaneId, string> = { [CANVAS_PANE]: 'Canvas', [CHAT_PANE]: 'Chat with pi' }
const DEFAULT_SIZES: Record<PaneId, number> = { [CANVAS_PANE]: 75, [CHAT_PANE]: 25 }
const RAIL_SIZE = '44px'
const MIN_SIZE = '18%'

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
    sendAddImage,
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
  const { paneModes, panelRefs, minimizePane, maximizePane, restorePane, handleLayoutChanged } = usePaneManager(PANE_IDS, DEFAULT_SIZES)

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

      <div className="flex-1 min-h-0">
        <Group orientation="horizontal" onLayoutChanged={handleLayoutChanged} className="h-full">
          <Panel
            id={CANVAS_PANE}
            panelRef={panelRefs[CANVAS_PANE]}
            defaultSize={`${DEFAULT_SIZES[CANVAS_PANE]}%`}
            minSize={MIN_SIZE}
            collapsible
            collapsedSize={RAIL_SIZE}
            className="flex flex-col min-h-0"
          >
            {paneModes[CANVAS_PANE] === 'minimized' ? (
              <PaneRail
                title={PANE_TITLES[CANVAS_PANE]}
                mode={paneModes[CANVAS_PANE]}
                onRestore={() => restorePane(CANVAS_PANE)}
                onMaximize={() => maximizePane(CANVAS_PANE)}
              />
            ) : (
              <div className="flex flex-col h-full min-h-0">
                <PaneHeader
                  title={PANE_TITLES[CANVAS_PANE]}
                  mode={paneModes[CANVAS_PANE]}
                  onMinimize={() => minimizePane(CANVAS_PANE)}
                  onMaximize={() => maximizePane(CANVAS_PANE)}
                  onRestore={() => restorePane(CANVAS_PANE)}
                />
                <div className="flex-1 min-h-0">
                  <DeckCanvas
                    ref={canvasRef}
                    deckState={deckState}
                    onSelectionChange={sendSelection}
                    onObjectUpdate={sendObjectUpdate}
                    onAddShape={sendAddShape}
                    onAddImage={sendAddImage}
                    onSetSlideBackground={sendSetSlideBackground}
                    onUndo={undo}
                    onRedo={redo}
                  />
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
                  <ChatPanel transcript={transcript} connected={connected} onSend={sendPrompt} placeholder="Ask pi to edit the deck…" />
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
