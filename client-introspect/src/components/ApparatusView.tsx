import { useMemo, useState, type ReactNode } from 'react'
import type { ApparatusEntry, ApparatusEntryKind, UsageState } from '../hooks/useIntrospectSocket'

/** Fixed waffle grid dimensions — tunable. The grid is a square-aspect CSS
 * grid (`COLS / ROWS`) that scales up to fill whichever of the pane's width
 * or height is the binding constraint, then centers in the other axis — so
 * cells stay square instead of stretching to fill a non-matching pane shape. */
const COLS = 24
const ROWS = 36
const TOTAL_CELLS = COLS * ROWS

/** Zone band boundaries as fractions of the model's real context window.
 * Provisional starting values (design.md Decision 4) — easy to retune without
 * touching any other part of the view. `compaction` is implicitly "above dumb". */
const CONTEXT_ZONES = { smart: 0.5, dumb: 0.8 }

type Category = Exclude<ApparatusEntryKind, 'toolMarker'> | 'foundation'

const CATEGORY_META: Record<Category, { label: string; color: string }> = {
  foundation: { label: 'Foundation', color: '#64748b' },
  user: { label: 'User prompt', color: '#6366f1' },
  skill: { label: 'Skill auto-load', color: '#a78bfa' },
  toolResult: { label: 'Tool-result content', color: '#22d3ee' },
  reprocessed: { label: 'Reprocessed context (cache miss)', color: '#f43f5e' },
  thinking: { label: 'Thinking', color: '#fb923c' },
  output: { label: 'Assistant output', color: '#2dd4bf' },
}
const CATEGORY_ORDER: Category[] = ['foundation', 'user', 'skill', 'toolResult', 'reprocessed', 'thinking', 'output']

const TOOL_STATUS_COLOR: Record<'done' | 'running' | 'error', string> = {
  done: '#34d399',
  running: '#94a3b8',
  error: '#f87171',
}

function fmtTokens(n: number): string {
  return Math.round(n).toLocaleString()
}

interface Segment {
  start: number
  end: number
  kind: Category
}

/** Chronological [start, end) token segments: the pinned foundation zone (if any),
 * then every non-toolMarker entry in arrival order. Tool markers are excluded —
 * they're rendered as overlay markers, not binned into cells, since their true
 * token share is negligible and they're worth always seeing regardless of
 * aggregation. */
function buildSegments(entries: ApparatusEntry[], foundationTokens: number): Segment[] {
  const segs: Segment[] = []
  let cursor = 0
  if (foundationTokens > 0) {
    segs.push({ start: 0, end: foundationTokens, kind: 'foundation' })
    cursor = foundationTokens
  }
  for (const entry of entries) {
    if (entry.kind === 'toolMarker' || entry.tokens <= 0) continue
    segs.push({ start: cursor, end: cursor + entry.tokens, kind: entry.kind })
    cursor += entry.tokens
  }
  return segs
}

interface Cell {
  index: number
  contrib: Partial<Record<Category, number>>
  dominant: Category | null
}

/** Bins chronological segments into fixed-size grid cells. Several small
 * consecutive entries naturally land in the same cell and are reported
 * together; each cell keeps its full per-kind contribution breakdown but is
 * colored by a single dominant category. */
function buildCells(segs: Segment[], quantum: number, maxCells: number): Cell[] {
  if (quantum <= 0 || segs.length === 0) return []
  const total = segs[segs.length - 1].end
  const filledCount = Math.min(Math.ceil(total / quantum), maxCells)
  const cells: Cell[] = []
  let segIdx = 0
  for (let c = 0; c < filledCount; c++) {
    const cellStart = c * quantum
    const cellEnd = (c + 1) * quantum
    while (segIdx < segs.length && segs[segIdx].end <= cellStart) segIdx++
    const contrib: Partial<Record<Category, number>> = {}
    let k = segIdx
    while (k < segs.length && segs[k].start < cellEnd) {
      const seg = segs[k]
      const overlap = Math.min(seg.end, cellEnd) - Math.max(seg.start, cellStart)
      if (overlap > 0) contrib[seg.kind] = (contrib[seg.kind] ?? 0) + overlap
      k++
    }
    const sorted = Object.entries(contrib).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    cells.push({ index: c, contrib, dominant: sorted.length ? (sorted[0][0] as Category) : null })
  }
  return cells
}

interface Section {
  dominant: Category | null
  cellIndices: number[]
  totalsByKind: Partial<Record<Category, number>>
  total: number
}

/** Groups consecutive (row-major) cells sharing the same dominant category into
 * one hoverable "section", so a run reads as a single shape instead of N
 * independently-colored squares. */
