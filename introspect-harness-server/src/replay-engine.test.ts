import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRecordingWriter } from './recording-writer'
import { createReplayEngine } from './replay-engine'
import { sandboxTracker } from './workspace-manager'

describe('replay-engine', () => {
  let root: string
  let recordingsDir: string
  let sandbox: string
  let recordingId: string

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'replay-engine-test-'))
    recordingsDir = join(root, 'recordings')
    sandbox = join(root, 'sandbox')
    mkdirSync(sandbox, { recursive: true })
    sandboxTracker.setOwner(undefined)

    // Build a small recording directly via recording-writer, standing in for
    // what introspection-bridge would produce during a live session.
    const writer = createRecordingWriter(recordingsDir)
    recordingId = 'rec-test'
    writeFileSync(join(sandbox, 'a.txt'), 'seed content')
    await writer.start(recordingId, 'Test recording')
    await writer.snapshot(sandbox) // checkpoint 0: seed state

    writer.appendEvent({ type: 'session_start', reason: 'new' })
    writer.appendEvent({ type: 'message_start', message: { role: 'user' } })

    writeFileSync(join(sandbox, 'a.txt'), 'turn 1 content')
    writeFileSync(join(sandbox, 'b.txt'), 'new file from turn 1')
    writer.appendEvent({ type: 'agent_settled' })
    await writer.snapshot(sandbox) // checkpoint after first turn

    writer.appendEvent({ type: 'message_start', message: { role: 'user', text: 'turn 2' } })
    await writer.stop()
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    sandboxTracker.setOwner(undefined)
  })

  it('filters recording-internal events from the emitted sequence', async () => {
    const engine = createReplayEngine(recordingsDir)
    const header = await engine.load(recordingId)
    expect(header.checkpoints).toHaveLength(2)

    const lastIndex = engine.getTotalEvents() - 1
    const { events } = await engine.stepTo(lastIndex, sandbox)
    expect(events.every((e) => e.type !== 'recording_start' && e.type !== 'fs_snapshot')).toBe(true)
    expect(events.map((e) => e.type)).toEqual(['session_start', 'message_start', 'agent_settled', 'message_start'])
  })

  it('restores sandbox state at a checkpoint boundary', async () => {
    const engine = createReplayEngine(recordingsDir)
    await engine.load(recordingId)

    // Jump to the first checkpoint (before turn 1's file changes).
    await engine.jumpToCheckpoint(0, sandbox)
    expect(readFileSync(join(sandbox, 'a.txt'), 'utf8')).toBe('seed content')

    // Step past the second checkpoint: turn 1's file changes should now be visible.
    const lastIndex = engine.getTotalEvents() - 1
    await engine.stepTo(lastIndex, sandbox)
    expect(readFileSync(join(sandbox, 'a.txt'), 'utf8')).toBe('turn 1 content')
    expect(readFileSync(join(sandbox, 'b.txt'), 'utf8')).toBe('new file from turn 1')
  })

  it('replaying the same recording to the same position twice is deterministic', async () => {
    const engineA = createReplayEngine(recordingsDir)
    await engineA.load(recordingId)
    const lastIndex = engineA.getTotalEvents() - 1
    const resultA = await engineA.stepTo(lastIndex, sandbox)
    const fileStateA = readFileSync(join(sandbox, 'a.txt'), 'utf8')

    // Perturb the sandbox in between, simulating unrelated live edits.
    writeFileSync(join(sandbox, 'unrelated.txt'), 'should be wiped')

    const engineB = createReplayEngine(recordingsDir)
    await engineB.load(recordingId)
    const resultB = await engineB.stepTo(lastIndex, sandbox)
    const fileStateB = readFileSync(join(sandbox, 'a.txt'), 'utf8')

    expect(resultB.events).toEqual(resultA.events)
    expect(fileStateB).toBe(fileStateA)
  })

  it('jumpToCheckpoint restores the checkpoint and returns events up to it', async () => {
    const engine = createReplayEngine(recordingsDir)
    await engine.load(recordingId)

    const { index, events } = await engine.jumpToCheckpoint(0, sandbox)
    expect(index).toBe(1) // checkpoint 0 sits at event index 1 (index 0 is the recording_start marker)
    expect(events.map((e) => e.type)).toEqual([])
    expect(readFileSync(join(sandbox, 'a.txt'), 'utf8')).toBe('seed content')
  })

  it('rejects a swap while a live turn is marked in flight', async () => {
    const engine = createReplayEngine(recordingsDir)
    await engine.load(recordingId)
    sandboxTracker.beginTurn()
    await expect(engine.jumpToCheckpoint(0, sandbox)).rejects.toThrow(/live turn/)
    sandboxTracker.endTurn()
  })
})
