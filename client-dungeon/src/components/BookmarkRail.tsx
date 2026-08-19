import { useState } from 'react'
import type { BenchIntent, BookmarkSummary } from '../bench/types'

interface BookmarkRailProps {
  bookmarks: BookmarkSummary[]
  onIntent: (intent: BenchIntent) => void
}

/**
 * Saved positions, newest first.
 *
 * The library holds *interesting starting positions* — bookmarks into board
 * states worth poking at, cheap to make and cheap to throw away — not approved
 * test cases. So saving is one field and one button, and deleting is one click
 * with no ceremony.
 */
export function BookmarkRail({ bookmarks, onIntent }: BookmarkRailProps) {
  const [name, setName] = useState('')

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onIntent({ kind: 'saveBookmark', name: trimmed })
    setName('')
  }

  return (
    <div className="w-48 shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col min-h-0">
      <div className="p-2 border-b border-gray-200 dark:border-gray-800">
        <div className="flex gap-1">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save()
            }}
            placeholder="Save as…"
            aria-label="Bookmark name"
            className="min-w-0 flex-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 bg-transparent"
          />
          <button
            type="button"
            onClick={save}
            disabled={name.trim() === ''}
            className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {bookmarks.length === 0 ? (
          <p className="p-2 text-xs text-gray-500 dark:text-gray-400">
            No saved positions yet. Set a board up, then save it — they are cheap to make and cheap to discard.
          </p>
        ) : (
          <ul>
            {bookmarks.map((bookmark) => (
              <li key={bookmark.name} className="group flex items-center gap-1 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800">
                <button
                  type="button"
                  onClick={() => onIntent({ kind: 'loadBookmark', name: bookmark.name })}
                  className="flex-1 min-w-0 text-left"
                  title={`Saved ${new Date(bookmark.savedAt).toLocaleString()}`}
                >
                  <span className="block text-xs truncate">{bookmark.name}</span>
                  <span className="block text-[10px] text-gray-500 dark:text-gray-400">
                    {bookmark.board} · {bookmark.units} unit{bookmark.units === 1 ? '' : 's'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onIntent({ kind: 'deleteBookmark', name: bookmark.name })}
                  aria-label={`Delete ${bookmark.name}`}
                  className="opacity-0 group-hover:opacity-100 px-1 text-xs text-gray-500 hover:text-red-600 dark:hover:text-red-400"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
