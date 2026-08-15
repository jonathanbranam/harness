import { useState } from 'react'
import type { DeckSummary } from '../hooks/useDeckSocket'

export function DeckSwitcher({
  decks,
  activeDeckId,
  onSelect,
  onCreate,
  onDelete,
}: {
  decks: DeckSummary[]
  activeDeckId: string
  onSelect: (deckId: string) => void
  onCreate: (name: string) => void
  onDelete: (deckId: string) => void
}) {
  const [newName, setNewName] = useState('')

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 overflow-x-auto">
      <span className="text-xs uppercase tracking-wide text-gray-500 shrink-0">Decks</span>
      {decks.map((deck) => (
        <button
          key={deck.id}
          type="button"
          onClick={() => onSelect(deck.id)}
          className={`px-3 py-1 rounded-md text-sm whitespace-nowrap ${
            deck.id === activeDeckId ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          {deck.name} <span className="text-xs opacity-70">({deck.slideCount})</span>
        </button>
      ))}
      <form
        className="flex items-center gap-1 shrink-0"
        onSubmit={(e) => {
          e.preventDefault()
          const name = newName.trim()
          if (!name) return
          onCreate(name)
          setNewName('')
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New deck name"
          className="bg-gray-800 text-sm text-white rounded-md px-2 py-1 w-32 outline-none placeholder:text-gray-500"
        />
        <button type="submit" className="text-sm text-gray-300 hover:text-white px-2 py-1">
          + Deck
        </button>
      </form>
      {decks.length > 1 && (
        <button type="button" onClick={() => onDelete(activeDeckId)} className="text-sm text-red-400 hover:text-red-300 px-2 py-1 ml-auto shrink-0">
          Delete deck
        </button>
      )}
    </div>
  )
}