function buildSections(cells: Cell[]): { sections: Section[]; cellSection: number[] } {
  const sections: Section[] = []
  const cellSection: number[] = []
  let current: Section | null = null
  for (const cell of cells) {
    if (!current || current.dominant !== cell.dominant) {
      current = { dominant: cell.dominant, cellIndices: [], totalsByKind: {}, total: 0 }
      sections.push(current)
    }
    current.cellIndices.push(cell.index)
    cellSection[cell.index] = sections.length - 1
    for (const [k, v] of Object.entries(cell.contrib)) {
      const kind = k as Category
      current.totalsByKind[kind] = (current.totalsByKind[kind] ?? 0) + (v ?? 0)
      current.total += v ?? 0
    }
  }
  return { sections, cellSection }
}

/** Groups tool-call markers by the grid cell they land in (deduplicated to one
 * marker per occupied cell), keyed by cumulative token position at the moment
 * each tool call started — i.e. wherever the surrounding chronological entries
 * had reached at that point. */
function buildToolCellGroups(entries: ApparatusEntry[], foundationTokens: number, quantum: number, totalCells: number): Map<number, ApparatusEntry[]> {
  const byCell = new Map<number, ApparatusEntry[]>()
  if (quantum <= 0) return byCell
  let cursor = foundationTokens
  for (const entry of entries) {
    if (entry.kind === 'toolMarker') {
      const cellIndex = Math.min(Math.floor(cursor / quantum), totalCells - 1)
      const list = byCell.get(cellIndex) ?? []
      list.push(entry)
      byCell.set(cellIndex, list)
    } else {
      cursor += entry.tokens
    }
  }
  return byCell
}

function worstToolStatus(list: ApparatusEntry[]): 'done' | 'running' | 'error' {
  if (list.some((e) => e.status === 'error')) return 'error'
  if (list.some((e) => e.status === 'running')) return 'running'
  return 'done'
}

function zoneOf(percent: number): 'smart' | 'dumb' | 'compaction' {
  if (percent >= CONTEXT_ZONES.dumb * 100) return 'compaction'
  if (percent >= CONTEXT_ZONES.smart * 100) return 'dumb'
  return 'smart'
}

const ZONE_TEXT_COLOR: Record<'smart' | 'dumb' | 'compaction', string> = {
  smart: '#34d399',
  dumb: '#fbbf24',
  compaction: '#f87171',
}

interface Tooltip {
  x: number
  y: number
  node: ReactNode
}

function CategorySwatch({ color }: { color: string }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-sm flex-none" style={{ background: color }} />
}

