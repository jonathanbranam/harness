import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type {
  ArrowObject,
  BoxObject,
  DeckObject,
  DeckState,
  EllipseObject,
  ImageObject,
  LineObject,
  ShapeObject,
  ShapeType,
  TextBlock,
  TextBoxObject,
  UpdateActionCall,
} from '../hooks/useDeckSocket'
import { imagesApi } from '../api'
import { genId } from '../id'
import { loadNaturalImageSize } from '../image-size'
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
const NEW_SHAPE_DEFAULTS: Record<ShapeType, Record<string, unknown>> = {
  box: { x: 60, y: 60, width: 200, height: 120 },
  ellipse: { x: 60, y: 60, width: 160, height: 160 },
  line: { x1: 60, y1: 60, x2: 260, y2: 60 },
  arrow: { x1: 60, y1: 60, x2: 260, y2: 60 },
}
const RESIZE_CORNERS = ['nw', 'ne', 'sw', 'se'] as const
type Corner = (typeof RESIZE_CORNERS)[number]
const NEW_IMAGE_MAX_WIDTH = 300
const CROP_PANEL_MAX = 420
const MIN_CROP_SIZE = 10
const ROTATE_HANDLE_OFFSET = 24

// Selection outline/resize handles/format toolbar (fix-selection-tools-zorder)
// paint above every object via a fixed z-index rather than relying on DOM
// order, since objects now carry their own explicit z-index (design.md's
// "Interaction with fix-selection-tools-zorder's overlay" decision). The
// object currently being edited gets a z-index just under the overlay's, for
// the same reason: DOM-order-based "bring to front while editing" (mirrored
// below by objectsInPaintOrder, kept for equal-z-index tiebreaking) no
// longer wins against a sibling with a higher stored z-index once every
// object has an explicit one.
const SELECTION_OVERLAY_Z_INDEX = 9999
const EDITING_Z_INDEX = 9998

// Diagonal red line drawn over a color swatch to indicate "no color" —
// a gradient rather than a rotated element so it stays crisp at any swatch size.
const NONE_SWATCH_OVERLAY_STYLE = {
  background:
    'linear-gradient(to top right, transparent calc(50% - 1.5px), #ef4444 calc(50% - 1.5px), #ef4444 calc(50% + 1.5px), transparent calc(50% + 1.5px))',
}

type Rect = { x: number; y: number; width: number; height: number }
interface EndpointOverride {
  which: 'start' | 'end'
  x: number
  y: number
}

/**
 * Mirrors editor-state.ts's clampToSlide: size first (so an oversized
 * request never leaves the far edge off-slide), then position against the
 * (possibly just-clamped) size. Keeps live drag/resize feedback pinned to
 * the slide edge instead of visually snapping back after the server's
 * authoritative clamp on release (constrain-content-to-slide-bounds design.md).
 */
function clampRectToSlide(rect: Rect): Rect {
  const width = Math.min(Math.max(1, rect.width), CANVAS_WIDTH)
  const height = Math.min(Math.max(1, rect.height), CANVAS_HEIGHT)
  const x = Math.min(Math.max(0, rect.x), CANVAS_WIDTH - width)
  const y = Math.min(Math.max(0, rect.y), CANVAS_HEIGHT - height)
  return { x, y, width, height }
}

function isLineLike(obj: DeckObject): obj is LineObject | ArrowObject {
  return obj.type === 'line' || obj.type === 'arrow'
}

function isImage(obj: DeckObject): obj is ImageObject {
  return obj.type === 'image'
}

/** Mirrors editor-state.ts's hasRotation — the four bounding-box types that carry an independently settable rotation. */
function hasRotation(obj: DeckObject): obj is TextBoxObject | ImageObject | BoxObject | EllipseObject {
  return obj.type === 'textBox' || obj.type === 'image' || obj.type === 'box' || obj.type === 'ellipse'
}

/** Rotates a (dx, dy) vector by `degrees` — used to move a raw pointer delta into/out of a rotated object's own local frame (design.md's rotated-resize local-frame transform). */
function rotateVector(dx: number, dy: number, degrees: number): [number, number] {
  const rad = (degrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return [dx * cos - dy * sin, dx * sin + dy * cos]
}

/** Bounding box for any object type — mirrors editor-state.ts's boundsOf, duplicated client-side per CLAUDE.md's "No packages/ tier yet". */
function boundsOf(obj: DeckObject): Rect {
  if (isLineLike(obj)) {
    return { x: Math.min(obj.x1, obj.x2), y: Math.min(obj.y1, obj.y2), width: Math.abs(obj.x2 - obj.x1), height: Math.abs(obj.y2 - obj.y1) }
  }
  return { x: obj.x, y: obj.y, width: obj.width, height: obj.height }
}

/** Resolves a line/arrow's rendered endpoints, applying whichever live override (single-endpoint drag, or whole-object move) is active. */
function endpointsOf(obj: LineObject | ArrowObject, liveEndpoint?: EndpointOverride, liveRect?: Rect): { x1: number; y1: number; x2: number; y2: number } {
  if (liveEndpoint) {
    return liveEndpoint.which === 'start'
      ? { x1: liveEndpoint.x, y1: liveEndpoint.y, x2: obj.x2, y2: obj.y2 }
      : { x1: obj.x1, y1: obj.y1, x2: liveEndpoint.x, y2: liveEndpoint.y }
  }
  if (liveRect) {
    const bounds = boundsOf(obj)
    const dx = liveRect.x - bounds.x
    const dy = liveRect.y - bounds.y
    return { x1: obj.x1 + dx, y1: obj.y1 + dy, x2: obj.x2 + dx, y2: obj.y2 + dy }
  }
  return { x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 }
}

/** Bounding rect for rendering/selection purposes, folding in whichever live drag override is active. */
function liveBoundsOf(obj: DeckObject, liveRect?: Rect, liveEndpoint?: EndpointOverride): Rect {
  if (isLineLike(obj)) {
    if (liveRect || liveEndpoint) {
      const { x1, y1, x2, y2 } = endpointsOf(obj, liveEndpoint, liveRect)
      return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) }
    }
    return boundsOf(obj)
  }
  return liveRect ?? { x: obj.x, y: obj.y, width: obj.width, height: obj.height }
}

interface DeckCanvasProps {
  deckState: DeckState
  onSelectionChange: (ids: string[]) => void
  onObjectUpdate: (actions: UpdateActionCall[]) => void
  onAddShape?: (args: Record<string, unknown>) => void
  onAddImage?: (args: Record<string, unknown>) => void
  onSetSlideBackground?: (color: string) => void
  onUndo: () => void
  onRedo: () => void
  /** Read-only render for preview mode: no toolbar, no selection highlight, no click/drag/edit interactions. */
  readOnly?: boolean
}

