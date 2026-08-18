import { forwardRef } from 'react'
import type { BoardObject, BoardState, Point } from '../hooks/useDungeonSocket'

export const CELL_SIZE = 40

function toPixel(point: Point): { x: number; y: number } {
  return { x: point.x * CELL_SIZE, y: point.y * CELL_SIZE }
}

function ShapeMarker({ object }: { object: Extract<BoardObject, { kind: 'shape' }> }) {
  const { x, y } = toPixel(object.position)
  const shape =
    object.shapeType === 'circle' ? (
      <circle cx={x} cy={y} r={object.radius * CELL_SIZE} fill={object.color} stroke="#ffffff" strokeWidth={2} />
    ) : (
      <rect
        x={x - (object.width * CELL_SIZE) / 2}
        y={y - (object.height * CELL_SIZE) / 2}
        width={object.width * CELL_SIZE}
        height={object.height * CELL_SIZE}
        fill={object.color}
        stroke="#ffffff"
        strokeWidth={2}
      />
    )
  return (
    <g>
      {shape}
      {object.label && (
        <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600} fill="#ffffff">
          {object.label}
        </text>
      )}
    </g>
  )
}

function LineShape({ object }: { object: Extract<BoardObject, { kind: 'line' }> }) {
  const points = object.points.map((p) => { const { x, y } = toPixel(p); return `${x},${y}` }).join(' ')
  return (
    <polyline
      points={points}
      fill="none"
      stroke={object.color}
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={object.style === 'dashed' ? '2 6' : undefined}
    />
  )
}

function OverlayWash({ object }: { object: Extract<BoardObject, { kind: 'overlay' }> }) {
  return (
    <>
      {object.cells.map((cell) => (
        <rect
          key={`${cell.col},${cell.row}`}
          x={cell.col * CELL_SIZE}
          y={cell.row * CELL_SIZE}
          width={CELL_SIZE}
          height={CELL_SIZE}
          fill={object.color}
          fillOpacity={0.45}
        />
      ))}
    </>
  )
}

function LabelText({ object }: { object: Extract<BoardObject, { kind: 'label' }> }) {
  const { x, y } = toPixel(object.position)
  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600} fill={object.color}>
      {object.text}
    </text>
  )
}

interface BoardCanvasProps {
  boardState: BoardState | null
}

/**
 * Plain SVG rendering of the live board — grid with per-cell fill color,
 * plus every drawn object (shape/line/overlay/label) rendered generically by
 * kind. Mirrors client-deck's DeckCanvas precedent of plain SVG/Canvas over
 * Phaser for a live-state view (see design.md/proposal.md).
 *
 * The forwarded ref lands on a fixed-pixel-size wrapper div around the svg
 * (not the svg element itself, since captureNode's html-to-image capture
 * expects an HTMLElement) — mirrors DeckCanvas's canvasRef, which similarly
 * targets a div sized to the canvas's fixed logical dimensions rather than
 * whatever's currently on screen. Unlike DeckCanvas, this wrapper carries no
 * scale-to-fit transform (BoardCanvas is overflow-auto, not scaled), so
 * useDungeonSocket's capture needs no style override to defeat one.
 */
export const BoardCanvas = forwardRef<HTMLDivElement, BoardCanvasProps>(function BoardCanvas({ boardState }, ref) {
  if (!boardState) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-gray-500">Waiting for board state…</div>
    )
  }

  const width = boardState.width * CELL_SIZE
  const height = boardState.height * CELL_SIZE
  const overlays = boardState.objects.filter((o): o is Extract<BoardObject, { kind: 'overlay' }> => o.kind === 'overlay')
  const shapes = boardState.objects.filter((o): o is Extract<BoardObject, { kind: 'shape' }> => o.kind === 'shape')
  const lines = boardState.objects.filter((o): o is Extract<BoardObject, { kind: 'line' }> => o.kind === 'line')
  const labels = boardState.objects.filter((o): o is Extract<BoardObject, { kind: 'label' }> => o.kind === 'label')

  return (
    <div className="flex items-center justify-center h-full overflow-auto p-4">
      <div ref={ref} style={{ width, height }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="border border-gray-300 dark:border-gray-700">
          {boardState.cells.map((row, r) =>
            row.map((cell, c) => (
              <rect
                key={`${c},${r}`}
                x={c * CELL_SIZE}
                y={r * CELL_SIZE}
                width={CELL_SIZE}
                height={CELL_SIZE}
                fill={cell.fillColor}
                stroke="#9ca3af"
                strokeWidth={0.5}
              />
            )),
          )}

          {overlays.map((object) => (
            <OverlayWash key={object.id} object={object} />
          ))}

          {lines.map((object) => (
            <LineShape key={object.id} object={object} />
          ))}

          {shapes.map((object) => (
            <ShapeMarker key={object.id} object={object} />
          ))}

          {labels.map((object) => (
            <LabelText key={object.id} object={object} />
          ))}
        </svg>
      </div>
    </div>
  )
})
