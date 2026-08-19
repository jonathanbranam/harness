import { forwardRef } from 'react'
import {
  TERRAIN_COLORS,
  UNIT_COLORS,
  UNIT_INITIALS,
  type BenchState,
  type Direction,
  type FieldToggles,
  type Tile,
  type Unit,
} from '../bench/types'

export const CELL_SIZE = 48

interface BoardViewProps {
  state: BenchState | null
  /** The direction currently armed for attack, if any — its footprint is highlighted. */
  armedDirection: Direction | null
  fields: FieldToggles
  onTileClick: (tile: Tile) => void
  onUnitClick: (unit: Unit) => void
}

/** Field paint: player side cool, enemy side warm; threat reads stronger than
 *  reach, since "what can touch this tile" is the sharper question. Opacity
 *  steps with the count, so a tile two units cover looks different from one. */
const FIELD_STYLE = {
  pcReach: { color: '#0ea5e9', base: 0.1, step: 0.06 },
  pcThreat: { color: '#2563eb', base: 0.16, step: 0.1 },
  npcReach: { color: '#f59e0b', base: 0.1, step: 0.06 },
  npcThreat: { color: '#dc2626', base: 0.16, step: 0.1 },
} as const

function key(tile: { col: number; row: number }): string {
  return `${tile.col},${tile.row}`
}

/**
 * The bench board.
 *
 * Everything drawn here comes from server state that the game engine produced:
 * terrain and structures from the engine's board, reachable tiles and attack
 * footprints from its own queries, telegraphs from its AI. The client computes
 * no rule of its own — it decides colors, not legality.
 */
export const BoardView = forwardRef<HTMLDivElement, BoardViewProps>(function BoardView(
  { state, armedDirection, fields, onTileClick, onUnitClick },
  ref,
) {
  if (!state) {
    return (
      <div ref={ref} className="h-full grid place-items-center text-sm text-gray-500 dark:text-gray-400">
        Waiting for the bench…
      </div>
    )
  }

  const { board, units, selection, telegraphs } = state
  const width = board.cols * CELL_SIZE
  const height = board.rows * CELL_SIZE

  const reachable = new Set((selection?.moveDests ?? []).map(key))
  const footprint = new Set(
    armedDirection && selection ? selection.attackByDir[armedDirection].map(key) : [],
  )
  const telegraphed = new Set(telegraphs.map((t) => `${t.targetCol},${t.targetRow}`))

  // Painted bottom to top so threat sits over reach and the enemy over the player
  // — the layer a designer is usually asking about ends up on top.
  const activeLayers = ([
    ['pcReach', state.fields.reach.pc],
    ['npcReach', state.fields.reach.npc],
    ['pcThreat', state.fields.threat.pc],
    ['npcThreat', state.fields.threat.npc],
  ] as const).filter(([id]) => fields[id])

  return (
    <div className="h-full overflow-auto grid place-items-center p-4">
      <div ref={ref} className="inline-block bg-white dark:bg-gray-950">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Board ${board.name}`}>
          {board.cells.map((row, rowIndex) =>
            row.map((cell, colIndex) => {
              const x = colIndex * CELL_SIZE
              const y = rowIndex * CELL_SIZE
              const tileKey = `${colIndex},${rowIndex}`
              return (
                <g key={tileKey} onClick={() => onTileClick({ col: colIndex, row: rowIndex })} className="cursor-pointer">
                  <rect x={x} y={y} width={CELL_SIZE} height={CELL_SIZE} fill={TERRAIN_COLORS[cell.terrain]} stroke="#00000022" strokeWidth={1} />

                  {cell.hasStructure && (
                    <>
                      <rect
                        x={x + 6}
                        y={y + 6}
                        width={CELL_SIZE - 12}
                        height={CELL_SIZE - 12}
                        rx={3}
                        fill={cell.structureKind === 'tower' ? '#5d4037' : '#8d6e63'}
                        stroke="#3e2723"
                        strokeWidth={2}
                      />
                      <text x={x + CELL_SIZE / 2} y={y + CELL_SIZE / 2 + 4} textAnchor="middle" fontSize={12} fill="#fff">
                        {cell.structureHp}
                      </text>
                    </>
                  )}

                  {activeLayers.map(([id, counts]) => {
                    const count = counts[tileKey]
                    if (!count) return null
                    const style = FIELD_STYLE[id]
                    return (
                      <rect
                        key={id}
                        x={x}
                        y={y}
                        width={CELL_SIZE}
                        height={CELL_SIZE}
                        fill={style.color}
                        opacity={Math.min(0.55, style.base + (count - 1) * style.step)}
                      />
                    )
                  })}

                  {reachable.has(tileKey) && (
                    <rect x={x + 2} y={y + 2} width={CELL_SIZE - 4} height={CELL_SIZE - 4} fill="#22d3ee55" stroke="#0891b2" strokeWidth={2} />
                  )}

                  {footprint.has(tileKey) && (
                    <rect x={x + 2} y={y + 2} width={CELL_SIZE - 4} height={CELL_SIZE - 4} fill="#ef444455" stroke="#dc2626" strokeWidth={2} />
                  )}

                  {telegraphed.has(tileKey) && (
                    <path
                      d={`M ${x + 10} ${y + 10} L ${x + CELL_SIZE - 10} ${y + CELL_SIZE - 10} M ${x + CELL_SIZE - 10} ${y + 10} L ${x + 10} ${y + CELL_SIZE - 10}`}
                      stroke="#b91c1c"
                      strokeWidth={3}
                      strokeLinecap="round"
                    />
                  )}
                </g>
              )
            }),
          )}

          {units.map((unit) => {
            const cx = unit.col * CELL_SIZE + CELL_SIZE / 2
            const cy = unit.row * CELL_SIZE + CELL_SIZE / 2
            const isSelected = selection?.unitId === unit.id
            return (
              <g
                key={unit.id}
                onClick={(event) => {
                  event.stopPropagation()
                  onUnitClick(unit)
                }}
                className="cursor-pointer"
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={CELL_SIZE / 2 - 6}
                  fill={UNIT_COLORS[unit.unitType]}
                  stroke={isSelected ? '#111827' : '#00000055'}
                  strokeWidth={isSelected ? 4 : 2}
                />
                <text x={cx} y={cy + 5} textAnchor="middle" fontSize={16} fontWeight={700} fill="#ffffff">
                  {UNIT_INITIALS[unit.unitType]}
                </text>
                {/* HP pips along the bottom of the tile — readable at a glance
                    without a tooltip, which matters when scanning a whole board. */}
                {Array.from({ length: unit.hp }, (_, i) => (
                  <circle key={i} cx={unit.col * CELL_SIZE + 8 + i * 7} cy={unit.row * CELL_SIZE + CELL_SIZE - 6} r={2.5} fill="#111827" />
                ))}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
})