const CORNER_CLASSES: Record<Corner, string> = {
  nw: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  ne: 'top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  sw: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
  se: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
}

interface TextObjectBoxHandle {
  applyMark: (mark: 'bold' | 'italic') => void
  applyListType: (listType: 'bulleted' | 'numbered' | null) => void
}

const TextObjectBox = forwardRef<
  TextObjectBoxHandle,
  {
    obj: TextBoxObject
    editing: boolean
    rect: Rect
    zIndex: number
    liveRotation?: number
    onPointerDownMove: (e: React.PointerEvent) => void
    onClick: (e: React.MouseEvent) => void
    onDoubleClick: (e: React.MouseEvent) => void
    onStartEditingCommit: () => void
    onObjectUpdate: (actions: UpdateActionCall[]) => void
  }
>(function TextObjectBox({ obj, editing, rect, zIndex, liveRotation, onPointerDownMove, onClick, onDoubleClick, onStartEditingCommit, onObjectUpdate }, ref) {
  const editableRef = useRef<HTMLDivElement | null>(null)
  const lastKnownTextRef = useRef<string>('')

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

  useImperativeHandle(ref, () => ({ applyMark, applyListType }), [applyMark, applyListType])

  return (
    <div
      className="absolute rounded-md border-2 border-transparent"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        zIndex,
        opacity: obj.opacity,
        transform: `rotate(${liveRotation ?? obj.rotation}deg)`,
        transformOrigin: 'center',
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
        // key="editing" (vs. key="display" below): both branches render a
        // plain <div> at this same position, so without distinct keys React
        // reuses one DOM node across the transition and just patches its
        // props/children — but this div's content is set via direct
        // node.innerHTML mutation (outside React's tracked children, by
        // design, per the doc comment above). React then thinks it's going
        // from 0 tracked children to N (the display branch's blockMarkers
        // output) and *appends* them next to the untracked raw markup
        // instead of replacing it, leaving stale seeded HTML behind as a
        // permanent orphaned sibling — visible as duplicated text. Distinct
        // keys force a real unmount/mount instead of an in-place patch.
        <div
          key="editing"
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
      ) : (
        // select-none/cursor-default: this text is plain DOM content, not
        // the contenteditable — without these the browser treats it as
        // ordinary selectable text (I-beam cursor, native double-click word
        // selection) which misleadingly suggests a single click edits it,
        // when only double-click actually enters edit mode.
        <div key="display" className="w-full h-full p-2 overflow-hidden select-none cursor-default">
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
    </div>
  )
})

function ShapeObjectBox({
  obj,
  liveRect,
  liveEndpoint,
  zIndex,
  liveRotation,
  onPointerDownMove,
  onClick,
}: {
  obj: ShapeObject
  liveRect?: Rect
  liveEndpoint?: EndpointOverride
  zIndex: number
  liveRotation?: number
  onPointerDownMove: (e: React.PointerEvent) => void
  onClick: (e: React.MouseEvent) => void
}) {
  if (obj.type === 'box' || obj.type === 'ellipse') {
    const rect = liveRect ?? { x: obj.x, y: obj.y, width: obj.width, height: obj.height }
    return (
      <div
        className="absolute"
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          zIndex,
          opacity: obj.opacity,
          transform: `rotate(${liveRotation ?? obj.rotation}deg)`,
          transformOrigin: 'center',
          backgroundColor: obj.fillColor === 'transparent' ? 'transparent' : obj.fillColor,
          border: `${obj.borderWidth}px solid ${obj.borderColor === 'transparent' ? 'transparent' : obj.borderColor}`,
          borderRadius: obj.type === 'box' ? obj.cornerRadius : '9999px',
          boxSizing: 'border-box',
          cursor: 'move',
        }}
        onPointerDown={onPointerDownMove}
        onClick={onClick}
      />
    )
  }

  const { x1, y1, x2, y2 } = endpointsOf(obj, liveEndpoint, liveRect)
  const pad = obj.strokeWidth + 6
  const boundsX = Math.min(x1, x2) - pad
  const boundsY = Math.min(y1, y2) - pad
  const boundsW = Math.abs(x2 - x1) + pad * 2
  const boundsH = Math.abs(y2 - y1) + pad * 2
  const markerId = `arrowhead-${obj.id}`
  const isArrow = obj.type === 'arrow'
  return (
    <svg
      className="absolute overflow-visible"
      style={{ left: boundsX, top: boundsY, width: boundsW, height: boundsH, zIndex, opacity: obj.opacity }}
      viewBox={`0 0 ${boundsW} ${boundsH}`}
    >
      {isArrow && (
        <defs>
          <marker id={markerId} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
            <path d="M0,0 L8,4 L0,8 Z" fill={obj.strokeColor} />
          </marker>
        </defs>
      )}
      {/* Wide invisible hit-area so a thin line is still easy to click/drag. */}
      <line
        x1={x1 - boundsX}
        y1={y1 - boundsY}
        x2={x2 - boundsX}
        y2={y2 - boundsY}
        stroke="transparent"
        strokeWidth={Math.max(obj.strokeWidth, 14)}
        style={{ pointerEvents: 'stroke', cursor: 'move' }}
        onPointerDown={onPointerDownMove}
        onClick={onClick}
      />
      <line
        x1={x1 - boundsX}
        y1={y1 - boundsY}
        x2={x2 - boundsX}
        y2={y2 - boundsY}
        stroke={obj.strokeColor}
        strokeWidth={obj.strokeWidth}
        markerStart={isArrow && obj.arrowStart ? `url(#${markerId})` : undefined}
        markerEnd={isArrow && obj.arrowEnd ? `url(#${markerId})` : undefined}
        style={{ pointerEvents: 'none' }}
      />
    </svg>
  )
}

