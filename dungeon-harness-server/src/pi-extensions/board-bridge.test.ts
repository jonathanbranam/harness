import { describe, expect, it } from 'vitest'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { BoardStore } from '../board-state'
import { createBoardBridgeExtension } from './board-bridge'

type Execute = (id: string, params: Record<string, unknown>) => Promise<{ content: unknown; details: unknown; isError?: boolean }>

/** Minimal fake ExtensionAPI: captures registered tools by name so tests can call their execute() directly, without spinning up a real AgentSession. */
function registerTools(board: BoardStore): Map<string, Execute> {
  const tools = new Map<string, Execute>()
  const fakePi = {
    on: () => {},
    registerTool: (tool: { name: string; execute: Execute }) => tools.set(tool.name, tool.execute),
  } as unknown as ExtensionAPI
  createBoardBridgeExtension({ board })(fakePi)
  return tools
}

describe('board-bridge tools', () => {
  it('dungeon_get_board_state reflects prior mutations', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    board.placeUnit('melee', 'pc', { col: 0, row: 0 })
    const result = await tools.get('dungeon_get_board_state')!('1', {})
    expect((result.details as { units: unknown[] }).units).toHaveLength(1)
  })

  it('dungeon_place_unit succeeds for a known archetype and in-bounds/unoccupied cell', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    const result = await tools.get('dungeon_place_unit')!('1', { archetype: 'ranger', faction: 'pc', col: 2, row: 2 })
    expect(result.isError).toBeFalsy()
    expect((result.details as { unitId: string }).unitId).toBeTruthy()
  })

  it('dungeon_place_unit errors on an occupied cell', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    board.placeUnit('melee', 'pc', { col: 0, row: 0 })
    const result = await tools.get('dungeon_place_unit')!('1', { archetype: 'rogue', faction: 'pc', col: 0, row: 0 })
    expect(result.isError).toBe(true)
    expect((result.details as { error: string }).error).toMatch(/occupied/)
  })

  it('dungeon_place_unit errors on an unknown archetype', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    const result = await tools.get('dungeon_place_unit')!('1', { archetype: 'wizard', faction: 'pc', col: 0, row: 0 })
    expect(result.isError).toBe(true)
    expect((result.details as { error: string }).error).toMatch(/Unknown archetype/)
  })

  it('dungeon_set_terrain succeeds for an in-bounds cell', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    const result = await tools.get('dungeon_set_terrain')!('1', { col: 3, row: 3, terrain: 'water' })
    expect(result.isError).toBeFalsy()
    expect(board.getState().cells[3][3].terrain).toBe('water')
  })

  it('dungeon_set_terrain errors on an out-of-bounds cell', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    const result = await tools.get('dungeon_set_terrain')!('1', { col: 99, row: 0, terrain: 'water' })
    expect(result.isError).toBe(true)
    expect((result.details as { error: string }).error).toMatch(/out of bounds/)
  })

  it('dungeon_preview_movement returns a path for a reachable destination', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    const { unitId } = board.placeUnit('melee', 'pc', { col: 0, row: 0 })
    const result = await tools.get('dungeon_preview_movement')!('1', { unitId, col: 2, row: 0 })
    expect(result.isError).toBeFalsy()
    expect((result.details as { path: unknown[] }).path).toHaveLength(3)
  })

  it('dungeon_preview_movement errors for an out-of-range destination', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    const { unitId } = board.placeUnit('melee', 'pc', { col: 0, row: 0 })
    const result = await tools.get('dungeon_preview_movement')!('1', { unitId, col: 10, row: 0 })
    expect(result.isError).toBe(true)
    expect((result.details as { error: string }).error).toMatch(/out of range/)
  })

  it('dungeon_preview_movement errors for an unknown unit id', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    const result = await tools.get('dungeon_preview_movement')!('1', { unitId: 'does-not-exist', col: 1, row: 1 })
    expect(result.isError).toBe(true)
    expect((result.details as { error: string }).error).toMatch(/No unit/)
  })

  it('dungeon_preview_attack returns footprint and hits for a known unit', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    const { unitId } = board.placeUnit('melee', 'pc', { col: 0, row: 0 })
    board.placeUnit('rogue', 'npc', { col: 1, row: 0 })
    const result = await tools.get('dungeon_preview_attack')!('1', { unitId, direction: 'right' })
    expect(result.isError).toBeFalsy()
    const details = result.details as { footprint: unknown[]; hits: unknown[] }
    expect(details.footprint).toEqual([{ col: 1, row: 0 }])
    expect(details.hits).toEqual([{ col: 1, row: 0 }])
  })

  it('dungeon_preview_attack errors for an unknown unit id', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    const result = await tools.get('dungeon_preview_attack')!('1', { unitId: 'does-not-exist', direction: 'up' })
    expect(result.isError).toBe(true)
    expect((result.details as { error: string }).error).toMatch(/No unit/)
  })
})
