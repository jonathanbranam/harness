import type { SlideSummary } from '../hooks/useDeckSocket'

export function SlideSwitcher({
  slides,
  activeSlideId,
  onSelect,
  onAdd,
  onRemove,
}: {
  slides: SlideSummary[]
  activeSlideId: string
  onSelect: (slideId: string) => void
  onAdd: () => void
  onRemove: (slideId: string) => void
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 overflow-x-auto">
      <span className="text-xs uppercase tracking-wide text-gray-500 shrink-0">Slides</span>
      {slides.map((slide, i) => (
        <button
          key={slide.id}
          type="button"
          onClick={() => onSelect(slide.id)}
          className={`px-3 py-1 rounded-md text-sm whitespace-nowrap ${
            slide.id === activeSlideId ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          {i + 1}
        </button>
      ))}
      <button type="button" onClick={onAdd} className="text-sm text-gray-300 hover:text-white px-2 py-1 shrink-0">
        + Slide
      </button>
      {slides.length > 1 && (
        <button
          type="button"
          onClick={() => onRemove(activeSlideId)}
          className="text-sm text-red-400 hover:text-red-300 px-2 py-1 ml-auto shrink-0"
        >
          Remove slide
        </button>
      )}
    </div>
  )
}
