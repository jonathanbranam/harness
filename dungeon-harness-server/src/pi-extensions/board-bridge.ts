// Registers the dungeon_* tools that let pi read and manipulate the live
// board — per docs/dungeon-harness/proposal.md's tool sketch. Unlike
// deck-harness-server's presentation-bridge.ts (which closes over a
// module-level editorStore singleton), this board is per-session (design.md's
// "instantiated per session" decision), so this is a per-session extension
// *factory* — session-store.ts calls createBoardBridgeExtension() with that
// session's own BoardStore, mirroring permission-gate.ts's factory pattern.
//
// The tools here are generic drawing primitives (shape/line/overlay/label/
// cell-fill, all id-based list/move/remove), not game-rule tools — the
// harness draws whatever the agent describes without computing movement
// range, pathing, or attack footprints. See proposal.md - Why.

import type { ExtensionAPI, ExtensionFactory } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import type { BoardStore } from '../board-state'

const point = Type.Object({ x: Type.Number(), y: Type.Number() })
const cell = Type.Object({ col: Type.Number(), row: Type.Number() })

export function createBoardBridgeExtension(opts: { board: BoardStore }): ExtensionFactory {
  const { board } = opts

  return function boardBridge(pi: ExtensionAPI) {
    pi.registerTool({
      name: 'dungeon_get_board_state',
      label: 'Get Board State',
      description:
        "Get the current board state: dimensions, every cell's fill color, and every drawn object (id, kind, geometry, color, label if applicable, and style if applicable). Call this before drawing/moving/removing so you are reasoning about the live board, not a stale copy.",
      promptSnippet: 'Read the live board: dimensions, cell fill colors, and every drawn object',
      parameters: Type.Object({}),
      execute: async () => {
        const state = board.getState()
        return { content: [{ type: 'text' as const, text: JSON.stringify(state, null, 2) }], details: state }
      },
    })

    pi.registerTool({
      name: 'dungeon_set_cell_fill',
      label: 'Set Cell Fill',
      description:
        "Set a cell's fill color to any caller-chosen color (e.g. a CSS color name or hex string). The harness does not interpret the color as terrain or attach any other meaning to it — one color per cell, latest call wins.",
      promptSnippet: "Set a cell's fill color",
      parameters: Type.Object({
        col: Type.Number(),
        row: Type.Number(),
        color: Type.String(),
      }),
      execute: async (_id, params) => {
        const result = board.setCellFill({ col: params.col, row: params.row }, params.color)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: result, isError: !result.ok }
      },
    })

    pi.registerTool({
      name: 'dungeon_draw_shape',
      label: 'Draw Shape',
      description:
        'Draw a labeled circle or rectangle at a position on the board (a caller-labeled visual marker — the harness attaches no game meaning, like unit type or faction, to it). Position is in continuous point coordinates where cell (col,row) spans (col,row)-(col+1,row+1), so a cell\'s center is (col+0.5, row+0.5). Returns the new object\'s server-assigned id.',
      promptSnippet: 'Draw a labeled circle or rectangle at a position',
      parameters: Type.Union([
        Type.Object({
          shapeType: Type.Literal('circle'),
          position: point,
          radius: Type.Number(),
          color: Type.String(),
          label: Type.Optional(Type.String()),
        }),
        Type.Object({
          shapeType: Type.Literal('rectangle'),
          position: point,
          width: Type.Number(),
          height: Type.Number(),
          color: Type.String(),
          label: Type.Optional(Type.String()),
        }),
      ]),
      execute: async (_id, params) => {
        const result = board.drawShape(params)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: result, isError: !result.ok }
      },
    })

    pi.registerTool({
      name: 'dungeon_draw_line',
      label: 'Draw Line',
      description:
        'Draw a solid or dashed line/path connecting two or more points, in order. Covers movement-path and connector annotations. Errors if fewer than two points are given.',
      promptSnippet: 'Draw a line or multi-point path through given points',
      parameters: Type.Object({
        points: Type.Array(point),
        color: Type.String(),
        style: Type.Union([Type.Literal('solid'), Type.Literal('dashed')]),
      }),
      execute: async (_id, params) => {
        const result = board.drawLine(params.points, params.color, params.style)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: result, isError: !result.ok }
      },
    })

    pi.registerTool({
      name: 'dungeon_draw_overlay',
      label: 'Draw Overlay',
      description:
        "Draw a semi-transparent color wash over one or more cells, rendered above each covered cell's fill color. Covers attack-footprint/movement-range/threat-range highlighting, or any other \"highlight this area\" need. Errors if any given cell is out of bounds.",
      promptSnippet: 'Draw a semi-transparent overlay over one or more cells',
      parameters: Type.Object({
        cells: Type.Array(cell),
        color: Type.String(),
      }),
      execute: async (_id, params) => {
        const result = board.drawOverlay(params.cells, params.color)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: result, isError: !result.ok }
      },
    })

    pi.registerTool({
      name: 'dungeon_draw_label',
      label: 'Draw Label',
      description: 'Draw a standalone text label at a position, independent of any shape.',
      promptSnippet: 'Draw a freestanding text label at a position',
      parameters: Type.Object({
        position: point,
        text: Type.String(),
        color: Type.String(),
      }),
      execute: async (_id, params) => {
        const result = board.drawLabel(params.position, params.text, params.color)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: result, isError: !result.ok }
      },
    })

    pi.registerTool({
      name: 'dungeon_move_object',
      label: 'Move Object',
      description:
        "Move a drawn object to new geometry appropriate to its kind (a position for a shape or label, an ordered point list for a line, a cell list for an overlay), leaving its color, label, and style unchanged. Errors if the id is unknown or the given geometry kind doesn't match the object's actual kind.",
      promptSnippet: "Move a drawn object to new geometry, by id",
      parameters: Type.Union([
        Type.Object({ id: Type.String(), kind: Type.Literal('shape'), position: point }),
        Type.Object({ id: Type.String(), kind: Type.Literal('label'), position: point }),
        Type.Object({ id: Type.String(), kind: Type.Literal('line'), points: Type.Array(point) }),
        Type.Object({ id: Type.String(), kind: Type.Literal('overlay'), cells: Type.Array(cell) }),
      ]),
      execute: async (_id, params) => {
        const { id, ...geometry } = params
        const result = board.moveObject(id, geometry)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: result, isError: !result.ok }
      },
    })

    pi.registerTool({
      name: 'dungeon_remove_object',
      label: 'Remove Object',
      description: 'Remove a drawn object from the board by id, regardless of kind (shape, line, overlay, or label). Errors if no drawn object has that id.',
      promptSnippet: 'Remove a drawn object from the board by id',
      parameters: Type.Object({
        id: Type.String(),
      }),
      execute: async (_id, params) => {
        const result = board.removeObject(params.id)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: result, isError: !result.ok }
      },
    })

    pi.registerTool({
      name: 'dungeon_clear_board',
      label: 'Clear Board',
      description: "Remove every drawn object and reset every cell's fill color to the default, leaving the board in the same state as a fresh session.",
      promptSnippet: 'Clear the board: remove all drawn objects and reset all cell fill colors',
      parameters: Type.Object({}),
      execute: async () => {
        const result = board.clearBoard()
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: result, isError: !result.ok }
      },
    })
  }
}
