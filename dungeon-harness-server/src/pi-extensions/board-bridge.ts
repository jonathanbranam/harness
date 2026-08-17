// Registers the dungeon_* tools that let pi read and manipulate the live
// board — per docs/dungeon-harness/proposal.md's tool sketch. Unlike
// deck-harness-server's presentation-bridge.ts (which closes over a
// module-level editorStore singleton), this board is per-session (design.md's
// "instantiated per session" decision), so this is a per-session extension
// *factory* — session-store.ts calls createBoardBridgeExtension() with that
// session's own BoardStore, mirroring permission-gate.ts's factory pattern.

import type { ExtensionAPI, ExtensionFactory } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import { computeFootprint, resolveHits } from '../board-engine/attack'
import { findPath } from '../board-engine/movement'
import { ARCHETYPES } from '../board-engine/unit-catalog'
import type { Cell } from '../board-engine/types'
import type { BoardStore } from '../board-state'

const DIRECTIONS = ['up', 'down', 'left', 'right'] as const
const FACTIONS = ['pc', 'npc'] as const
const TERRAIN_TYPES = ['plains', 'forest', 'water', 'stone'] as const

export function createBoardBridgeExtension(opts: { board: BoardStore }): ExtensionFactory {
  const { board } = opts

  return function boardBridge(pi: ExtensionAPI) {
    pi.registerTool({
      name: 'dungeon_get_board_state',
      label: 'Get Board State',
      description:
        'Get the current board state: dimensions, every cell\'s terrain, and every placed unit (id, archetype, faction, position, and derived stats: maxHp, movement range, attack damage, targeting, and propagation). Call this before previewing movement/attacks or placing units so you are reasoning about the live board, not a stale copy.',
      promptSnippet: 'Read the live board: dimensions, terrain, and every placed unit with its derived stats',
      parameters: Type.Object({}),
      execute: async () => {
        const state = board.getState()
        return { content: [{ type: 'text' as const, text: JSON.stringify(state, null, 2) }], details: state }
      },
    })

    pi.registerTool({
      name: 'dungeon_place_unit',
      label: 'Place Unit',
      description: `Place a unit on the board from the fixed archetype catalog: ${ARCHETYPES.join(', ')} (melee/rogue/ranger/magic-user are player-controlled; short-range/long-range are NPC-controlled). Requires an in-bounds, unoccupied cell. Returns the new unit's server-assigned id.`,
      promptSnippet: 'Place a unit on the board at a given cell',
      parameters: Type.Object({
        archetype: Type.String({ description: `One of: ${ARCHETYPES.join(', ')}` }),
        faction: Type.Union(FACTIONS.map((f) => Type.Literal(f))),
        col: Type.Number(),
        row: Type.Number(),
      }),
      execute: async (_id, params) => {
        const result = board.placeUnit(params.archetype, params.faction, { col: params.col, row: params.row })
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: result, isError: !result.ok }
      },
    })

    pi.registerTool({
      name: 'dungeon_set_terrain',
      label: 'Set Terrain',
      description: `Set a cell's terrain, one of: ${TERRAIN_TYPES.join(', ')}. Terrain is for visual/scenario context only — it never affects movement or attack calculations.`,
      promptSnippet: "Set a cell's terrain",
      parameters: Type.Object({
        col: Type.Number(),
        row: Type.Number(),
        terrain: Type.Union(TERRAIN_TYPES.map((t) => Type.Literal(t))),
      }),
      execute: async (_id, params) => {
        const result = board.setTerrain({ col: params.col, row: params.row }, params.terrain)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: result, isError: !result.ok }
      },
    })

    pi.registerTool({
      name: 'dungeon_remove_unit',
      label: 'Remove Unit',
      description: 'Remove a placed unit from the board by id. Errors if no placed unit has that id.',
      promptSnippet: 'Remove a placed unit from the board by id',
      parameters: Type.Object({
        unitId: Type.String(),
      }),
      execute: async (_id, params) => {
        const result = board.removeUnit(params.unitId)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: result, isError: !result.ok }
      },
    })

    pi.registerTool({
      name: 'dungeon_move_unit',
      label: 'Move Unit',
      description:
        "Commit a placed unit's movement to a destination cell, using the same range-limited, occupancy-aware pathing dungeon_preview_movement computes. On success the unit's position is updated; on failure (out of range, blocked, or unknown unit id) the unit's position is left unchanged.",
      promptSnippet: "Move a placed unit to a destination cell, committing the move",
      parameters: Type.Object({
        unitId: Type.String(),
        col: Type.Number(),
        row: Type.Number(),
      }),
      execute: async (_id, params) => {
        const result = board.moveUnit(params.unitId, { col: params.col, row: params.row })
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: result, isError: !result.ok }
      },
    })

    pi.registerTool({
      name: 'dungeon_clear_board',
      label: 'Clear Board',
      description: 'Remove every placed unit and reset every cell\'s terrain to "plains", leaving the board in the same state as a fresh session.',
      promptSnippet: 'Clear the board: remove all units and reset all terrain to plains',
      parameters: Type.Object({}),
      execute: async () => {
        const result = board.clearBoard()
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: result, isError: !result.ok }
      },
    })

    pi.registerTool({
      name: 'dungeon_preview_movement',
      label: 'Preview Movement',
      description:
        "Preview a placed unit's shortest path to a destination cell, 4-directionally connected, treating other placed units' cells as impassable. Errors (rather than returning a path) if the destination is out of the unit's movement range, or every route within range is blocked by other units.",
      promptSnippet: "Preview a unit's movement path to a destination cell",
      parameters: Type.Object({
        unitId: Type.String(),
        col: Type.Number(),
        row: Type.Number(),
      }),
      execute: async (_id, params) => {
        const result = findPath(board.getState(), params.unitId, { col: params.col, row: params.row })
        const isError = !Array.isArray(result)
        const details = isError ? result : { path: result }
        return { content: [{ type: 'text' as const, text: JSON.stringify(details, null, 2) }], details, isError }
      },
    })

    pi.registerTool({
      name: 'dungeon_preview_attack',
      label: 'Preview Attack',
      description:
        "Preview a placed unit's attack in a cardinal direction: returns the candidate footprint (every cell the unit's propagation shape covers from its position, per its targeting range) and which of those cells are actually hit given current unit occupancy and the archetype's penetration rule. The full footprint is always returned even when only some of it is hit (e.g. a stop-at-first line attack still reports the whole line so you can judge range).",
      promptSnippet: "Preview a unit's attack footprint and hit cells in a cardinal direction",
      parameters: Type.Object({
        unitId: Type.String(),
        direction: Type.Union(DIRECTIONS.map((d) => Type.Literal(d))),
      }),
      execute: async (_id, params) => {
        const state = board.getState()
        const unit = state.units.find((u) => u.id === params.unitId)
        let details: { error?: string; footprint?: Cell[]; hits?: Cell[] }
        if (unit) {
          const footprint = computeFootprint(state, unit, params.direction)
          details = { footprint, hits: resolveHits(footprint, state, unit.unitDef.attack.propagation.penetration) }
        } else {
          details = { error: `No unit with id "${params.unitId}"` }
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(details, null, 2) }], details, isError: !unit }
      },
    })
  }
}
