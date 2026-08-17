// In-memory board store: mirrors deck-harness-server/src/editor-state.ts's
// subscribe/emit shape, but instantiated per session rather than as a
// module-level singleton (design.md's "board-state.ts mirrors
// editor-state.ts's store/broadcast shape, but instantiated per session"
// decision) — each design session gets its own scratch board, with no
// undo/redo and no persistence (round one's board state isn't meant to
// survive a restart).
//
// The board holds no game-rule concepts (no archetypes, no movement/attack
// math) — it's a generic drawing surface: a flat array of BoardObjects
// (shape/line/overlay/label, discriminated by `kind`) plus a per-cell fill
// color, per design.md's "One discriminated-union BoardObject type" and
// "Cells hold fillColor instead of terrain" decisions.

import { randomUUID } from 'node:crypto'

export const BOARD_WIDTH = 16
export const BOARD_HEIGHT = 8

const DEFAULT_FILL_COLOR = '#e5e5e5'

export interface OpResult {
  ok: boolean
  error?: string
}

export interface DrawResult extends OpResult {
  id?: string
}

export interface Cell {
  col: number
  row: number
}

export interface Point {
  x: number
  y: number
}

export interface BoardCell {
  fillColor: string
}

export interface CircleShape {
  id: string
  kind: 'shape'
  shapeType: 'circle'
  position: Point
  radius: number
  color: string
  label?: string
}

export interface RectangleShape {
  id: string
  kind: 'shape'
  shapeType: 'rectangle'
  position: Point
  width: number
  height: number
  color: string
  label?: string
}

export type ShapeObject = CircleShape | RectangleShape

export interface LineObject {
  id: string
  kind: 'line'
  points: Point[]
  color: string
  style: 'solid' | 'dashed'
}

export interface OverlayObject {
  id: string
  kind: 'overlay'
  cells: Cell[]
  color: string
}

export interface LabelObject {
  id: string
  kind: 'label'
  position: Point
  text: string
  color: string
}

export type BoardObject = ShapeObject | LineObject | OverlayObject | LabelObject

export interface BoardState {
  width: number
  height: number
  cells: BoardCell[][]
  objects: BoardObject[]
}

/** dungeon_move_object's kind-appropriate payload (design.md's "not a generic JSON blob" decision) — `kind` must match the referenced object's own kind. */
export type MoveGeometry =
  | { kind: 'shape'; position: Point }
  | { kind: 'label'; position: Point }
  | { kind: 'line'; points: Point[] }
  | { kind: 'overlay'; cells: Cell[] }

export type DrawShapeParams =
  | { shapeType: 'circle'; position: Point; radius: number; color: string; label?: string }
  | { shapeType: 'rectangle'; position: Point; width: number; height: number; color: string; label?: string }

function inBounds(cell: Cell): boolean {
  return cell.col >= 0 && cell.col < BOARD_WIDTH && cell.row >= 0 && cell.row < BOARD_HEIGHT
}

function emptyCells(): BoardCell[][] {
  return Array.from({ length: BOARD_HEIGHT }, () => Array.from({ length: BOARD_WIDTH }, () => ({ fillColor: DEFAULT_FILL_COLOR })))
}

function cloneObject(object: BoardObject): BoardObject {
  switch (object.kind) {
    case 'shape':
      return { ...object, position: { ...object.position } }
    case 'line':
      return { ...object, points: object.points.map((p) => ({ ...p })) }
    case 'overlay':
      return { ...object, cells: object.cells.map((c) => ({ ...c })) }
    case 'label':
      return { ...object, position: { ...object.position } }
  }
}

export class BoardStore {
  private cells: BoardCell[][] = emptyCells()
  private objects: BoardObject[] = []
  private listeners = new Set<(state: BoardState) => void>()

