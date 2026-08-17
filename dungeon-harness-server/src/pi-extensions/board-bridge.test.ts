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
    board.drawLabel({ x: 0, y: 0 }, 'label', 'red')
    const result = await tools.get('dungeon_get_board_state')!('1', {})
    expect((result.details as { objects: unknown[] }).objects).toHaveLength(1)
  })

  it('dungeon_set_cell_fill succeeds for an in-bounds cell', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    const result = await tools.get('dungeon_set_cell_fill')!('1', { col: 3, row: 3, color: '#ff0000' })
    expect(result.isError).toBeFalsy()
    expect(board.getState().cells[3][3].fillColor).toBe('#ff0000')
  })

  it('dungeon_set_cell_fill errors on an out-of-bounds cell', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    const result = await tools.get('dungeon_set_cell_fill')!('1', { col: 99, row: 0, color: '#ff0000' })
    expect(result.isError).toBe(true)
    expect((result.details as { error: string }).error).toMatch(/out of bounds/)
  })

  it('dungeon_draw_shape adds a labeled circle', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    const result = await tools.get('dungeon_draw_shape')!('1', {
      shapeType: 'circle',
      position: { x: 2.5, y: 3.5 },
      radius: 0.4,
      color: 'blue',
      label: 'SR',
    })
    expect(result.isError).toBeFalsy()
    expect((result.details as { id: string }).id).toBeTruthy()
    expect(board.getState().objects[0]).toMatchObject({ kind: 'shape', shapeType: 'circle', label: 'SR' })
  })

  it('dungeon_draw_line adds a dashed line and errors with fewer than two points', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    const ok = await tools.get('dungeon_draw_line')!('1', {
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      color: 'green',
      style: 'dashed',
    })
    expect(ok.isError).toBeFalsy()
    expect(board.getState().objects[0]).toMatchObject({ kind: 'line', style: 'dashed' })

    const err = await tools.get('dungeon_draw_line')!('1', { points: [{ x: 0, y: 0 }], color: 'green', style: 'solid' })
    expect(err.isError).toBe(true)
  })

  it('dungeon_draw_overlay adds a colored overlay and errors on out-of-bounds cells', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    const ok = await tools.get('dungeon_draw_overlay')!('1', { cells: [{ col: 0, row: 0 }, { col: 1, row: 0 }], color: 'red' })
    expect(ok.isError).toBeFalsy()
    expect(board.getState().objects[0]).toMatchObject({ kind: 'overlay', color: 'red' })

    const err = await tools.get('dungeon_draw_overlay')!('1', { cells: [{ col: 999, row: 0 }], color: 'red' })
    expect(err.isError).toBe(true)
    expect((err.details as { error: string }).error).toMatch(/out of bounds/)
  })

  it('dungeon_draw_label adds a standalone text label', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    const result = await tools.get('dungeon_draw_label')!('1', { position: { x: 4, y: 4 }, text: 'Threat zone', color: 'orange' })
    expect(result.isError).toBeFalsy()
    expect(board.getState().objects[0]).toMatchObject({ kind: 'label', text: 'Threat zone' })
  })

  it('dungeon_move_object moves a shape and leaves color/label unchanged', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    const { id } = board.drawShape({ shapeType: 'circle', position: { x: 0, y: 0 }, radius: 0.5, color: 'blue', label: 'SR' })
    const result = await tools.get('dungeon_move_object')!('1', { id, kind: 'shape', position: { x: 3, y: 3 } })
    expect(result.isError).toBeFalsy()
    expect(board.getState().objects[0]).toMatchObject({ position: { x: 3, y: 3 }, color: 'blue', label: 'SR' })
  })

  it('dungeon_move_object errors for an unknown object id', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    const result = await tools.get('dungeon_move_object')!('1', { id: 'does-not-exist', kind: 'shape', position: { x: 0, y: 0 } })
    expect(result.isError).toBe(true)
    expect((result.details as { error: string }).error).toMatch(/No drawn object/)
  })

  it('dungeon_remove_object removes a drawn object of any kind', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    const { id } = board.drawLabel({ x: 0, y: 0 }, 'label', 'red')
    const result = await tools.get('dungeon_remove_object')!('1', { id })
    expect(result.isError).toBeFalsy()
    expect(board.getState().objects).toHaveLength(0)
  })

  it('dungeon_remove_object errors for an unknown object id', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    const result = await tools.get('dungeon_remove_object')!('1', { id: 'does-not-exist' })
    expect(result.isError).toBe(true)
    expect((result.details as { error: string }).error).toMatch(/No drawn object/)
  })

  it('dungeon_clear_board removes all objects and resets cell fill colors', async () => {
    const board = new BoardStore()
    const tools = registerTools(board)
    board.drawLabel({ x: 0, y: 0 }, 'label', 'red')
    board.setCellFill({ col: 3, row: 3 }, '#ff0000')
    const defaultColor = new BoardStore().getState().cells[0][0].fillColor
    const result = await tools.get('dungeon_clear_board')!('1', {})
    expect(result.isError).toBeFalsy()
    const state = board.getState()
    expect(state.objects).toEqual([])
    expect(state.cells.every((row) => row.every((cell) => cell.fillColor === defaultColor))).toBe(true)
  })
})
