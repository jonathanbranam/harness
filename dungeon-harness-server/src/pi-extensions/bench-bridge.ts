// Registers the dungeon_* tools that let pi drive the design bench.
//
// **Every tool here is a thin wrapper over one `BenchStore` method, and every
// `BenchStore` method is a thin wrapper over the real game engine.** There is no
// tool that draws, no tool that asserts a rule outcome, and no tool that answers
// a rule question from anything but an engine call. That is deliberate: the
// previous version of this harness gave the agent generic drawing primitives, it
// became the rules engine, and it was a bad one (docs/dungeon-harness/STATUS.md).
//
// Per-session factory, like permission-gate.ts: the bench belongs to one design
// session, not the process.

import type { ExtensionAPI, ExtensionFactory } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import type { BenchStore, SelectionView, UnitType } from '../bench/bench-store'
import { UNIT_TYPES } from '../bench/bench-store'
import { boardFromRows, boardToRows, generateBoard } from '../bench/board-gen'
import type { ActionId, ActionPreview, Unit } from '@repo/dungeon-engine'

/** Tool names registered here, for session-store.ts's allowlist. */
export const BENCH_TOOL_NAMES = [
  'dungeon_board_state',
  'dungeon_new_board',
  'dungeon_place_unit',
  'dungeon_remove_unit',
  'dungeon_relocate_unit',
  'dungeon_set_unit_hp',
  'dungeon_clear_units',
  'dungeon_select_unit',
  'dungeon_unit_options',
  'dungeon_fields',
  'dungeon_move_unit',
  'dungeon_attack',
  'dungeon_preview_action',
  'dungeon_run_enemy_ai',
  'dungeon_end_round',
  'dungeon_undo',
  'dungeon_redo',
  'dungeon_step_to',
  'dungeon_tweak_unit_def',
  'dungeon_reset_unit_defs',
  'dungeon_save_bookmark',
  'dungeon_load_bookmark',
  'dungeon_delete_bookmark',
] as const

const text = (value: unknown) => [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]

/** Shape every mutating tool returns: the outcome plus the board it produced, so
 *  the agent never has to guess what changed and never has to re-read to find out. */
interface BenchToolDetails {
  ok: boolean
  error?: string
  message?: string
  board?: string[]
  units?: Unit[]
  selection?: SelectionView | null
  preview?: ActionPreview
}

interface BenchToolResult {
  content: { type: 'text'; text: string }[]
  details: BenchToolDetails
  isError?: boolean
}

function outcome(bench: BenchStore, result: { ok: true; message: string } | { ok: false; error: string }): BenchToolResult {
  if (!result.ok) {
    return { content: text(result.error), details: { ok: false, error: result.error }, isError: true }
  }
  const state = bench.getState()
  const details = { ok: true, message: result.message, board: bench.boardRows(), units: state.units, selection: state.selection }
  return { content: text(details), details }
}