  subscribe(listener: (state: BoardState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit() {
    const snapshot = this.getState()
    for (const listener of this.listeners) listener(snapshot)
  }

  getState(): BoardState {
    return {
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      cells: this.cells.map((row) => row.map((cell) => ({ ...cell }))),
      objects: this.objects.map(cloneObject),
    }
  }

  setCellFill(cell: Cell, color: string): OpResult {
    if (!inBounds(cell)) {
      return { ok: false, error: `Cell (${cell.col}, ${cell.row}) is out of bounds` }
    }
    this.cells[cell.row][cell.col] = { fillColor: color }
    this.emit()
    return { ok: true }
  }

  drawShape(params: DrawShapeParams): DrawResult {
    const id = randomUUID()
    const object: ShapeObject =
      params.shapeType === 'circle'
        ? { id, kind: 'shape', shapeType: 'circle', position: { ...params.position }, radius: params.radius, color: params.color, label: params.label }
        : {
            id,
            kind: 'shape',
            shapeType: 'rectangle',
            position: { ...params.position },
            width: params.width,
            height: params.height,
            color: params.color,
            label: params.label,
          }
    this.objects.push(object)
    this.emit()
    return { ok: true, id }
  }

  drawLine(points: Point[], color: string, style: 'solid' | 'dashed'): DrawResult {
    if (points.length < 2) {
      return { ok: false, error: `A line requires at least 2 points, got ${points.length}` }
    }
    const id = randomUUID()
    const object: LineObject = { id, kind: 'line', points: points.map((p) => ({ ...p })), color, style }
    this.objects.push(object)
    this.emit()
    return { ok: true, id }
  }

  drawOverlay(cells: Cell[], color: string): DrawResult {
    if (cells.length === 0) {
      return { ok: false, error: 'An overlay requires at least 1 cell' }
    }
    const badCell = cells.find((c) => !inBounds(c))
    if (badCell) {
      return { ok: false, error: `Cell (${badCell.col}, ${badCell.row}) is out of bounds` }
    }
    const id = randomUUID()
    const object: OverlayObject = { id, kind: 'overlay', cells: cells.map((c) => ({ ...c })), color }
    this.objects.push(object)
    this.emit()
    return { ok: true, id }
  }

  drawLabel(position: Point, text: string, color: string): DrawResult {
    const id = randomUUID()
    const object: LabelObject = { id, kind: 'label', position: { ...position }, text, color }
    this.objects.push(object)
    this.emit()
    return { ok: true, id }
  }

  moveObject(id: string, geometry: MoveGeometry): OpResult {
    const object = this.objects.find((o) => o.id === id)
    if (!object) {
      return { ok: false, error: `No drawn object with id "${id}"` }
    }

    switch (object.kind) {
      case 'shape': {
        if (geometry.kind !== 'shape') {
          return { ok: false, error: `Object "${id}" is a shape, not a ${geometry.kind}` }
        }
        object.position = { ...geometry.position }
        break
      }
      case 'label': {
        if (geometry.kind !== 'label') {
          return { ok: false, error: `Object "${id}" is a label, not a ${geometry.kind}` }
        }
        object.position = { ...geometry.position }
        break
      }
      case 'line': {
        if (geometry.kind !== 'line') {
          return { ok: false, error: `Object "${id}" is a line, not a ${geometry.kind}` }
        }
        if (geometry.points.length < 2) {
          return { ok: false, error: `A line requires at least 2 points, got ${geometry.points.length}` }
        }
        object.points = geometry.points.map((p) => ({ ...p }))
        break
      }
      case 'overlay': {
        if (geometry.kind !== 'overlay') {
          return { ok: false, error: `Object "${id}" is an overlay, not a ${geometry.kind}` }
        }
        if (geometry.cells.length === 0) {
          return { ok: false, error: 'An overlay requires at least 1 cell' }
        }
        const badCell = geometry.cells.find((c) => !inBounds(c))
        if (badCell) {
          return { ok: false, error: `Cell (${badCell.col}, ${badCell.row}) is out of bounds` }
        }
        object.cells = geometry.cells.map((c) => ({ ...c }))
        break
      }
    }

    this.emit()
    return { ok: true }
  }

  removeObject(id: string): OpResult {
    if (!this.objects.some((o) => o.id === id)) {
      return { ok: false, error: `No drawn object with id "${id}"` }
    }
    this.objects = this.objects.filter((o) => o.id !== id)
    this.emit()
    return { ok: true }
  }

  clearBoard(): OpResult {
    this.objects = []
    this.cells = emptyCells()
    this.emit()
    return { ok: true }
  }
}
