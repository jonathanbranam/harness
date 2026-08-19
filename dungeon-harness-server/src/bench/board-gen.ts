// Board generation for the design bench.
//
// The harness makes its own boards rather than importing track-web's maps:
// track-web's map editor is expected to move into this harness eventually (see
// docs/dungeon-harness/harness-rebuild/README.md), so an import path would be a
// bridge to a component that is leaving. What comes out is an ordinary
// `ContentMap` — the same shape the game's own content store deserializes — so
// the engine treats a generated board exactly like a persisted one.
//
// Generation is deterministic: the same seed produces the same board, so a
// designer can say "board 7 again" and get it back without persistence.

import type { ContentMap, ContentObject, TerrainType } from '@repo/dungeon-engine'

export type BoardPreset = 'open' | 'scattered' | 'arena'

export interface GenerateBoardOptions {
  cols?: number
  rows?: number
  preset?: BoardPreset
  seed?: number
  /**
   * How many power centers to place. **This is what the enemy AI walks toward.**
   * The game's NPCs target structures, not PCs (they attack a PC only when one
   * wanders into their scan band), so a board with no structures makes
   * "run the enemy AI" a no-op — every NPC correctly decides to stay. Defaults
   * to one, placed centrally, so a generated board behaves the way a designer
   * expects on the first try.
   */
  powerCenters?: number
}

/** Structure codes for hand-written boards, alongside the terrain codes. */
export const STRUCTURE_CHARS: Record<string, { kind: 'power-center' | 'tower'; hp: number }> = {
  P: { kind: 'power-center', hp: 3 },
  T: { kind: 'tower', hp: 5 },
}

/** Single-character terrain codes, for boards written out by hand or by the agent. */
export const TERRAIN_CHARS: Record<string, TerrainType> = {
  '.': 'plains',
  f: 'forest',
  w: 'water',
  s: 'stone',
}

const CHAR_BY_TERRAIN: Record<TerrainType, string> = {
  plains: '.',
  forest: 'f',
  water: 'w',
  stone: 's',
}

export const DEFAULT_COLS = 12
export const DEFAULT_ROWS = 8
const MIN_SIZE = 3
const MAX_SIZE = 24

// mulberry32 — small, fast, and stable across Node versions, which matters
// because the seed is the whole reproducibility story here.
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clampSize(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(n)))
}

function terrainFor(preset: BoardPreset, next: () => number, col: number, row: number, cols: number, rows: number): TerrainType {
  if (preset === 'open') return 'plains'

  if (preset === 'arena') {
    // A ring of stone one tile in from the edge, with gaps at the midpoints so
    // the interior is reachable — a board that makes movement decisions matter
    // without needing hand-placed terrain.
    const onRing = col === 1 || col === cols - 2 || row === 1 || row === rows - 2
    const inside = col >= 1 && col <= cols - 2 && row >= 1 && row <= rows - 2
    const gap = col === Math.floor(cols / 2) || row === Math.floor(rows / 2)
    return onRing && inside && !gap ? 'stone' : 'plains'
  }

  // 'scattered': mostly open, with enough cover and water to change pathing.
  const r = next()
  if (r < 0.12) return 'forest'
  if (r < 0.18) return 'water'
  if (r < 0.22) return 'stone'
  return 'plains'
}

/**
 * Build a board. `preset` shapes the terrain; `seed` makes 'scattered'
 * reproducible (the other presets ignore it, being fully determined by size).
 *
 * Spawn zones are set to the bottom row (player) and top row (enemy) so the map
 * is well-formed, but the bench places units freely and does not use them.
 */
