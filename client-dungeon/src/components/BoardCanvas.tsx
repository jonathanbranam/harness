import type { AttackPreviewResult, BoardState, Cell, MovementPreviewResult, PlacedUnit } from '../hooks/useDungeonSocket'

const CELL_SIZE = 40

const TERRAIN_COLORS: Record<string, string> = {
  plains: '#e5e7eb',
  forest: '#166534',
  water: '#1d4ed8',
  stone: '#57534e',
}

const FACTION_COLORS: Record<string, string> = {
  pc: '#4f46e5',
  npc: '#dc2626',
}

const ARCHETYPE_LABELS: Record<string, string> = {
  melee: 'ML',
  rogue: 'RG',
  ranger: 'RN',
  'magic-user': 'MU',
  'short-range': 'SR',
  'long-range': 'LR',
}

function cellCenter(cell: Cell): { x: number; y: number } {
  return { x: cell.col * CELL_SIZE + CELL_SIZE / 2, y: cell.row * CELL_SIZE + CELL_SIZE / 2 }
}

function UnitMarker({ unit }: { unit: PlacedUnit }) {
  const { x, y } = cellCenter(unit.position)
  const color = FACTION_COLORS[unit.faction] ?? '#6b7280'
  return (
    <g>
      <circle cx={x} cy={y} r={CELL_SIZE * 0.36} fill={color} stroke="#ffffff" strokeWidth={2} />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600} fill="#ffffff">
        {ARCHETYPE_LABELS[unit.archetype] ?? unit.archetype.slice(0, 2).toUpperCase()}
      </text>
    </g>
  )
}

interface BoardCanvasProps {
  boardState: BoardState | null
  movementPreview?: MovementPreviewResult
  attackPreview?: AttackPreviewResult
}

/**
 * Plain SVG rendering of the live board — grid, terrain, unit placements,
 * and the most recent movement/attack preview overlay, if any. Mirrors
 * client-deck's DeckCanvas precedent of plain SVG/Canvas over Phaser for a
 * live-state view (see design.md/proposal.md).
 */
export function BoardCanvas({ boardState, movementPreview, attackPreview }: BoardCanvasProps) {
  if (!boardState) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-gray-500">Waiting for board state…</div>
    )
  }

  const width = boardState.width * CELL_SIZE
  const height = boardState.height * CELL_SIZE
  const hitKeys = new Set((attackPreview?.hits ?? []).map((c) => `${c.col},${c.row}`))

  return (
    <div className="flex items-center justify-center h-full overflow-auto p-4">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="border border-gray-300 dark:border-gray-700">
        {boardState.cells.map((row, r) =>
          row.map((cell, c) => (
            <rect
              key={`${c},${r}`}
              x={c * CELL_SIZE}
              y={r * CELL_SIZE}
              width={CELL_SIZE}
              height={CELL_SIZE}
              fill={TERRAIN_COLORS[cell.terrain] ?? '#e5e7eb'}
              stroke="#9ca3af"
              strokeWidth={0.5}
            />
          )),
        )}

        {attackPreview?.footprint.map((cell) => {
          const hit = hitKeys.has(`${cell.col},${cell.row}`)
          return (
            <rect
              key={`fp-${cell.col},${cell.row}`}
              x={cell.col * CELL_SIZE}
              y={cell.row * CELL_SIZE}
              width={CELL_SIZE}
              height={CELL_SIZE}
              fill={hit ? 'rgba(220, 38, 38, 0.55)' : 'rgba(220, 38, 38, 0.2)'}
              stroke={hit ? '#dc2626' : '#f87171'}
              strokeWidth={hit ? 2 : 1}
            />
          )
        })}

        {movementPreview && movementPreview.path.length > 1 && (
          <polyline
            points={movementPreview.path.map((cell) => { const { x, y } = cellCenter(cell); return `${x},${y}` }).join(' ')}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="2 6"
          />
        )}

        {boardState.units.map((unit) => (
          <UnitMarker key={unit.id} unit={unit} />
        ))}
      </svg>
    </div>
  )
}
