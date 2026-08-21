import { forwardRef } from 'react'
import {
  TERRAIN_COLORS,
  UNIT_COLORS,
  UNIT_INITIALS,
  type ActionId,
  type BenchState,
  type FieldToggles,
  type Tile,
  type Unit,
} from '../bench/types'

export const CELL_SIZE = 48

interface BoardViewProps {
  state: BenchState | null
  /** Which action is armed. Its engine-offered target tiles are highlighted, and
   *  clicking one commits it. */
  armedAction: ActionId
  fields: FieldToggles
  onTileClick: (tile: Tile) => void
  onUnitClick: (unit: Unit) => void
  /**
   * Attack tiles offered by a staged enemy-planning candidate
   * (`BenchState.npcPlanPreview`) — distinct from the armed-action footprint
   * above, which reflects a unit's *current* position, because these are
   * "what it would hit if planned this way," a hypothetical the direct-commit
   * overlay has no notion of. Also drives the amend flow's target highlight.
   */
  planningAttackTiles?: Tile[]
}

/**
 * Field paint: player side cool, enemy side warm.
 *
 * **Reach is a flat wash; threat is hatched**, and the two sides' hatches lean
 * opposite ways. Flat tints alone did not survive contact — with more than one
 * field on, the board turned into a muddy wash you could not read a side out of,
 * and the tint was easy to mistake for terrain. Texture separates the layers even
 * where they overlap, which is exactly where the interesting tiles are.
 *
 * Opacity still steps with the count, so a tile two units cover reads stronger
 * than one covered by a single unit.
 */
const FIELD_STYLE = {
  pcReach: { color: '#0284c7', base: 0.14, step: 0.07, pattern: null },
  pcThreat: { color: '#1d4ed8', base: 0.5, step: 0.15, pattern: 'hatch-pc' },
  npcReach: { color: '#d97706', base: 0.14, step: 0.07, pattern: null },
  npcThreat: { color: '#b91c1c', base: 0.5, step: 0.15, pattern: 'hatch-npc' },
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
  { state, armedAction, fields, onTileClick, onUnitClick, planningAttackTiles },
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

  // The armed action's targets, straight from the engine. The board paints what
  // it is told is legal; it does not work out reach or range for itself.
  const armed = selection?.actions.find((a) => a.id === armedAction)
  const offered = armed?.available ? armed.targets : []
  const reachable = new Set(armedAction === 'move' ? offered.map(key) : (selection?.moveDests ?? []).map(key))
  const footprint = new Set(armedAction === 'attack' ? offered.map(key) : [])
  const telegraphed = new Set(telegraphs.map((t) => `${t.targetCol},${t.targetRow}`))
  const planningTargets = new Set((planningAttackTiles ?? []).map(key))

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
          <defs>
            {/* Opposed diagonals: player threat leans one way, enemy threat the
                other, so a tile both sides threaten reads as a cross-hatch
                rather than as a third colour. */}
            <pattern id="hatch-pc" width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1={0} y1={0} x2={0} y2={8} stroke={FIELD_STYLE.pcThreat.color} strokeWidth={3} />
            </pattern>
            <pattern id="hatch-npc" width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
              <line x1={0} y1={0} x2={0} y2={8} stroke={FIELD_STYLE.npcThreat.color} strokeWidth={3} />
            </pattern>
          </defs>
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
                        fill={style.pattern ? `url(#${style.pattern})` : style.color}
                        opacity={Math.min(0.8, style.base + (count - 1) * style.step)}
                      />
                    )
                  })}

                  {reachable.has(tileKey) && (
                    <rect x={x + 2} y={y + 2} width={CELL_SIZE - 4} height={CELL_SIZE - 4} fill="#22d3ee55" stroke="#0891b2" strokeWidth={2} />
                  )}

                  {footprint.has(tileKey) && (
                    <rect x={x + 2} y={y + 2} width={CELL_SIZE - 4} height={CELL_SIZE - 4} fill="#ef444455" stroke="#dc2626" strokeWidth={2} />
                  )}

                  {/* A distinct amber, never the direct-commit red/cyan above:
                      this is "what a *staged, uncommitted* enemy plan would
                      hit," not a currently-armed action's real target set. */}
                  {planningTargets.has(tileKey) && (
                    <rect x={x + 4} y={y + 4} width={CELL_SIZE - 8} height={CELL_SIZE - 8} fill="#f59e0b3d" stroke="#d97706" strokeWidth={2} strokeDasharray="4 3" />
                  )}

                  {telegraphed.has(tileKey) && (
                    // A telegraph has to read over any terrain or structure
                    // fill *and* under a reach/threat field on the same tile
                    // (both can paint the whole tile, up to 0.8 opacity) *and*
                    // over the unit token standing on the threatened tile —
                    // which, for an enemy telegraph, is usually exactly where
                    // the PC it is aimed at stands. A single-color X (the
                    // marker this replaces, `#b91c1c` — the same red as the
                    // npc-threat hatch) loses all three fights at once: no
                    // fixed color survives being drawn under an arbitrary
                    // fill, and a token's solid disc simply covers a mark
                    // centered on the tile.
                    //
                    // This is a halo ring instead: white behind near-black,
                    // the two ends of the lightness scale, so at least one
                    // band contrasts against any single fill color — the same
                    // technique a map pin uses to stay legible over an
                    // arbitrary basemap. Dashed to read as *pending*, not a
                    // steady-state indicator like the solid reach/footprint
                    // squares. Sized to sit just outside a unit token's own
                    // radius (`CELL_SIZE / 2 - 6` = 18) so it rings the token
                    // rather than disappearing under it.
                    <g pointerEvents="none">
                      <circle cx={x + CELL_SIZE / 2} cy={y + CELL_SIZE / 2} r={20} fill="none" stroke="#ffffff" strokeWidth={5.5} />
                      <circle
                        cx={x + CELL_SIZE / 2}
                        cy={y + CELL_SIZE / 2}
                        r={20}
                        fill="none"
                        stroke="#111827"
                        strokeWidth={2.5}
                        strokeDasharray="5 4"
                      />
                    </g>
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
