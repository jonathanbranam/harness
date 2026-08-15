import { describe, expect, it } from 'vitest'
import { editorStore } from './editor-state'

describe('editorStore', () => {
  it('setSelection drops unknown ids', () => {
    editorStore.setSelection(['title', 'does-not-exist'])
    expect(editorStore.getState().selection).toEqual(['title'])
  })

  it('applyUpdate setPosition updates x/y and reports changed ids', () => {
    const result = editorStore.applyUpdate('setPosition', ['title'], { x: 10, y: 20 })
    expect(result.changed).toEqual(['title'])
    expect(result.errors).toEqual([])
    const obj = editorStore.getState().objects.find((o) => o.id === 'title')
    expect(obj?.x).toBe(10)
    expect(obj?.y).toBe(20)
  })

  it('applyUpdate reports an error for unknown target ids instead of throwing', () => {
    const result = editorStore.applyUpdate('setText', ['does-not-exist'], { text: 'hi' })
    expect(result.changed).toEqual([])
    expect(result.errors).toEqual(['No object with id "does-not-exist"'])
  })

  it('applyGridLayout lays targets out left-to-right with the given gap', () => {
    const result = editorStore.applyUpdate('applyGridLayout', ['box-1', 'box-2'], { direction: 'horizontal', gap: 10 })
    expect(result.errors).toEqual([])
    const state = editorStore.getState()
    const box1 = state.objects.find((o) => o.id === 'box-1')!
    const box2 = state.objects.find((o) => o.id === 'box-2')!
    expect(box2.x).toBe(box1.x + box1.width + 10)
  })

  it('selectByText matches case-insensitively by default', () => {
    expect(editorStore.selectByText('deck')).toContain('title')
    expect(editorStore.selectByText('DECK')).toContain('title')
  })

  it('selectByText respects caseSensitive: true', () => {
    expect(editorStore.selectByText('DECK', true)).not.toContain('title')
  })
})