export function ApparatusView({
  entries,
  foundationTokens,
  usage,
}: {
  entries: ApparatusEntry[]
  foundationTokens: number
  usage: UsageState
}) {
  const contextWindow = usage.contextWindow || 0
  const quantum = contextWindow > 0 ? contextWindow / TOTAL_CELLS : 0

  const { cells, sections, cellSection, toolCellGroups } = useMemo(() => {
    const segs = buildSegments(entries, foundationTokens)
    const cells = buildCells(segs, quantum, TOTAL_CELLS)
    const { sections, cellSection } = buildSections(cells)
    const toolCellGroups = buildToolCellGroups(entries, foundationTokens, quantum, TOTAL_CELLS)
    return { cells, sections, cellSection, toolCellGroups }
  }, [entries, foundationTokens, quantum])

  const cumTotal = foundationTokens + entries.reduce((sum, e) => sum + e.tokens, 0)
  const percent = contextWindow > 0 ? (cumTotal / contextWindow) * 100 : 0
  const zone = zoneOf(percent)

  const categoryTotals = useMemo(() => {
    const totals: Partial<Record<Category, number>> = { foundation: foundationTokens }
    for (const entry of entries) {
      if (entry.kind === 'toolMarker') continue
      const kind = entry.kind as Category
      totals[kind] = (totals[kind] ?? 0) + entry.tokens
    }
    return totals
  }, [entries, foundationTokens])

  const toolCalls = entries.filter((e) => e.kind === 'toolMarker')
  const toolErrors = toolCalls.filter((e) => e.status === 'error').length

  const [hoverSection, setHoverSection] = useState<number | null>(null)
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)

  const showSectionTooltip = (ev: React.MouseEvent, section: Section) => {
    const rows = Object.entries(section.totalsByKind).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    const dominantMeta = section.dominant ? CATEGORY_META[section.dominant] : undefined
    setTooltip({
      x: ev.clientX,
      y: ev.clientY,
      node: (
        <div>
          <div
            className="inline-block text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded mb-1.5 font-bold"
            style={dominantMeta ? { background: `${dominantMeta.color}22`, color: dominantMeta.color, border: `1px solid ${dominantMeta.color}55` } : undefined}
          >
            {dominantMeta?.label ?? 'empty'} · section of {section.cellIndices.length} cell{section.cellIndices.length === 1 ? '' : 's'}
          </div>
          <div className="space-y-0.5 border-t border-gray-700 pt-1.5">
            {rows.map(([kind, tokens]) => (
              <div key={kind} className="flex justify-between gap-3 text-gray-300">
                <span className="flex items-center gap-1.5">
                  <CategorySwatch color={CATEGORY_META[kind as Category].color} />
                  {CATEGORY_META[kind as Category].label}
                </span>
                <span>{fmtTokens(tokens ?? 0)} tok</span>
              </div>
            ))}
          </div>
          <div className="text-gray-400 text-[10.5px] mt-1.5">
            {fmtTokens(section.total)} tok total in this section · cells #{section.cellIndices[0] + 1}–{section.cellIndices[section.cellIndices.length - 1] + 1}
          </div>
        </div>
      ),
    })
  }

  const showToolTooltip = (ev: React.MouseEvent, list: ApparatusEntry[]) => {
    setTooltip({
      x: ev.clientX,
      y: ev.clientY,
      node: (
        <div>
          <div className="inline-block text-[11px] px-1.5 py-0.5 rounded mb-1.5 bg-gray-700/40 border border-gray-600 text-gray-200">
            {list.length} tool call{list.length === 1 ? '' : 's'} in this cell
          </div>
          <div className="space-y-0.5">
            {list.map((call) => (
              <div key={call.id} className="flex justify-between gap-3 text-gray-300">
                <span className="flex items-center gap-1.5">
                  <CategorySwatch color={TOOL_STATUS_COLOR[call.status ?? 'done']} />
                  {call.toolName}
                </span>
                <span>
                  {call.status} · turn {call.turn}
                </span>
              </div>
            ))}
          </div>
        </div>
      ),
    })
  }

  const lastFilledIndex = cells.length - 1
  const smartRow = Math.floor((Math.min(CONTEXT_ZONES.smart * TOTAL_CELLS, TOTAL_CELLS)) / COLS)
  const dumbRow = Math.floor((Math.min(CONTEXT_ZONES.dumb * TOTAL_CELLS, TOTAL_CELLS)) / COLS)

  return (
    <div className="flex flex-col h-full bg-white text-gray-900 dark:bg-[#05070d] dark:text-white" onMouseLeave={() => setTooltip(null)}>
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-2 flex-none">
        <span className="font-semibold">Apparatus</span>
        <div className="text-right text-xs text-gray-500 dark:text-gray-400 leading-snug">
          <div className="text-base font-bold" style={{ color: ZONE_TEXT_COLOR[zone] }}>
            {percent.toFixed(1)}%
          </div>
          <div>
            <span className="tabular-nums font-medium text-gray-700 dark:text-gray-200">{fmtTokens(cumTotal)}</span> tokens · ~$
            {usage.estimatedCost.toFixed(4)}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 p-3">
        <div
          className="relative w-full h-full rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#0a0f1a] p-1.5 flex items-center justify-center"
          style={{ minHeight: 0, containerType: 'size' }}
        >
          <div
            className="relative"
            style={{
              aspectRatio: `${COLS} / ${ROWS}`,
              width: `min(100%, 100cqh * ${COLS / ROWS})`,
              maxWidth: '100%',
              maxHeight: '100%',
            }}
          >
            {/* zone bands */}
            <div
              className="absolute left-1.5 right-1.5 pointer-events-none"
              style={{ top: 0, height: `${(smartRow / ROWS) * 100}%`, background: 'rgba(52, 211, 153, 0.06)' }}
            />
            <div
              className="absolute left-1.5 right-1.5 pointer-events-none"
              style={{ top: `${(smartRow / ROWS) * 100}%`, height: `${((dumbRow - smartRow) / ROWS) * 100}%`, background: 'rgba(251, 191, 36, 0.10)' }}
            />
            <div
              className="absolute left-1.5 right-1.5 pointer-events-none"
              style={{ top: `${(dumbRow / ROWS) * 100}%`, bottom: 0, background: 'rgba(248, 113, 113, 0.12)' }}
            />
            <div
              className="absolute right-2 pointer-events-none text-[9px] uppercase tracking-wide text-gray-400 dark:text-gray-500 bg-white/60 dark:bg-black/40 px-1 rounded"
              style={{ top: 2 }}
            >
              smart zone
            </div>
            <div
              className="absolute right-2 pointer-events-none text-[9px] uppercase tracking-wide text-gray-400 dark:text-gray-500 bg-white/60 dark:bg-black/40 px-1 rounded"
              style={{ top: `calc(${(smartRow / ROWS) * 100}% + 2px)` }}
            >
              dumb zone
            </div>
            <div
              className="absolute right-2 pointer-events-none text-[9px] uppercase tracking-wide text-gray-400 dark:text-gray-500 bg-white/60 dark:bg-black/40 px-1 rounded"
              style={{ top: `calc(${(dumbRow / ROWS) * 100}% + 2px)` }}
            >
              forced compaction
            </div>

            {/* cell grid */}
            <div
              className="relative w-full h-full"
              style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)`, gap: '2px' }}
            >
              {Array.from({ length: TOTAL_CELLS }, (_, i) => {
                const cell = i < cells.length ? cells[i] : undefined
                const sectionIdx = cell ? cellSection[cell.index] : undefined
                const section = sectionIdx != null ? sections[sectionIdx] : undefined
                const color = cell?.dominant ? CATEGORY_META[cell.dominant].color : undefined
                const isHovered = sectionIdx != null && hoverSection === sectionIdx
                return (
                  <div
                    key={i}
                    className="rounded-sm"
                    style={{
                      background: color ?? 'rgba(120,120,120,0.08)',
                      cursor: cell ? 'pointer' : 'default',
                      boxShadow: [
                        i === lastFilledIndex ? '0 0 0 2px #f3f4f6, 0 0 4px 1px rgba(255,255,255,0.5)' : '',
                        isHovered ? 'inset 0 0 0 1px rgba(255,255,255,0.8)' : '',
                      ]
                        .filter(Boolean)
                        .join(', '),
                      filter: isHovered ? 'brightness(1.3)' : undefined,
                    }}
                    onMouseEnter={() => sectionIdx != null && setHoverSection(sectionIdx)}
                    onMouseMove={(ev) => section && showSectionTooltip(ev, section)}
                    onMouseLeave={() => {
                      setHoverSection(null)
                      setTooltip(null)
                    }}
                  />
                )
              })}
            </div>

            {/* tool call marker overlay */}
            <div className="absolute inset-1.5 pointer-events-none">
              {Array.from(toolCellGroups.entries()).map(([cellIndex, list]) => {
                const row = Math.floor(cellIndex / COLS)
                const col = cellIndex % COLS
                const status = worstToolStatus(list)
                const size = Math.min(45 + (list.length - 1) * 12, 85)
                return (
                  <div
                    key={cellIndex}
                    className="absolute flex items-center justify-center pointer-events-auto"
                    style={{
                      left: `${(col / COLS) * 100}%`,
                      top: `${(row / ROWS) * 100}%`,
                      width: `${(1 / COLS) * 100}%`,
                      height: `${(1 / ROWS) * 100}%`,
                    }}
                    onMouseMove={(ev) => showToolTooltip(ev, list)}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <div
                      className="rounded-sm"
                      style={{ width: `${size}%`, height: `${size}%`, background: TOOL_STATUS_COLOR[status], boxShadow: '0 0 0 1.5px #05070d' }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-800 p-3 space-y-3 flex-none overflow-y-auto max-h-[38%]">
        <div>
          <h3 className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Composition</h3>
          <div className="space-y-1">
            {CATEGORY_ORDER.map((kind) => {
              const tokens = categoryTotals[kind] ?? 0
              const share = cumTotal > 0 ? (tokens / cumTotal) * 100 : 0
              return (
                <div key={kind} className="flex items-center gap-2 text-xs">
                  <CategorySwatch color={CATEGORY_META[kind].color} />
                  <span className="flex-1 text-gray-500 dark:text-gray-400">{CATEGORY_META[kind].label}</span>
                  <span className="tabular-nums text-gray-700 dark:text-gray-200">
                    {fmtTokens(tokens)} ({share.toFixed(1)}%)
                  </span>
                </div>
              )
            })}
            <div className="flex items-center gap-2 text-xs">
              <CategorySwatch color={TOOL_STATUS_COLOR.done} />
              <span className="flex-1 text-gray-500 dark:text-gray-400">Tool calls (markers)</span>
              <span className="tabular-nums text-gray-700 dark:text-gray-200">
                {toolCalls.length} calls{toolErrors ? ` (${toolErrors} error)` : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {tooltip && (
        <div
          className="fixed z-50 max-w-[340px] bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-[11.5px] leading-relaxed text-gray-200 shadow-2xl pointer-events-none"
          style={{ left: Math.min(tooltip.x + 16, window.innerWidth - 360), top: Math.min(tooltip.y + 16, window.innerHeight - 40) }}
        >
          {tooltip.node}
        </div>
      )}
    </div>
  )
}
