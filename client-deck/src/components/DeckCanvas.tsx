import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import type { DeckObject, DeckState, TextBlock, UpdateActionCall } from '../hooks/useDeckSocket'
import { genId } from '../id'
import {
  blockMarkers,
  blocksToEditableHtml,
  getSelectionOffsets,
  isListTypeAppliedThroughout,
  isMarkAppliedThroughout,
  parseEditableDom,
  placeCaretAtEnd,
} from '../text-blocks'

const CANVAS_WIDTH = 960
const CANVAS_HEIGHT = 540
const MIN_SIZE = 20
const NEW_BOX_DEFAULT = { x: 40, y: 40, width: 220, height: 100 }
const RESIZE_CORNERS = ['nw', 'ne', 'sw', 'se'] as const
type Corner = (typeof RESIZE_CORNERS)[number]

type Rect = { x: number; y: number; width: number; height: number }

interface DeckCanvasProps {
  deckState: DeckState
  onSelectionChange: (ids: string[]) => void
  onObjectUpdate: (actions: UpdateActionCall[]) => void
}

const CORNER_CLASSES: Record<Corner, string> = {
  nw: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  ne: 'top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  sw: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
  se: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
}

function TextObjectBox({
  obj,
  selected,
  editing,
  onPointerDownMove,
  onPointerDownResize,
  onClick,
  onDoubleClick,
  onStartEditingCommit,
  liveRect,
  onObjectUpdate,
}: {
  obj: DeckObject
  selected: boolean
  editing: boolean
  onPointerDownMove: (e: React.PointerEvent) => void
  onPointerDownResize: (e: React.PointerEvent, corner: Corner) => void
  onClick: (e: React.MouseEvent) => void
  onDoubleClick: (e: React.MouseEvent) => void
  onStartEditingCommit: () => void
  liveRect: Rect | undefined
  onObjectUpdate: (actions: UpdateActionCall[]) => void
}) {
  const editableRef = useRef<HTMLDivElement | null>(null)
  const lastKnownTextRef = useRef<string>('')
  const rect = liveRect ?? obj

  // commitText fires on blur, immediately followed by onStartEditingCommit
  // switching this box out of the contenteditable view into the static
  // display below — which renders obj.text, the pre-edit server-confirmed
  // value, until the setText round trip lands. Mirrors liveRects: hold the
  // just-committed blocks locally and keep showing them until obj.text
  // actually catches up, instead of flashing back to the old text first.
  const [pendingText, setPendingText] = useState<TextBlock[] | null>(null)
  useEffect(() => {
    if (pendingText && JSON.stringify(pendingText) === JSON.stringify(obj.text)) setPendingText(null)
  }, [obj.text, pendingText])
  const displayText = pendingText ?? obj.text

  // Seed the contenteditable exactly once per edit session — see
  // text-blocks.ts's doc comment for why the DOM is otherwise left
  // uncontrolled while the user types.
  useEffect(() => {
    if (!editing) return
    const node = editableRef.current
    if (!node) return
    node.innerHTML = blocksToEditableHtml(obj.text)
    lastKnownTextRef.current = JSON.stringify(obj.text)
    placeCaretAtEnd(node)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  // Refresh the DOM if the object's committed text changed for a reason
  // other than our own typing (e.g. the format toolbar's applyTextStyle
  // round trip, or a pi tool call editing the same box while it's open).
  useEffect(() => {
    if (!editing) return
    const node = editableRef.current
    if (!node) return
    const serialized = JSON.stringify(obj.text)
    if (serialized !== lastKnownTextRef.current) {
      node.innerHTML = blocksToEditableHtml(obj.text)
      lastKnownTextRef.current = serialized
    }
  }, [editing, obj.text])

  const commitText = useCallback(() => {
    const node = editableRef.current
    if (!node) return
    const blocks = parseEditableDom(node)
    setPendingText(blocks)
    onObjectUpdate([{ action: 'setText', targetIds: [obj.id], args: { text: blocks } }])
  }, [obj.id, onObjectUpdate])

  const applyMark = useCallback(
    (mark: 'bold' | 'italic') => {
      const node = editableRef.current
      if (!node) return
      const offsets = getSelectionOffsets(node)
      if (!offsets || offsets.start === offsets.end) return
      const blocks = parseEditableDom(node)
      const value = !isMarkAppliedThroughout(blocks, offsets.start, offsets.end, mark)
      onObjectUpdate([
        { action: 'setText', targetIds: [obj.id], args: { text: blocks } },
        { action: 'applyTextStyle', targetIds: [obj.id], args: { start: offsets.start, end: offsets.end, mark, value } },
      ])
    },
    [obj.id, onObjectUpdate],
  )

  const applyListType = useCallback(
    (listType: 'bulleted' | 'numbered' | null) => {
      const node = editableRef.current
      if (!node) return
      const offsets = getSelectionOffsets(node) ?? { start: 0, end: 0 }
      const blocks = parseEditableDom(node)
      const nextType = listType && !isListTypeAppliedThroughout(blocks, offsets.start, offsets.end, listType) ? listType : null
      onObjectUpdate([
        { action: 'setText', targetIds: [obj.id], args: { text: blocks } },
        { action: 'applyTextStyle', targetIds: [obj.id], args: { start: offsets.start, end: offsets.end, listType: nextType } },
      ])
    },
    [obj.id, onObjectUpdate],
  )

  return (
    <div
      className={`absolute rounded-md border-2 transition-colors ${selected ? 'border-indigo-400 ring-2 ring-indigo-400/40' : 'border-transparent'}`}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        backgroundColor: obj.fillColor === 'transparent' ? 'transparent' : obj.fillColor,
        borderColor: obj.borderColor === 'transparent' ? undefined : obj.borderColor,
        fontSize: obj.fontSize,
        color: obj.fontColor,
      }}
      onPointerDown={editing ? undefined : onPointerDownMove}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {editing ? (
        <>
          <div
            className="absolute -top-9 left-0 flex gap-1 bg-gray-800 border border-gray-700 rounded px-1 py-1 z-10"
            // mousedown (not click) is what the browser uses to move focus /
            // collapse the current selection by default; preventing it here
            // keeps the contenteditable's selection intact so applyMark/
            // applyListType read the range the user actually made, not an
            // empty one collapsed by clicking the toolbar itself.
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button type="button" className="px-2 text-xs font-bold text-white hover:bg-gray-700 rounded" onClick={() => applyMark('bold')}>
              B
            </button>
            <button type="button" className="px-2 text-xs italic text-white hover:bg-gray-700 rounded" onClick={() => applyMark('italic')}>
              I
            </button>
            <button type="button" className="px-2 text-xs text-white hover:bg-gray-700 rounded" onClick={() => applyListType('bulleted')}>
              • List
            </button>
            <button type="button" className="px-2 text-xs text-white hover:bg-gray-700 rounded" onClick={() => applyListType('numbered')}>
              1. List
            </button>
            <button type="button" className="px-2 text-xs text-gray-300 hover:bg-gray-700 rounded" onClick={() => applyListType(null)}>
              Clear list
            </button>
          </div>
          <div
            ref={editableRef}
            contentEditable
            suppressContentEditableWarning
            className="w-full h-full p-2 outline-none [&_div]:min-h-[1em]"
            onBlur={() => {
              commitText()
              onStartEditingCommit()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.currentTarget.blur()
              }
            }}
          />
        </>
      ) : (
        // select-none/cursor-default: this text is plain DOM content, not
        // the contenteditable — without these the browser treats it as
        // ordinary selectable text (I-beam cursor, native double-click word
        // selection) which misleadingly suggests a single click edits it,
        // when only double-click actually enters edit mode.
        <div className="w-full h-full p-2 overflow-hidden select-none cursor-default">
          {blockMarkers(displayText).map(({ block, marker }, i) => (
            <div key={i} className="flex gap-1.5">
              {marker && <span className="shrink-0">{marker}</span>}
              <span>
                {block.runs.map((run, j) => (
                  <span key={j} style={{ fontWeight: run.bold ? 700 : 400, fontStyle: run.italic ? 'italic' : 'normal' }}>
                    {run.text}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
      {selected && !editing && (
        <>
          {RESIZE_CORNERS.map((corner) => (
            <div
              key={corner}
              className={`absolute w-3 h-3 rounded-full bg-indigo-400 border border-white/70 ${CORNER_CLASSES[corner]}`}
              onPointerDown={(e) => onPointerDownResize(e, corner)}
            />
          ))}
        </>
      )}
    </div>
  )
}

export const DeckCanvas = forwardRef<HTMLDivElement, DeckCanvasProps>(function DeckCanvas({ deckState, onSelectionChange, onObjectUpdate }, canvasRef) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [liveRects, setLiveRects] = useState<Record<string, Rect>>({})
  const didDragRef = useRef(false)
  const pendingEditIdRef = useRef<string | null>(null)

  // Scale-to-fit: the slide keeps its fixed 960x540 logical size (so object
  // coordinates and slide_view's screenshot capture are unaffected — see
  // design.md's "Scale via CSS transform" decision) but is displayed scaled
  // to the largest size that fits the pane. paneRef's padding is excluded
  // from ResizeObserver's contentRect automatically, so that padding is what
  // guarantees a non-zero margin on every side even when the pane's aspect
  // ratio exactly matches the slide's.
  const paneRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  const scaleRef = useRef(1)

  useEffect(() => {
    const node = paneRef.current
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      const next = Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT)
      if (next > 0 && Number.isFinite(next)) {
        scaleRef.current = next
        setScale(next)
      }
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Exit edit mode if the editing object was removed (e.g. deleted by pi
  // mid-edit) or the active slide changed out from under it.
  useEffect(() => {
    if (editingId && !deckState.objects.some((o) => o.id === editingId)) setEditingId(null)
  }, [editingId, deckState.objects])

  // A freshly added box has no text and no visible affordance hinting that
  // it needs a double-click to edit, so "+ Text box" should drop straight
  // into edit mode. The new object only exists once the addObject round
  // trip lands in deckState.objects, so addTextBox records the id here and
  // this effect promotes it to editingId as soon as it actually appears.
  useEffect(() => {
    if (pendingEditIdRef.current && deckState.objects.some((o) => o.id === pendingEditIdRef.current)) {
      setEditingId(pendingEditIdRef.current)
      pendingEditIdRef.current = null
    }
  }, [deckState.objects])

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

  const setLiveRect = useCallback((id: string, rect: Rect) => {
    setLiveRects((r) => ({ ...r, [id]: rect }))
  }, [])

  // Drag/resize release sends the final rect to the server but doesn't
  // clear liveRects itself — deckState.objects still holds the pre-drag
  // position/size until the server's deck_state round trip lands, so
  // clearing eagerly rendered one frame at the stale obj rect (a flicker
  // back to the original position/size before snapping to the new one).
  // Instead, keep rendering the live rect until the confirmed object
  // actually matches it (or the object is gone).
  useEffect(() => {
    setLiveRects((prev) => {
      if (Object.keys(prev).length === 0) return prev
      let changed = false
      const next = { ...prev }
      for (const id of Object.keys(prev)) {
        const obj = deckState.objects.find((o) => o.id === id)
        const live = prev[id]
        if (!obj || (obj.x === live.x && obj.y === live.y && obj.width === live.width && obj.height === live.height)) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [deckState.objects])

  const handlePointerDownMove = useCallback(
    (e: React.PointerEvent, obj: DeckObject) => {
      if (editingId === obj.id) return
      e.stopPropagation()
      didDragRef.current = false
      const startClientX = e.clientX
      const startClientY = e.clientY
      const originX = obj.x
      const originY = obj.y
      let latest: Rect = { x: originX, y: originY, width: obj.width, height: obj.height }

      function onMove(ev: PointerEvent) {
        const dx = (ev.clientX - startClientX) / scaleRef.current
        const dy = (ev.clientY - startClientY) / scaleRef.current
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDragRef.current = true
        latest = { x: originX + dx, y: originY + dy, width: obj.width, height: obj.height }
        setLiveRect(obj.id, latest)
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        // No liveRect was ever set unless onMove fired at least once, so
        // there's nothing to clear here when didDragRef.current is false —
        // the reconciling effect above handles clearing once dragged.
        if (didDragRef.current) {
          onObjectUpdate([{ action: 'setPosition', targetIds: [obj.id], args: { x: latest.x, y: latest.y } }])
        }
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [editingId, onObjectUpdate, setLiveRect],
  )

  const handlePointerDownResize = useCallback(
    (e: React.PointerEvent, obj: DeckObject, corner: Corner) => {
      e.stopPropagation()
      e.preventDefault()
      const startClientX = e.clientX
      const startClientY = e.clientY
      const originX = obj.x
      const originY = obj.y
      const originWidth = obj.width
      const originHeight = obj.height
      let latest: Rect = { x: originX, y: originY, width: originWidth, height: originHeight }

      function onMove(ev: PointerEvent) {
        const dx = (ev.clientX - startClientX) / scaleRef.current
        const dy = (ev.clientY - startClientY) / scaleRef.current
        let { x, y, width, height } = { x: originX, y: originY, width: originWidth, height: originHeight }
        if (corner.includes('e')) width = Math.max(MIN_SIZE, originWidth + dx)
        if (corner.includes('s')) height = Math.max(MIN_SIZE, originHeight + dy)
        if (corner.includes('w')) {
          width = Math.max(MIN_SIZE, originWidth - dx)
          x = originX + (originWidth - width)
        }
        if (corner.includes('n')) {
          height = Math.max(MIN_SIZE, originHeight - dy)
          y = originY + (originHeight - height)
        }
        latest = { x, y, width, height }
        setLiveRect(obj.id, latest)
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        onObjectUpdate([
          { action: 'setPosition', targetIds: [obj.id], args: { x: latest.x, y: latest.y } },
          { action: 'setSize', targetIds: [obj.id], args: { width: latest.width, height: latest.height } },
        ])
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [onObjectUpdate, setLiveRect],
  )

  const addTextBox = useCallback(() => {
    const id = genId()
    onObjectUpdate([
      {
        action: 'addObject',
        targetIds: [],
        args: { id, ...NEW_BOX_DEFAULT, text: '', fillColor: '#374151', borderColor: 'transparent', fontColor: '#ffffff', fontSize: 16 },
      },
    ])
    onSelectionChange([id])
    pendingEditIdRef.current = id
  }, [onObjectUpdate, onSelectionChange])

  const deleteSelection = useCallback(() => {
    if (deckState.selection.length === 0) return
    onObjectUpdate([{ action: 'removeObject', targetIds: deckState.selection, args: {} }])
    if (editingId && deckState.selection.includes(editingId)) setEditingId(null)
  }, [deckState.selection, onObjectUpdate, editingId])

  // Delete/Backspace deletes the selection, but only when not actively
  // editing text (where those keys must edit the text itself).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (editingId) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && deckState.selection.length > 0) {
        const target = e.target as HTMLElement | null
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
        e.preventDefault()
        deleteSelection()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editingId, deckState.selection, deleteSelection])

  const selectedObjects = deckState.objects.filter((o) => deckState.selection.includes(o.id))
  const firstSelected = selectedObjects[0]

  const setStyleOnSelection = (action: UpdateActionCall['action'], args: Record<string, unknown>) => {
    if (deckState.selection.length === 0) return
    onObjectUpdate([{ action, targetIds: deckState.selection, args }])
  }

  return (
    // min-w-0: this is the grid item for DeckPage's `1fr` column. Without it,
    // its default overflow:visible min-width:auto resolves to its content's
    // min-content size — and since a descendant (the scaled canvas wrapper
    // below) has an explicit pixel width derived from `scale`, that would
    // ratchet the grid track's minimum width up on every render and never
    // let it shrink back down, only grow (mirrors DeckPage.tsx's min-h-0 on
    // the same grid, but for the horizontal axis).
    <div className="h-full min-w-0 flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 bg-gray-900 text-sm">
        <button type="button" className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white" onClick={addTextBox}>
          + Text box
        </button>
        <button
          type="button"
          className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-40 disabled:hover:bg-gray-700"
          disabled={deckState.selection.length === 0}
          onClick={deleteSelection}
        >
          Delete
        </button>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        <label className="flex items-center gap-1 text-gray-300">
          Font size
          <input
            type="number"
            className="w-14 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-white disabled:opacity-40"
            disabled={!firstSelected}
            value={firstSelected?.fontSize ?? ''}
            onChange={(e) => {
              const fontSize = Number(e.target.value)
              if (Number.isFinite(fontSize) && fontSize > 0) setStyleOnSelection('setFontSize', { fontSize })
            }}
          />
        </label>

        <label className="flex items-center gap-1 text-gray-300">
          Font
          <input
            type="color"
            className="w-6 h-6 bg-transparent disabled:opacity-40"
            disabled={!firstSelected}
            value={firstSelected?.fontColor ?? '#ffffff'}
            onChange={(e) => setStyleOnSelection('setFontColor', { color: e.target.value })}
          />
        </label>

        <label className="flex items-center gap-1 text-gray-300">
          Fill
          <input
            type="color"
            className="w-6 h-6 bg-transparent disabled:opacity-40"
            disabled={!firstSelected}
            value={firstSelected && firstSelected.fillColor !== 'transparent' ? firstSelected.fillColor : '#374151'}
            onChange={(e) => setStyleOnSelection('setFillColor', { color: e.target.value })}
          />
          <button
            type="button"
            className="text-xs text-gray-400 hover:text-white disabled:opacity-40"
            disabled={!firstSelected}
            onClick={() => setStyleOnSelection('setFillColor', { color: 'transparent' })}
          >
            none
          </button>
        </label>

        <label className="flex items-center gap-1 text-gray-300">
          Border
          <input
            type="color"
            className="w-6 h-6 bg-transparent disabled:opacity-40"
            disabled={!firstSelected}
            value={firstSelected && firstSelected.borderColor !== 'transparent' ? firstSelected.borderColor : '#ffffff'}
            onChange={(e) => setStyleOnSelection('setBorderColor', { color: e.target.value })}
          />
          <button
            type="button"
            className="text-xs text-gray-400 hover:text-white disabled:opacity-40"
            disabled={!firstSelected}
            onClick={() => setStyleOnSelection('setBorderColor', { color: 'transparent' })}
          >
            none
          </button>
        </label>
      </div>

      <div
        className="relative flex-1 min-w-0 min-h-0 bg-gray-950 overflow-hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelectionChange([])
        }}
      >
        {/* paneRef's padding reserves a minimum margin on every side (excluded
            from ResizeObserver's contentRect, so it isn't counted as fittable
            space) and flex-centers the scaled slide within whatever's left. */}
        <div ref={paneRef} className="w-full h-full flex items-center justify-center p-8">
          {/* Sized to the *scaled* dimensions so it reserves the right layout
              space — the transform below doesn't affect the inner div's own
              layout box. */}
          <div style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}>
            {/* Fixed logical size (960x540) so slide_view's render always
                captures a consistent frame regardless of object count — see
                design.md's "Screenshot dimensions are fixed" decision. Visual
                size instead tracks the pane via a CSS transform, which
                useDeckSocket's toPng capture explicitly neutralizes. */}
            <div
              ref={canvasRef}
              className="relative bg-white border border-gray-300"
              style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left' }}
            >
              {deckState.objects.map((obj) => (
                <TextObjectBox
                  key={obj.id}
                  obj={obj}
                  selected={deckState.selection.includes(obj.id)}
                  editing={editingId === obj.id}
                  liveRect={liveRects[obj.id]}
                  onObjectUpdate={onObjectUpdate}
                  onPointerDownMove={(e) => handlePointerDownMove(e, obj)}
                  onPointerDownResize={(e, corner) => handlePointerDownResize(e, obj, corner)}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (didDragRef.current) {
                      didDragRef.current = false
                      return
                    }
                    toggle(obj.id, e.shiftKey)
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    onSelectionChange([obj.id])
                    setEditingId(obj.id)
                  }}
                  onStartEditingCommit={() => setEditingId(null)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