export function generateBoard(opts: GenerateBoardOptions = {}): ContentMap {
  const cols = clampSize(opts.cols ?? DEFAULT_COLS, DEFAULT_COLS)
  const rows = clampSize(opts.rows ?? DEFAULT_ROWS, DEFAULT_ROWS)
  const preset = opts.preset ?? 'scattered'
  const seed = opts.seed ?? 1
  const next = rng(seed)

  const terrain: TerrainType[][] = []
  for (let row = 0; row < rows; row++) {
    const line: TerrainType[] = []
    for (let col = 0; col < cols; col++) line.push(terrainFor(preset, next, col, row, cols, rows))
    terrain.push(line)
  }

  // Power centers go on plains, spread across the middle band, so the enemy AI
  // has something to walk toward and the designer has something to defend.
  const wanted = Math.max(0, Math.min(opts.powerCenters ?? 1, Math.floor(cols / 2)))
  const objects: ContentObject[] = []
  const midRow = Math.floor(rows / 2)
  for (let i = 0; i < wanted; i++) {
    const col = Math.round(((i + 1) * cols) / (wanted + 1))
    const clamped = Math.max(0, Math.min(cols - 1, col))
    terrain[midRow][clamped] = 'plains'
    objects.push({ col: clamped, row: midRow, kind: 'power-center', hp: 3 })
  }

  return {
    id: `bench-${preset}-${cols}x${rows}-${seed}`,
    regionId: 'bench',
    name: `${preset} ${cols}×${rows}`,
    order: 0,
    size: { cols, rows },
    objects,
    terrain,
    playerSpawnZone: Array.from({ length: cols }, (_, col) => `${col},${rows - 1}`),
    enemySpawnZone: Array.from({ length: cols }, (_, col) => `${col},0`),
  }
}

/**
 * Build a board from explicit rows — the authoring path, used when a designer or
 * the agent wants a specific layout rather than a generated one. Rows run top to
 * bottom, one character per tile: terrain from `TERRAIN_CHARS`, structures from
 * `STRUCTURE_CHARS` (`P` power center, `T` tower), which sit on plains.
 * Throws on a ragged grid or an unknown character, so a malformed board is
 * reported rather than silently squared off.
 */
export function boardFromRows(rows: string[], name = 'custom'): ContentMap {
  if (rows.length < MIN_SIZE) throw new Error(`A board needs at least ${MIN_SIZE} rows, got ${rows.length}`)
  const cols = rows[0].length
  if (cols < MIN_SIZE) throw new Error(`A board needs at least ${MIN_SIZE} columns, got ${cols}`)

  const objects: ContentObject[] = []
  const terrain: TerrainType[][] = rows.map((line, rowIndex) => {
    if (line.length !== cols) {
      throw new Error(`Row ${rowIndex} has ${line.length} columns; row 0 has ${cols} — every row must be the same width`)
    }
    return Array.from(line, (char, colIndex) => {
      const structure = STRUCTURE_CHARS[char]
      if (structure) {
        objects.push({ col: colIndex, row: rowIndex, kind: structure.kind, hp: structure.hp })
        return 'plains'
      }
      const t = TERRAIN_CHARS[char]
      if (!t) {
        const valid = [...Object.keys(TERRAIN_CHARS), ...Object.keys(STRUCTURE_CHARS)].join(' ')
        throw new Error(`Unknown character "${char}" at (${colIndex}, ${rowIndex}). Valid: ${valid}`)
      }
      return t
    })
  })

  return {
    id: `bench-custom-${cols}x${rows.length}`,
    regionId: 'bench',
    name,
    order: 0,
    size: { cols, rows: rows.length },
    objects,
    terrain,
    playerSpawnZone: Array.from({ length: cols }, (_, col) => `${col},${rows.length - 1}`),
    enemySpawnZone: Array.from({ length: cols }, (_, col) => `${col},0`),
  }
}

/** The inverse of `boardFromRows`, so a board can be shown to the agent (or a
 *  human) as text — structures included, since they are what the enemy AI aims at. */
export function boardToRows(map: ContentMap): string[] {
  const structureAt = new Map<string, string>()
  for (const obj of map.objects) {
    const char = Object.entries(STRUCTURE_CHARS).find(([, s]) => s.kind === obj.kind)?.[0]
    if (char) structureAt.set(`${obj.col},${obj.row}`, char)
  }
  return map.terrain.map((row, rowIndex) =>
    row.map((t, colIndex) => structureAt.get(`${colIndex},${rowIndex}`) ?? CHAR_BY_TERRAIN[t]).join(''),
  )
}