export function createBenchBridgeExtension(opts: { bench: BenchStore }): ExtensionFactory {
  const { bench } = opts
  const unitTypeParam = Type.String({ description: `One of: ${UNIT_TYPES.join(', ')}` })

  const asUnitType = (value: string): UnitType | undefined => (UNIT_TYPES as string[]).includes(value) ? (value as UnitType) : undefined

  return function benchBridge(pi: ExtensionAPI) {
    // ─── Reading ──────────────────────────────────────────────────────────────

    pi.registerTool({
      name: 'dungeon_board_state',
      label: 'Read Bench',
      description:
        'Read the whole bench: saved bookmarks, the board as terrain rows (. plains, f forest, w water, s stone, P power center, T tower), every unit with position and HP, the current selection with its engine-derived move and attack options, enemy attack telegraphs, the unit definitions in force, and the recent action log. Everything derived here is computed by the game engine at read time, so it is never stale.',
      promptSnippet: 'Read the live bench: board, units, selection, options, definitions',
      parameters: Type.Object({}),
      execute: async () => {
        const state = bench.getState()
        const details = { ...state, board: { ...state.board, rows: bench.boardRows() } }
        return { content: text(details), details }
      },
    })

    pi.registerTool({
      name: 'dungeon_unit_options',
      label: 'Unit Options',
      description:
        'Ask the engine what a unit can do right now: its available actions (move, attack), whether each is available and the reason when it is not, the exact tiles each action may be aimed at, movement remaining, and whether it has already attacked. This is the tool to call before answering any question about reach, range, or what is targetable — never answer those from memory. Attacks are aimed at a tile, never a direction.',
      promptSnippet: "Ask the engine what a unit may do and where it may aim",
      parameters: Type.Object({ unit_id: Type.String() }),
      execute: async (_id, params): Promise<BenchToolResult> => {
        // Reads through the selection so the answer is exactly what the designer
        // would see if they clicked the unit, then puts the selection back.
        const previous = bench.getState().selection?.unitId ?? null
        const selected = bench.select(params.unit_id)
        if (!selected.ok) return { content: text(selected.error), details: { ok: false, error: selected.error }, isError: true }
        const selection = bench.getState().selection
        if (previous && previous !== params.unit_id) bench.select(previous)
        return { content: text(selection), details: { ok: true, selection } }
      },
    })

    pi.registerTool({
      name: 'dungeon_fields',
      label: 'Reach and Threat',
      description:
        'Ask the engine what each side can reach and what each side can hit, across the whole board at once. Returned as rows of digits, one character per tile: the number of units of that side covering it, or "." for none. Threat counts a move first — a unit that could step two tiles and then swing threatens where it would land. Use this to answer "what can touch her?" and "where is it safe to stand?", and to show what a definition change did.',
      promptSnippet: 'Read reach and threat across the whole board',
      parameters: Type.Object({
        side: Type.String({ description: 'pc | npc' }),
        layer: Type.String({ description: 'reach | threat' }),
      }),
      execute: async (_id, params): Promise<BenchToolResult> => {
        const side = params.side === 'npc' ? 'npc' : 'pc'
        const layer = params.layer === 'reach' ? 'reach' : 'threat'
        const rows = bench.fieldRows(side, layer)
        const message = `${side} ${layer}:\n${rows.join('\n')}`
        return { content: text(message), details: { ok: true, message, board: rows } }
      },
    })

    // ─── Board setup ──────────────────────────────────────────────────────────

    pi.registerTool({
      name: 'dungeon_new_board',
      label: 'New Board',
      description:
        'Replace the board and clear every unit. Either generate one (cols, rows, preset "open" | "scattered" | "arena", seed for reproducibility, power_centers) or supply exact rows of terrain characters (. plains, f forest, w water, s stone, P power center, T tower), top row first. Note: the enemy AI walks toward power centers and only shoots a PC that strays into its scan band — a board with no structures makes "run the enemy AI" do nothing.',
      promptSnippet: 'Generate or author a new board, clearing all units',
      parameters: Type.Object({
        rows_text: Type.Optional(Type.Array(Type.String(), { description: 'Exact board rows, top first. Overrides the generated options.' })),
        cols: Type.Optional(Type.Number()),
        rows: Type.Optional(Type.Number()),
        preset: Type.Optional(Type.String({ description: 'open | scattered | arena' })),
        seed: Type.Optional(Type.Number()),
        power_centers: Type.Optional(Type.Number()),
      }),
      execute: async (_id, params) => {
        try {
          const map = params.rows_text
            ? boardFromRows(params.rows_text)
            : generateBoard({
                cols: params.cols,
                rows: params.rows,
                preset: params.preset as 'open' | 'scattered' | 'arena' | undefined,
                seed: params.seed,
                powerCenters: params.power_centers,
              })
          const result = bench.newBoard(map)
          return outcome(bench, result.ok ? { ok: true, message: `${result.message}\n${boardToRows(map).join('\n')}` } : result)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not build that board'
          return { content: text(message), details: { ok: false, error: message }, isError: true }
        }
      },
    })

    pi.registerTool({
      name: 'dungeon_place_unit',
      label: 'Place Unit',
      description:
        'Put a unit on any empty tile — this is a bench, so spawn zones do not apply. HP defaults to the type\'s maximum; pass hp to start it wounded. PC types are melee, ranger, magic-user, rogue; NPC types are short-range, long-range.',
      promptSnippet: 'Place a unit on any tile',
      parameters: Type.Object({
        unit_type: unitTypeParam,
        col: Type.Number(),
        row: Type.Number(),
        hp: Type.Optional(Type.Number()),
      }),
      execute: async (_id, params) => {
        const unitType = asUnitType(params.unit_type)
        if (!unitType) return { content: text(`Unknown unit type "${params.unit_type}"`), details: { ok: false }, isError: true }
        return outcome(bench, bench.placeUnit(unitType, params.col, params.row, params.hp))
      },
    })

    pi.registerTool({
      name: 'dungeon_remove_unit',
      label: 'Remove Unit',
      description: 'Take a unit off the board entirely.',
      promptSnippet: 'Remove a unit from the board',
      parameters: Type.Object({ unit_id: Type.String() }),
      execute: async (_id, params) => outcome(bench, bench.removeUnit(params.unit_id)),
    })

    pi.registerTool({
      name: 'dungeon_relocate_unit',
      label: 'Relocate Unit',
      description:
        'Move a unit during setup, ignoring movement range and pathing — this is placing a piece, not taking a turn. Use dungeon_move_unit to take a turn.',
      promptSnippet: 'Reposition a unit during setup',
      parameters: Type.Object({ unit_id: Type.String(), col: Type.Number(), row: Type.Number() }),
      execute: async (_id, params) => outcome(bench, bench.relocateUnit(params.unit_id, params.col, params.row)),
    })

    pi.registerTool({
      name: 'dungeon_set_unit_hp',
      label: 'Set Unit HP',
      description: "Set one unit's current HP, for starting a scenario mid-fight.",
      promptSnippet: "Set a unit's current HP",
      parameters: Type.Object({ unit_id: Type.String(), hp: Type.Number() }),
      execute: async (_id, params) => outcome(bench, bench.setUnitHp(params.unit_id, params.hp)),
    })

    pi.registerTool({
      name: 'dungeon_clear_units',
      label: 'Clear Units',
      description: 'Remove every unit, keeping the board.',
      promptSnippet: 'Remove every unit from the board',
      parameters: Type.Object({}),
      execute: async () => outcome(bench, bench.clearUnits()),
    })

    // ─── Playing ──────────────────────────────────────────────────────────────

    pi.registerTool({
      name: 'dungeon_select_unit',
      label: 'Select Unit',
      description:
        'Select a unit (or pass no id to clear the selection). The selection is shared with the browser: what you select is what the designer sees highlighted, with its reachable tiles and attack footprints drawn.',
      promptSnippet: 'Select a unit on the board',
      parameters: Type.Object({ unit_id: Type.Optional(Type.String()) }),
      execute: async (_id, params) => outcome(bench, bench.select(params.unit_id ?? null)),
    })

    pi.registerTool({
      name: 'dungeon_move_unit',
      label: 'Move Unit',
      description:
        'Move the selected unit to a tile as a turn action. The engine decides whether the tile is reachable, finds the path, and charges the movement budget — a tile it rejects is a tile the unit genuinely cannot reach. Works for both sides: driving the enemy by hand is the point of this bench.',
      promptSnippet: 'Move the selected unit as a turn action',
      parameters: Type.Object({ col: Type.Number(), row: Type.Number() }),
      execute: async (_id, params) => outcome(bench, bench.commitSelected('move', { col: params.col, row: params.row })),
    })

    pi.registerTool({
      name: 'dungeon_attack',
      label: 'Attack',
      description:
        "Attack with the selected unit, aimed at a target tile. Call dungeon_unit_options first and pick one of the attack action's target tiles — a tile the engine does not offer is refused. Aim by tile, never by direction: an area attack covers tiles either side of its centre, and no direction names those. A PC attack damages every NPC and structure the attack covers; an NPC attack damages the one tile. Attacking is committal: the unit cannot move or attack again until the round ends.",
      promptSnippet: 'Attack with the selected unit, aimed at a tile',
      parameters: Type.Object({ col: Type.Number(), row: Type.Number() }),
      execute: async (_id, params) => outcome(bench, bench.commitSelected('attack', { col: params.col, row: params.row })),
    })

    pi.registerTool({
      name: 'dungeon_preview_action',
      label: 'Preview Action',
      description:
        'Ask the engine what an action would do against a tile without doing it: the tiles it would cover, the movement it would spend, what it would damage and whether anything would die, and whether it would hit nothing at all. Use it to answer "what if" without changing the board — an attack that hits nothing is still legal, so the answer may well be that it accomplishes nothing.',
      promptSnippet: 'Preview what an action would do, without doing it',
      parameters: Type.Object({
        action: Type.String({ description: 'move | attack' }),
        col: Type.Number(),
        row: Type.Number(),
      }),
      execute: async (_id, params): Promise<BenchToolResult> => {
        if (params.action !== 'move' && params.action !== 'attack') {
          const error = `Unknown action "${params.action}" — expected move or attack`
          return { content: text(error), details: { ok: false, error }, isError: true }
        }
        const result = bench.previewSelected(params.action as ActionId, { col: params.col, row: params.row })
        if (!result) {
          const error = `${params.action} cannot be aimed at (${params.col}, ${params.row}) by the selected unit`
          return { content: text(error), details: { ok: false, error }, isError: true }
        }
        return { content: text(result), details: { ok: true, preview: result } }
      },
    })

    pi.registerTool({
      name: 'dungeon_run_enemy_ai',
      label: 'Run Enemy AI',
      description:
        "Hand the enemy side to the game's own AI for one round, instead of driving it by hand — useful for comparing what the AI does with what you were about to do. NPCs walk toward power centers and attack PCs or structures in their scan band.",
      promptSnippet: "Let the game's AI take the enemy turn",
      parameters: Type.Object({}),
      execute: async () => outcome(bench, bench.runEnemyAi()),
    })

    pi.registerTool({
      name: 'dungeon_end_round',
      label: 'End Round',
      description: 'End the round: movement budgets refill and attacks become available again for every unit.',
      promptSnippet: 'End the round and refresh every unit',
      parameters: Type.Object({}),
      execute: async () => outcome(bench, bench.endRound()),
    })

    pi.registerTool({
      name: 'dungeon_undo',
      label: 'Step Back',
      description: 'Step back one action — moves, attacks, placements, board changes, definition changes, all of it.',
      promptSnippet: 'Step back one action on the bench',
      parameters: Type.Object({}),
      execute: async () => outcome(bench, bench.undo()),
    })

    pi.registerTool({
      name: 'dungeon_redo',
      label: 'Step Forward',
      description: 'Step forward again after stepping back. Acting after a step back discards the frames ahead, so this only works while nothing new has been done.',
      promptSnippet: 'Step forward one action on the bench',
      parameters: Type.Object({}),
      execute: async () => outcome(bench, bench.redo()),
    })

    pi.registerTool({
      name: 'dungeon_step_to',
      label: 'Scrub To',
      description:
        'Jump to any point in this session by frame index — 0 is where the bench started, and dungeon_board_state lists every frame with the action that produced it. Use it to take the designer back to the moment something interesting happened rather than describing it.',
      promptSnippet: 'Jump to a point earlier in the session',
      parameters: Type.Object({ index: Type.Number() }),
      execute: async (_id, params) => outcome(bench, bench.stepTo(params.index)),
    })

    // ─── Unit definitions ─────────────────────────────────────────────────────

    pi.registerTool({
      name: 'dungeon_tweak_unit_def',
      label: 'Tweak Unit Definition',
      description:
        "Change a unit type's numbers for this session only — max HP, movement range, attack damage, and min/max attack range. Nothing is persisted; this is for trying a value and immediately seeing what it does to reach and threat on the board. The engine clamps out-of-range values, and every overlay re-derives at once.",
      promptSnippet: "Change a unit type's numbers for this session",
      parameters: Type.Object({
        unit_type: unitTypeParam,
        max_hp: Type.Optional(Type.Number()),
        move_range: Type.Optional(Type.Number()),
        damage: Type.Optional(Type.Number()),
        min_range: Type.Optional(Type.Number()),
        max_range: Type.Optional(Type.Number()),
      }),
      execute: async (_id, params) => {
        const unitType = asUnitType(params.unit_type)
        if (!unitType) return { content: text(`Unknown unit type "${params.unit_type}"`), details: { ok: false }, isError: true }
        return outcome(bench, bench.tweakDef(unitType, {
          maxHp: params.max_hp,
          moveRange: params.move_range,
          damage: params.damage,
          minRange: params.min_range,
          maxRange: params.max_range,
        }))
      },
    })

    pi.registerTool({
      name: 'dungeon_reset_unit_defs',
      label: 'Reset Unit Definitions',
      description: "Discard every session tweak and go back to the game's shipped numbers.",
      promptSnippet: 'Reset unit definitions to the shipped values',
      parameters: Type.Object({}),
      execute: async () => outcome(bench, bench.resetDefs()),
    })

    // ─── Bookmarks ────────────────────────────────────────────────────────────

    pi.registerTool({
      name: 'dungeon_save_bookmark',
      label: 'Save Bookmark',
      description:
        'Save the board exactly as it stands — mid-turn is fine — under a name, so the designer can come back to it later. Bookmarks are interesting positions to poke at, not approved tests: making one is cheap and throwing one away is cheap. Saving under an existing name replaces it. Read the current list from dungeon_board_state.',
      promptSnippet: 'Save the current board under a name',
      parameters: Type.Object({ name: Type.String() }),
      execute: async (_id, params) => outcome(bench, bench.saveBookmark(params.name)),
    })

    pi.registerTool({
      name: 'dungeon_load_bookmark',
      label: 'Load Bookmark',
      description:
        'Jump to a saved board, replacing whatever is on the bench now — including the board, every unit, and any session tweaks that were in force when it was saved. The jump can be stepped back like any other action.',
      promptSnippet: 'Jump to a saved board',
      parameters: Type.Object({ name: Type.String() }),
      execute: async (_id, params) => outcome(bench, bench.loadBookmark(params.name)),
    })

    pi.registerTool({
      name: 'dungeon_delete_bookmark',
      label: 'Delete Bookmark',
      description: 'Delete a saved board permanently.',
      promptSnippet: 'Delete a saved board',
      parameters: Type.Object({ name: Type.String() }),
      execute: async (_id, params) => outcome(bench, bench.deleteBookmark(params.name)),
    })
  }
}