function ImageObjectBox({
  obj,
  liveRect,
  zIndex,
  liveRotation,
  onPointerDownMove,
  onClick,
  onDoubleClick,
}: {
  obj: ImageObject
  liveRect?: Rect
  zIndex: number
  liveRotation?: number
  onPointerDownMove: (e: React.PointerEvent) => void
  onClick: (e: React.MouseEvent) => void
  onDoubleClick?: (e: React.MouseEvent) => void
}) {
  const rect = liveRect ?? { x: obj.x, y: obj.y, width: obj.width, height: obj.height }
  // Source-pixel-to-destination-pixel scale factor — always uniform since
  // width/height stays proportional to cropWidth/cropHeight (server-enforced
  // via deriveImageSize/deriveCropSize).
  const scale = obj.cropWidth > 0 ? rect.width / obj.cropWidth : 1
  return (
    <div
      className="absolute"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        zIndex,
        opacity: obj.opacity,
        transform: `rotate(${liveRotation ?? obj.rotation}deg)`,
        transformOrigin: 'center',
        overflow: 'hidden',
        cursor: 'move',
      }}
      onPointerDown={onPointerDownMove}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {/* Rendered at its own natural size, then scaled+translated so the crop
          rectangle's top-left lands at this container's origin and its
          width/height fills it exactly — this needs no knowledge of the
          source's natural pixel dimensions to render (only the crop UI needs
          those, via image-size.ts's loadNaturalImageSize). maxWidth: 'none'
          overrides Tailwind Preflight's `img { max-width: 100% }`, which
          otherwise shrinks this img's pre-transform layout box to the
          container's width instead of the source's natural size, throwing
          off the scale/translate math above (visible as a too-small or
          off-position crop, worst for a small container/large source). */}
      <img
        src={obj.src}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          maxWidth: 'none',
          transformOrigin: '0 0',
          transform: `scale(${scale}) translate(${-obj.cropX}px, ${-obj.cropY}px)`,
        }}
      />
    </div>
  )
}

