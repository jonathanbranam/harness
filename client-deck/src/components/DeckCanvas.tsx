import { forwardRef } from 'react'
import type { DeckState } from '../hooks/useDeckSocket'

export const DeckCanvas = forwardRef<HTMLDivElement, { deckState: DeckState; onSelectionChange: (ids: string[]) => void }>(
  function DeckCanvas({ deckState, onSelectionChange }, canvasRef) {
    const toggle = (id: string, additive: boolean) => {
      const selected = new Set(deckState.selection)
      if (additive) {
        selected.has(id) ? selected.delete(id) : selected.add(id)
      } else {
        selected.clear()
        selected.add(id)
      }
      onSelectionChange([...selected])
    }

    return (
      <div
        className="relative h-full bg-gray-950 overflow-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelectionChange([])
        }}
      >
        {/* Fixed size (960x540) so slide_view's render always captures a
            consistent frame regardless of object count — see design.md's
            "Screenshot dimensions are fixed" decision. */}
        <div ref={canvasRef} className="relative" style={{ width: 960, height: 540 }}>
          {deckState.objects.map((obj) => {
            const selected = deckState.selection.includes(obj.id)
            return (
              <button
                key={obj.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  toggle(obj.id, e.shiftKey)
                }}
                className={`absolute text-left rounded-md border-2 p-2 overflow-hidden transition-colors ${
                  selected ? 'border-indigo-400 ring-2 ring-indigo-400/40' : 'border-transparent'
                }`}
                style={{
                  left: obj.x,
                  top: obj.y,
                  width: obj.width,
                  height: obj.height,
                  backgroundColor: obj.fillColor,
                  fontSize: obj.fontSize,
                  color: '#fff',
                }}
              >
                {obj.text}
              </button>
            )
          })}
        </div>
      </div>
    )
  },
)
