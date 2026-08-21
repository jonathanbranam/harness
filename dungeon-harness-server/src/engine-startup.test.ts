import { getEngineMode } from '@repo/dungeon-engine'
import { describe, expect, it } from 'vitest'
import { startEngineInBenchMode } from './engine-startup'

describe('engine startup', () => {
  it('puts the engine in bench mode, matching what index.ts does at process start', () => {
    startEngineInBenchMode()
    expect(getEngineMode()).toBe('bench')
  })
})