export const DeckCanvas = forwardRef<HTMLDivElement, DeckCanvasProps>(function DeckCanvas(
  { deckState, onSelectionChange, onObjectUpdate, onAddShape, onAddImage, onSetSlideBackground, onUndo, onRedo, readOnly = false },
  canvasRef,
) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [liveRects, setLiveRects] = useState<Record<string, Rect>>({})
  const [liveEndpoints, setLiveEndpoints] = useState<Record<string, EndpointOverride>>({})
  const [liveRotations, setLiveRotations] = useState<Record<string, number>>({})
  const didDragRef = useRef(false)
  const pendingEditIdRef = useRef<string | null>(null)
  const editingBoxRef = useRef<TextObjectBoxHandle | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const sourceFileInputRef = useRef<HTMLInputElement | null>(null)

  // A local ref onto the same DOM node as the forwarded canvasRef — needed
  // so the rotate handle can read the canvas's on-screen bounding rect
  // (getBoundingClientRect) to convert pointer positions into slide-space
  // coordinates, without assuming anything about the shape of the forwarded
  // ref itself (it may be a callback ref or an object ref).
  const canvasElRef = useRef<HTMLDivElement | null>(null)
  const setCanvasRefs = useCallback(
    (node: HTMLDivElement | null) => {
      canvasElRef.current = node
      if (typeof canvasRef === 'function') canvasRef(node)
      else if (canvasRef) canvasRef.current = node
    },
    [canvasRef],
  )

  // Crop-mode local state — parallel to editingId/text-edit's local-only
  // draft pattern (design.md's "Crop UI is a distinct interaction mode,
  // entered like text-edit mode"). cropNaturalSize is the *source* image's
  // actual pixel dimensions (read once via image-size.ts's
  // loadNaturalImageSize on crop-mode entry), independent of the object's
  // on-slide destination scale.
  const [croppingId, setCroppingId] = useState<string | null>(null)
  const [cropDraft, setCropDraft] = useState<{ cropX: number; cropY: number; cropWidth: number; cropHeight: number } | null>(null)
  const [cropNaturalSize, setCropNaturalSize] = useState<{ width: number; height: number } | null>(null)

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

  // Same guard for crop mode — mirrors editingId's effect above.
  useEffect(() => {
    if (croppingId && !deckState.objects.some((o) => o.id === croppingId)) {
      setCroppingId(null)
      setCropDraft(null)
      setCropNaturalSize(null)
    }
  }, [croppingId, deckState.objects])

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

  const setLiveEndpoint = useCallback((id: string, endpoint: EndpointOverride) => {
    setLiveEndpoints((e) => ({ ...e, [id]: endpoint }))
  }, [])

  const setLiveRotation = useCallback((id: string, rotation: number) => {
    setLiveRotations((r) => ({ ...r, [id]: rotation }))
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
        const bounds = obj ? boundsOf(obj) : undefined
        if (!obj || !bounds || (bounds.x === live.x && bounds.y === live.y && bounds.width === live.width && bounds.height === live.height)) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [deckState.objects])

  // Same reconciliation as liveRects above, for a single dragged line/arrow endpoint.
  useEffect(() => {
    setLiveEndpoints((prev) => {
      if (Object.keys(prev).length === 0) return prev
      let changed = false
      const next = { ...prev }
      for (const id of Object.keys(prev)) {
        const obj = deckState.objects.find((o) => o.id === id)
        const live = prev[id]
        const committed = obj && isLineLike(obj) ? (live.which === 'start' ? { x: obj.x1, y: obj.y1 } : { x: obj.x2, y: obj.y2 }) : undefined
        if (!obj || !committed || (committed.x === live.x && committed.y === live.y)) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [deckState.objects])

  // Same reconciliation as liveRects above, for a dragged rotate handle.
  useEffect(() => {
    setLiveRotations((prev) => {
      if (Object.keys(prev).length === 0) return prev
      let changed = false
      const next = { ...prev }
      for (const id of Object.keys(prev)) {
        const obj = deckState.objects.find((o) => o.id === id)
        const committed = obj && hasRotation(obj) ? obj.rotation : undefined
        if (committed === undefined || committed === prev[id]) {
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
      const originBounds = boundsOf(obj)
      let latest: Rect = originBounds

      function onMove(ev: PointerEvent) {
        const dx = (ev.clientX - startClientX) / scaleRef.current
        const dy = (ev.clientY - startClientY) / scaleRef.current
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDragRef.current = true
        latest = clampRectToSlide({ x: originBounds.x + dx, y: originBounds.y + dy, width: originBounds.width, height: originBounds.height })
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

  // Corner-handle resize applies to textBox/box/ellipse (whichever has an
  // independent width/height) — line/arrow get endpoint-drag instead (see
  // handlePointerDownEndpoint), so this is a no-op if somehow invoked on one.
  const handlePointerDownResize = useCallback(
    (e: React.PointerEvent, obj: DeckObject, corner: Corner) => {
      if (isLineLike(obj)) return
      e.stopPropagation()
      e.preventDefault()
      const startClientX = e.clientX
      const startClientY = e.clientY
      const originX = obj.x
      const originY = obj.y
      const originWidth = obj.width
      const originHeight = obj.height
      const rotation = obj.rotation
      const isImage = obj.type === 'image'
      let latest: Rect = { x: originX, y: originY, width: originWidth, height: originHeight }

      function onMove(ev: PointerEvent) {
        didDragRef.current = true
        const rawDx = (ev.clientX - startClientX) / scaleRef.current
        const rawDy = (ev.clientY - startClientY) / scaleRef.current
        // Move the raw slide-axis pointer delta into the object's own local
        // (unrotated) frame before running the per-corner math below, so a
        // corner drag follows the object's own rotated edges rather than the
        // slide's axes (design.md's "Drag-to-move needs no rotation-
        // awareness; resize does").
        const [dx, dy] = rotateVector(rawDx, rawDy, -rotation)

        let width = originWidth
        let height = originHeight
        if (isImage) {
          // image gets a uniform-scale resize instead of independent
          // per-axis resize: the larger-magnitude local-frame axis delta
          // drives a single scale factor applied to both dimensions from the
          // anchored opposite corner (design.md's "Aspect-locked resize and
          // clamping" — corner-drag resize).
          const widthGrow = corner.includes('e') ? dx : -dx
          const heightGrow = corner.includes('s') ? dy : -dy
          if (Math.abs(widthGrow) >= Math.abs(heightGrow)) {
            width = Math.max(MIN_SIZE, originWidth + widthGrow)
            height = Math.max(MIN_SIZE, (originHeight * width) / originWidth)
          } else {
            height = Math.max(MIN_SIZE, originHeight + heightGrow)
            width = Math.max(MIN_SIZE, (originWidth * height) / originHeight)
          }
        } else {
          if (corner.includes('e')) width = Math.max(MIN_SIZE, originWidth + dx)
          if (corner.includes('w')) width = Math.max(MIN_SIZE, originWidth - dx)
          if (corner.includes('s')) height = Math.max(MIN_SIZE, originHeight + dy)
          if (corner.includes('n')) height = Math.max(MIN_SIZE, originHeight - dy)
        }
        let x = originX
        let y = originY
        if (corner.includes('w')) x = originX + (originWidth - width)
        if (corner.includes('n')) y = originY + (originHeight - height)

        // The position shift above was computed in the object's local frame
        // (since width/height/x/y were derived from the rotated-into-local
        // dx/dy) — rotate that shift back into slide-frame before committing.
        const [slideDx, slideDy] = rotateVector(x - originX, y - originY, rotation)
        latest = clampRectToSlide({ x: originX + slideDx, y: originY + slideDy, width, height })
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

  // Dragging the rotate handle computes the pointer's angle relative to the
  // object's center via atan2 (design.md's rotate-handle decision) and
  // issues setRotation with the accumulated delta from the drag's start
  // angle, so grabbing the handle at any point on its circumference doesn't
  // snap the object to that exact angle.
  const handlePointerDownRotate = useCallback(
    (e: React.PointerEvent, obj: DeckObject) => {
      if (!hasRotation(obj)) return
      e.stopPropagation()
      e.preventDefault()
      const bounds = boundsOf(obj)
      const centerX = bounds.x + bounds.width / 2
      const centerY = bounds.y + bounds.height / 2
      const originRotation = obj.rotation

      function angleFromCenter(clientX: number, clientY: number): number {
        const canvasRect = canvasElRef.current?.getBoundingClientRect()
        if (!canvasRect) return 0
        const slideX = (clientX - canvasRect.left) / scaleRef.current
        const slideY = (clientY - canvasRect.top) / scaleRef.current
        // 0deg = straight up from center, clockwise-positive — matches CSS
        // rotate()'s convention and the handle's "above the top edge" placement.
        return (Math.atan2(slideX - centerX, -(slideY - centerY)) * 180) / Math.PI
      }

      const startAngle = angleFromCenter(e.clientX, e.clientY)
      let latest = originRotation

      function onMove(ev: PointerEvent) {
        // A rotate drag's release point often lands outside the (now
        // rotated) object's on-screen footprint, unlike move/resize where
        // the dragged element tracks the cursor — mark it so the slide
        // background's click-to-deselect handler below doesn't fire on the
        // native click that follows such a release.
        didDragRef.current = true
        const angle = angleFromCenter(ev.clientX, ev.clientY)
        latest = originRotation + (angle - startAngle)
        setLiveRotation(obj.id, latest)
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        onObjectUpdate([{ action: 'setRotation', targetIds: [obj.id], args: { rotation: latest } }])
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [onObjectUpdate, setLiveRotation],
  )

  const handlePointerDownEndpoint = useCallback(
    (e: React.PointerEvent, obj: LineObject | ArrowObject, which: 'start' | 'end') => {
      e.stopPropagation()
      e.preventDefault()
      const startClientX = e.clientX
      const startClientY = e.clientY
      const originX = which === 'start' ? obj.x1 : obj.x2
      const originY = which === 'start' ? obj.y1 : obj.y2
      let latest: EndpointOverride = { which, x: originX, y: originY }

      function onMove(ev: PointerEvent) {
        const dx = (ev.clientX - startClientX) / scaleRef.current
        const dy = (ev.clientY - startClientY) / scaleRef.current
        const x = Math.min(Math.max(0, originX + dx), CANVAS_WIDTH)
        const y = Math.min(Math.max(0, originY + dy), CANVAS_HEIGHT)
        latest = { which, x, y }
        setLiveEndpoint(obj.id, latest)
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        onObjectUpdate([{ action: 'setEndpoint', targetIds: [obj.id], args: { which: latest.which, x: latest.x, y: latest.y } }])
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [onObjectUpdate, setLiveEndpoint],
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

  const addShape = useCallback(
    (type: ShapeType) => {
      const id = genId()
      onAddShape?.({ id, type, ...NEW_SHAPE_DEFAULTS[type] })
      onSelectionChange([id])
    },
    [onAddShape, onSelectionChange],
  )

  // Uploads the chosen file, reads its natural pixel size (needed to default
  // the crop to the full source extent — the server can't inspect image
  // bytes itself, design.md), and adds it scaled down to a sensible default
  // on-slide size.
  const handleImageFileChosen = useCallback(
    async (file: File) => {
      try {
        const { url } = await imagesApi.upload(file)
        const natural = await loadNaturalImageSize(url)
        const id = genId()
        const width = Math.min(NEW_IMAGE_MAX_WIDTH, natural.width)
        const height = (natural.height * width) / natural.width
        onAddImage?.({ id, src: url, x: 40, y: 40, width, height, naturalWidth: natural.width, naturalHeight: natural.height })
        onSelectionChange([id])
      } catch (err) {
        console.error('Image upload failed', err)
      }
    },
    [onAddImage, onSelectionChange],
  )

  const handleReplaceImageSource = useCallback(
    async (file: File, targetId: string) => {
      try {
        const { url } = await imagesApi.upload(file)
        const natural = await loadNaturalImageSize(url)
        onObjectUpdate([{ action: 'setImageSource', targetIds: [targetId], args: { src: url, naturalWidth: natural.width, naturalHeight: natural.height } }])
      } catch (err) {
        console.error('Image source replace failed', err)
      }
    },
    [onObjectUpdate],
  )

  const enterCropMode = useCallback(async (obj: ImageObject) => {
    try {
      const natural = await loadNaturalImageSize(obj.src)
      setCropNaturalSize(natural)
      setCropDraft({ cropX: obj.cropX, cropY: obj.cropY, cropWidth: obj.cropWidth, cropHeight: obj.cropHeight })
      setCroppingId(obj.id)
    } catch (err) {
      console.error('Failed to load image for cropping', err)
    }
  }, [])

  const exitCropMode = useCallback(() => {
    if (croppingId && cropDraft) {
      onObjectUpdate([{ action: 'setCrop', targetIds: [croppingId], args: cropDraft }])
    }
    setCroppingId(null)
    setCropDraft(null)
    setCropNaturalSize(null)
  }, [croppingId, cropDraft, onObjectUpdate])

  const cropDisplayScale = cropNaturalSize ? Math.min(CROP_PANEL_MAX / cropNaturalSize.width, CROP_PANEL_MAX / cropNaturalSize.height, 1) : 1

  // Drag on the crop rectangle's body pans (cropX/cropY) without changing
  // its size — clamped to the source image's own bounds.
  const handleCropPan = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      if (!cropNaturalSize || !cropDraft) return
      const natWidth = cropNaturalSize.width
      const natHeight = cropNaturalSize.height
      const { cropX: originCropX, cropY: originCropY, cropWidth, cropHeight } = cropDraft
      const startClientX = e.clientX
      const startClientY = e.clientY
      const scale = cropDisplayScale

      function onMove(ev: PointerEvent) {
        const dx = (ev.clientX - startClientX) / scale
        const dy = (ev.clientY - startClientY) / scale
        setCropDraft({
          cropX: Math.min(Math.max(0, originCropX + dx), natWidth - cropWidth),
          cropY: Math.min(Math.max(0, originCropY + dy), natHeight - cropHeight),
          cropWidth,
          cropHeight,
        })
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [cropNaturalSize, cropDraft, cropDisplayScale],
  )

  // Corner-handle drag zooms (mirrors the server's/image destination's
  // uniform-scale resize, task 7.2): the larger-magnitude axis delta drives
  // a single scale factor applied to both cropWidth/cropHeight from the
  // anchored opposite corner, so a drag can never produce a crop rectangle
  // with a different aspect ratio than it started with.
  const handleCropResize = useCallback(
    (e: React.PointerEvent, corner: Corner) => {
      e.stopPropagation()
      e.preventDefault()
      if (!cropNaturalSize || !cropDraft) return
      const natWidth = cropNaturalSize.width
      const natHeight = cropNaturalSize.height
      const { cropX: originCropX, cropY: originCropY, cropWidth: originCropWidth, cropHeight: originCropHeight } = cropDraft
      const startClientX = e.clientX
      const startClientY = e.clientY
      const scale = cropDisplayScale

      function onMove(ev: PointerEvent) {
        const dx = (ev.clientX - startClientX) / scale
        const dy = (ev.clientY - startClientY) / scale
        const widthGrow = corner.includes('e') ? dx : -dx
        const heightGrow = corner.includes('s') ? dy : -dy
        let cropWidth = originCropWidth
        let cropHeight = originCropHeight
        if (Math.abs(widthGrow) >= Math.abs(heightGrow)) {
          cropWidth = Math.max(MIN_CROP_SIZE, originCropWidth + widthGrow)
          cropHeight = (originCropHeight * cropWidth) / originCropWidth
        } else {
          cropHeight = Math.max(MIN_CROP_SIZE, originCropHeight + heightGrow)
          cropWidth = (originCropWidth * cropHeight) / originCropHeight
        }
        cropWidth = Math.min(cropWidth, natWidth)
        cropHeight = Math.min(cropHeight, natHeight)
        let cropX = originCropX
        let cropY = originCropY
        if (corner.includes('w')) cropX = originCropX + (originCropWidth - cropWidth)
        if (corner.includes('n')) cropY = originCropY + (originCropHeight - cropHeight)
        cropX = Math.min(Math.max(0, cropX), natWidth - cropWidth)
        cropY = Math.min(Math.max(0, cropY), natHeight - cropHeight)
        setCropDraft({ cropX, cropY, cropWidth, cropHeight })
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [cropNaturalSize, cropDraft, cropDisplayScale],
  )

  const deleteSelection = useCallback(() => {
    if (deckState.selection.length === 0) return
    onObjectUpdate([{ action: 'removeObject', targetIds: deckState.selection, args: {} }])
    if (editingId && deckState.selection.includes(editingId)) setEditingId(null)
  }, [deckState.selection, onObjectUpdate, editingId])

  // Delete/Backspace deletes the selection, and Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z
  // undo/redo — both only when not actively editing text in place (where
  // those keys must edit the text itself / trigger the browser's native
  // in-field undo, per deck-undo-redo spec's "Keyboard shortcut suppressed
  // during text editing" scenario).
  useEffect(() => {
    if (readOnly) return
    function onKeyDown(e: KeyboardEvent) {
      if (editingId) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && deckState.selection.length > 0) {
        e.preventDefault()
        deleteSelection()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) onRedo()
        else onUndo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [readOnly, editingId, deckState.selection, deleteSelection, onUndo, onRedo])

  const selectedObjects = deckState.objects.filter((o) => deckState.selection.includes(o.id))
  const firstSelected = selectedObjects[0]

  // Resolved once per render and shared by both each object's own box (its
  // layout) and the selection/editing overlay below (chrome placement), so
  // the liveRect-during-drag fallback isn't duplicated in two places.
  const resolvedRects: Record<string, Rect> = {}
  for (const obj of deckState.objects) {
    resolvedRects[obj.id] = liveBoundsOf(obj, liveRects[obj.id], liveEndpoints[obj.id])
  }

  // Paint order only — never mutates deckState.objects (the stored,
  // server-synced z-order). Objects now carry an explicit CSS z-index (see
  // SELECTION_OVERLAY_Z_INDEX/EDITING_Z_INDEX above), so this DOM reordering
  // only matters as a tiebreak between objects that happen to share a
  // z-index; the edited object's visual "on top while editing" behavior is
  // handled by EDITING_Z_INDEX instead.
  const objectsInPaintOrder = editingId
    ? [...deckState.objects.filter((o) => o.id !== editingId), ...deckState.objects.filter((o) => o.id === editingId)]
    : deckState.objects

  const setStyleOnSelection = (action: UpdateActionCall['action'], args: Record<string, unknown>) => {
    if (deckState.selection.length === 0) return
    onObjectUpdate([{ action, targetIds: deckState.selection, args }])
  }

  const zIndexFor = (obj: DeckObject) => (editingId === obj.id ? EDITING_Z_INDEX : obj.zIndex)
  const rotationFor = (obj: DeckObject) => liveRotations[obj.id] ?? (hasRotation(obj) ? obj.rotation : 0)

  return (
    // min-w-0/min-h-0: this is the grid item for DeckPage's `1fr` column and
    // its single (implicit, auto-sized) row. Without both, its default
    // overflow:visible min-width/min-height:auto resolves to its content's
    // min-content size in that axis — and since a descendant (the scaled
    // canvas wrapper below) has explicit pixel width/height derived from
    // `scale`, that would ratchet the grid track's minimum size up on every
    // render and never let it shrink back down, only grow (mirrors
    // DeckPage.tsx's min-h-0 on the grid container itself, which only
    // protects the container — this protects the item within it).
    <div className="h-full min-w-0 min-h-0 flex flex-col">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm">
          <button type="button" className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white" onClick={addTextBox}>
            + Text box
          </button>
          <button type="button" className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white" onClick={() => addShape('box')}>
            + Box
          </button>
          <button type="button" className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white" onClick={() => addShape('ellipse')}>
            + Ellipse
          </button>
          <button type="button" className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white" onClick={() => addShape('line')}>
            + Line
          </button>
          <button type="button" className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white" onClick={() => addShape('arrow')}>
            + Arrow
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void handleImageFileChosen(file)
            }}
          />
          <button type="button" className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white" onClick={() => fileInputRef.current?.click()}>
            + Image
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-900 disabled:opacity-40 disabled:hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white dark:disabled:hover:bg-gray-700"
            disabled={deckState.selection.length === 0}
            onClick={deleteSelection}
          >
            Delete
          </button>

          {firstSelected && isImage(firstSelected) && (
            <>
              <div className="w-px h-5 bg-gray-300 dark:bg-gray-700 mx-1" />
              <button
                type="button"
                className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white"
                onClick={() => void enterCropMode(firstSelected)}
              >
                Crop
              </button>
              <input
                ref={sourceFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) void handleReplaceImageSource(file, firstSelected.id)
                }}
              />
              <button
                type="button"
                className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white"
                onClick={() => sourceFileInputRef.current?.click()}
              >
                Replace image
              </button>
            </>
          )}

          <button
            type="button"
            className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-900 disabled:opacity-40 disabled:hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white dark:disabled:hover:bg-gray-700"
            disabled={!deckState.canUndo}
            onClick={onUndo}
            title="Undo (Ctrl/Cmd+Z)"
          >
            Undo
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-900 disabled:opacity-40 disabled:hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white dark:disabled:hover:bg-gray-700"
            disabled={!deckState.canRedo}
            onClick={onRedo}
            title="Redo (Ctrl/Cmd+Shift+Z)"
          >
            Redo
          </button>

          <div className="w-px h-5 bg-gray-300 dark:bg-gray-700 mx-1" />

          <button
            type="button"
            className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-900 disabled:opacity-40 disabled:hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white dark:disabled:hover:bg-gray-700"
            disabled={deckState.selection.length === 0}
            onClick={() => setStyleOnSelection('bringForward', {})}
            title="Bring forward"
          >
            Forward
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-900 disabled:opacity-40 disabled:hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white dark:disabled:hover:bg-gray-700"
            disabled={deckState.selection.length === 0}
            onClick={() => setStyleOnSelection('sendBackward', {})}
            title="Send backward"
          >
            Backward
          </button>

          <div className="w-px h-5 bg-gray-300 dark:bg-gray-700 mx-1" />

          <label className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
            Slide BG
            <input
              type="color"
              className="w-6 h-6 bg-transparent"
              value={deckState.backgroundColor}
              onChange={(e) => onSetSlideBackground?.(e.target.value)}
            />
          </label>

          <label className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
            Font size
            <input
              type="number"
              className="w-14 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-1 py-0.5 text-gray-900 dark:text-white disabled:opacity-40"
              disabled={!firstSelected || firstSelected.type !== 'textBox'}
              value={firstSelected && firstSelected.type === 'textBox' ? firstSelected.fontSize : ''}
              onChange={(e) => {
                const fontSize = Number(e.target.value)
                if (Number.isFinite(fontSize) && fontSize > 0) setStyleOnSelection('setFontSize', { fontSize })
              }}
            />
          </label>

          <label className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
            Font
            <input
              type="color"
              className="w-6 h-6 bg-transparent disabled:opacity-40"
              disabled={!firstSelected || firstSelected.type !== 'textBox'}
              value={firstSelected && firstSelected.type === 'textBox' ? firstSelected.fontColor : '#ffffff'}
              onChange={(e) => setStyleOnSelection('setFontColor', { color: e.target.value })}
            />
          </label>

          <label className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
            Fill
            <span className="relative inline-block w-6 h-6">
              <input
                type="color"
                className="w-6 h-6 bg-transparent disabled:opacity-40"
                disabled={!firstSelected || isLineLike(firstSelected)}
                value={firstSelected && 'fillColor' in firstSelected && firstSelected.fillColor !== 'transparent' ? firstSelected.fillColor : '#374151'}
                onChange={(e) => setStyleOnSelection('setFillColor', { color: e.target.value })}
              />
              {firstSelected && 'fillColor' in firstSelected && firstSelected.fillColor === 'transparent' && (
                <span className="pointer-events-none absolute inset-0 rounded-sm" style={NONE_SWATCH_OVERLAY_STYLE} />
              )}
            </span>
            <button
              type="button"
              className={
                firstSelected && 'fillColor' in firstSelected && firstSelected.fillColor === 'transparent'
                  ? 'text-xs font-semibold text-red-500 underline disabled:opacity-40'
                  : 'text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white disabled:opacity-40'
              }
              disabled={!firstSelected || isLineLike(firstSelected)}
              onClick={() => setStyleOnSelection('setFillColor', { color: 'transparent' })}
            >
              none
            </button>
          </label>

          <label className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
            Border
            <span className="relative inline-block w-6 h-6">
              <input
                type="color"
                className="w-6 h-6 bg-transparent disabled:opacity-40"
                disabled={!firstSelected || isImage(firstSelected)}
                value={
                  firstSelected && !isImage(firstSelected)
                    ? isLineLike(firstSelected)
                      ? firstSelected.strokeColor
                      : firstSelected.borderColor !== 'transparent'
                        ? firstSelected.borderColor
                        : '#ffffff'
                    : '#ffffff'
                }
                onChange={(e) => setStyleOnSelection('setBorderColor', { color: e.target.value })}
              />
              {firstSelected && !isImage(firstSelected) && !isLineLike(firstSelected) && firstSelected.borderColor === 'transparent' && (
                <span className="pointer-events-none absolute inset-0 rounded-sm" style={NONE_SWATCH_OVERLAY_STYLE} />
              )}
            </span>
            <button
              type="button"
              className={
                firstSelected && !isImage(firstSelected) && !isLineLike(firstSelected) && firstSelected.borderColor === 'transparent'
                  ? 'text-xs font-semibold text-red-500 underline disabled:opacity-40'
                  : 'text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white disabled:opacity-40'
              }
              disabled={!firstSelected || isImage(firstSelected) || isLineLike(firstSelected)}
              onClick={() => setStyleOnSelection('setBorderColor', { color: 'transparent' })}
            >
              none
            </button>
          </label>

          {firstSelected && isLineLike(firstSelected) && (
            <label className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
              Stroke width
              <input
                type="number"
                min={1}
                className="w-14 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-1 py-0.5 text-gray-900 dark:text-white"
                value={firstSelected.strokeWidth}
                onChange={(e) => {
                  const strokeWidth = Number(e.target.value)
                  if (Number.isFinite(strokeWidth) && strokeWidth > 0) setStyleOnSelection('setStrokeWidth', { strokeWidth })
                }}
              />
            </label>
          )}

          {firstSelected && (firstSelected.type === 'box' || firstSelected.type === 'ellipse') && (
            <label className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
              Border width
              <input
                type="number"
                min={0}
                className="w-14 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-1 py-0.5 text-gray-900 dark:text-white"
                value={firstSelected.borderWidth}
                onChange={(e) => {
                  const borderWidth = Number(e.target.value)
                  if (Number.isFinite(borderWidth) && borderWidth >= 0) setStyleOnSelection('setBorderWidth', { borderWidth })
                }}
              />
            </label>
          )}

          {firstSelected && firstSelected.type === 'box' && (
            <label className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
              Corner radius
              <input
                type="number"
                min={0}
                className="w-14 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-1 py-0.5 text-gray-900 dark:text-white"
                value={firstSelected.cornerRadius}
                onChange={(e) => {
                  const cornerRadius = Number(e.target.value)
                  if (Number.isFinite(cornerRadius) && cornerRadius >= 0) setStyleOnSelection('setCornerRadius', { cornerRadius })
                }}
              />
            </label>
          )}
        </div>
      )}

      <div
        // readOnly (presentation view) always keeps the dark backdrop
        // regardless of theme — deck content and the chrome-free slideshow
        // are excluded from theming (deck-theme-toggle spec's "Deck content
        // unaffected by theme"). Only the editor's own pane background is
        // theme-aware.
        className={readOnly ? 'relative flex-1 min-w-0 min-h-0 bg-gray-950 overflow-hidden' : 'relative flex-1 min-w-0 min-h-0 bg-gray-100 dark:bg-gray-950 overflow-hidden'}
        // Objects' own onClick stops propagation before it reaches here (see
        // TextObjectBox's onClick below), so any click that bubbles this far —
        // the margin around the slide or the slide's own background — is by
        // definition not on an object, and should clear the selection —
        // except immediately after a drag whose release point landed here
        // rather than back over the (possibly rotated/moved) object itself,
        // per didDragRef's doc comment at the rotate handler above. Not
        // wired at all in readOnly mode — preview never has a selection to clear.
        onClick={
          readOnly
            ? undefined
            : () => {
                if (didDragRef.current) {
                  didDragRef.current = false
                  return
                }
                onSelectionChange([])
              }
        }
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
                useDeckSocket's toPng capture explicitly neutralizes.
                backgroundColor is deck content (see design.md's "Slide
                background color is deck content" decision) — a literal
                stored color with no dark: variant, same as every shape's
                fill/border/stroke color. */}
            <div
              ref={setCanvasRefs}
              className="relative border border-gray-300"
              style={{
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                backgroundColor: deckState.backgroundColor,
              }}
            >
              {(readOnly ? deckState.objects : objectsInPaintOrder).map((obj) =>
                readOnly ? (
                  obj.type === 'textBox' ? (
                    <TextObjectBox
                      key={obj.id}
                      obj={obj}
                      editing={false}
                      rect={obj}
                      zIndex={obj.zIndex}
                      onObjectUpdate={() => {}}
                      onPointerDownMove={() => {}}
                      onClick={() => {}}
                      onDoubleClick={() => {}}
                      onStartEditingCommit={() => {}}
                    />
                  ) : obj.type === 'image' ? (
                    <ImageObjectBox key={obj.id} obj={obj} zIndex={obj.zIndex} onPointerDownMove={() => {}} onClick={() => {}} />
                  ) : (
                    <ShapeObjectBox key={obj.id} obj={obj} zIndex={obj.zIndex} onPointerDownMove={() => {}} onClick={() => {}} />
                  )
                ) : obj.type === 'textBox' ? (
                  <TextObjectBox
                    key={obj.id}
                    ref={editingId === obj.id ? editingBoxRef : undefined}
                    obj={obj}
                    editing={editingId === obj.id}
                    rect={resolvedRects[obj.id]}
                    zIndex={zIndexFor(obj)}
                    liveRotation={liveRotations[obj.id]}
                    onObjectUpdate={onObjectUpdate}
                    onPointerDownMove={(e) => handlePointerDownMove(e, obj)}
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
                ) : obj.type === 'image' ? (
                  <ImageObjectBox
                    key={obj.id}
                    obj={obj}
                    liveRect={liveRects[obj.id]}
                    zIndex={zIndexFor(obj)}
                    liveRotation={liveRotations[obj.id]}
                    onPointerDownMove={(e) => handlePointerDownMove(e, obj)}
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
                      void enterCropMode(obj)
                    }}
                  />
                ) : (
                  <ShapeObjectBox
                    key={obj.id}
                    obj={obj}
                    liveRect={liveRects[obj.id]}
                    liveEndpoint={liveEndpoints[obj.id]}
                    zIndex={zIndexFor(obj)}
                    liveRotation={liveRotations[obj.id]}
                    onPointerDownMove={(e) => handlePointerDownMove(e, obj)}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (didDragRef.current) {
                        didDragRef.current = false
                        return
                      }
                      toggle(obj.id, e.shiftKey)
                    }}
                  />
                ),
              )}

              {/* Selection outline, resize handles, and the floating format
                  toolbar are painted here — after every object in DOM order,
                  and above every object's own (now explicit) z-index via
                  SELECTION_OVERLAY_Z_INDEX — so they stay visible above every
                  slide object regardless of the selected/edited object's
                  z-order (see design.md). */}
              {!readOnly && (
                <div className="absolute inset-0 pointer-events-none" style={{ zIndex: SELECTION_OVERLAY_Z_INDEX }}>
                  {selectedObjects.map((obj) => {
                    const rect = resolvedRects[obj.id]
                    return (
                      <div
                        key={obj.id}
                        className="absolute rounded-md border-2 border-indigo-400 ring-2 ring-indigo-400/40 pointer-events-none"
                        style={{
                          left: rect.x,
                          top: rect.y,
                          width: rect.width,
                          height: rect.height,
                          transform: `rotate(${rotationFor(obj)}deg)`,
                          transformOrigin: 'center',
                        }}
                      />
                    )
                  })}

                  {selectedObjects
                    .filter((obj) => obj.id !== editingId)
                    .map((obj) => {
                      if (isLineLike(obj)) {
                        const { x1, y1, x2, y2 } = endpointsOf(obj, liveEndpoints[obj.id], liveRects[obj.id])
                        return (
                          <div key={obj.id}>
                            {(['start', 'end'] as const).map((which) => {
                              const x = which === 'start' ? x1 : x2
                              const y = which === 'start' ? y1 : y2
                              return (
                                <div
                                  key={which}
                                  className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-400 border border-white/70 pointer-events-auto cursor-move"
                                  style={{ left: x, top: y }}
                                  onPointerDown={(e) => handlePointerDownEndpoint(e, obj, which)}
                                />
                              )
                            })}
                          </div>
                        )
                      }
                      const rect = resolvedRects[obj.id]
                      return (
                        <div
                          key={obj.id}
                          className="absolute"
                          style={{
                            left: rect.x,
                            top: rect.y,
                            width: rect.width,
                            height: rect.height,
                            transform: `rotate(${rotationFor(obj)}deg)`,
                            transformOrigin: 'center',
                          }}
                        >
                          {RESIZE_CORNERS.map((corner) => (
                            <div
                              key={corner}
                              className={`absolute w-3 h-3 rounded-full bg-indigo-400 border border-white/70 pointer-events-auto ${CORNER_CLASSES[corner]}`}
                              onPointerDown={(e) => handlePointerDownResize(e, obj, corner)}
                            />
                          ))}
                          {/* Nested inside the same rotated wrapper as the
                              corner handles, so it inherits the object's
                              rotation for free and always sits outside the
                              rotated bounding box's top edge, along the
                              object's own rotated "up" direction. */}
                          {hasRotation(obj) && (
                            <div
                              className="absolute w-3 h-3 -translate-x-1/2 rounded-full bg-emerald-400 border border-white/70 pointer-events-auto cursor-grab"
                              style={{ left: '50%', top: -ROTATE_HANDLE_OFFSET }}
                              onPointerDown={(e) => handlePointerDownRotate(e, obj)}
                            />
                          )}
                        </div>
                      )
                    })}

                  {editingId &&
                    resolvedRects[editingId] &&
                    (() => {
                      const rect = resolvedRects[editingId]
                      return (
                        <div className="absolute" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}>
                          <div
                            className="absolute -top-9 left-0 flex gap-1 bg-white border border-gray-300 dark:bg-gray-800 dark:border-gray-700 rounded px-1 py-1 pointer-events-auto shadow-sm"
                            // mousedown (not click) is what the browser uses to move focus /
                            // collapse the current selection by default; preventing it here
                            // keeps the contenteditable's selection intact so applyMark/
                            // applyListType read the range the user actually made, not an
                            // empty one collapsed by clicking the toolbar itself.
                            onMouseDown={(e) => e.preventDefault()}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="px-2 text-xs font-bold text-gray-900 hover:bg-gray-200 dark:text-white dark:hover:bg-gray-700 rounded"
                              onClick={() => editingBoxRef.current?.applyMark('bold')}
                            >
                              B
                            </button>
                            <button
                              type="button"
                              className="px-2 text-xs italic text-gray-900 hover:bg-gray-200 dark:text-white dark:hover:bg-gray-700 rounded"
                              onClick={() => editingBoxRef.current?.applyMark('italic')}
                            >
                              I
                            </button>
                            <button
                              type="button"
                              className="px-2 text-xs text-gray-900 hover:bg-gray-200 dark:text-white dark:hover:bg-gray-700 rounded"
                              onClick={() => editingBoxRef.current?.applyListType('bulleted')}
                            >
                              • List
                            </button>
                            <button
                              type="button"
                              className="px-2 text-xs text-gray-900 hover:bg-gray-200 dark:text-white dark:hover:bg-gray-700 rounded"
                              onClick={() => editingBoxRef.current?.applyListType('numbered')}
                            >
                              1. List
                            </button>
                            <button
                              type="button"
                              className="px-2 text-xs text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700 rounded"
                              onClick={() => editingBoxRef.current?.applyListType(null)}
                            >
                              Clear list
                            </button>
                          </div>
                        </div>
                      )
                    })()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Crop-mode overlay: a distinct interaction mode (design.md's "Crop
            UI is a distinct interaction mode, entered like text-edit mode")
            rendered against the source image's own natural pixel dimensions,
            independent of the object's on-slide destination scale. Clicking
            the backdrop (outside the panel) exits and commits, same as
            text-edit's commit-on-blur. */}
        {!readOnly &&
          croppingId &&
          cropDraft &&
          cropNaturalSize &&
          (() => {
            const croppingObj = deckState.objects.find((o) => o.id === croppingId)
            if (!croppingObj || !isImage(croppingObj)) return null
            const dispW = cropNaturalSize.width * cropDisplayScale
            const dispH = cropNaturalSize.height * cropDisplayScale
            return (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ zIndex: SELECTION_OVERLAY_Z_INDEX + 1, background: 'rgba(0,0,0,0.6)' }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) exitCropMode()
                }}
              >
                <div className="bg-white dark:bg-gray-900 rounded-md p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
                  <div className="relative select-none" style={{ width: dispW, height: dispH }}>
                    <img src={croppingObj.src} alt="" draggable={false} style={{ width: dispW, height: dispH, display: 'block' }} />
                    <div
                      className="absolute border-2 border-indigo-400 bg-indigo-400/10 cursor-move"
                      style={{ left: cropDraft.cropX * cropDisplayScale, top: cropDraft.cropY * cropDisplayScale, width: cropDraft.cropWidth * cropDisplayScale, height: cropDraft.cropHeight * cropDisplayScale }}
                      onPointerDown={handleCropPan}
                    >
                      {RESIZE_CORNERS.map((corner) => (
                        <div
                          key={corner}
                          className={`absolute w-3 h-3 rounded-full bg-indigo-400 border border-white/70 pointer-events-auto ${CORNER_CLASSES[corner]}`}
                          onPointerDown={(e) => handleCropResize(e, corner)}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end mt-2">
                    <button type="button" className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm" onClick={exitCropMode}>
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}
      </div>
    </div>
  )
})
