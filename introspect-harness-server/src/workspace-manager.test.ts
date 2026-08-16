import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createSnapshot, initSnapshotRepo, restoreSnapshot, SandboxTracker } from './workspace-manager'

const execFileAsync = promisify(execFile)

async function listBlobHashes(gitDir: string, commitHash: string): Promise<Map<string, string>> {
  const { stdout } = await execFileAsync('git', ['--git-dir', gitDir, 'ls-tree', '-r', commitHash])
  const map = new Map<string, string>()
  for (const line of stdout.trim().split('\n').filter(Boolean)) {
    const [meta, path] = line.split('\t')
    const hash = meta.split(' ')[2]
    map.set(path, hash)
  }
  return map
}

describe('workspace-manager', () => {
  let root: string
  let sandbox: string
  let gitDir: string

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'workspace-manager-test-'))
    sandbox = join(root, 'sandbox')
    gitDir = join(root, 'snapshots.git')
    mkdirSync(sandbox, { recursive: true })
    await initSnapshotRepo(gitDir)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('does not duplicate an unchanged file across snapshots', async () => {
    writeFileSync(join(sandbox, 'a.txt'), 'same content')
    const snap1 = await createSnapshot(sandbox, gitDir)

    writeFileSync(join(sandbox, 'b.txt'), 'new file')
    const snap2 = await createSnapshot(sandbox, gitDir)

    const tree1 = await listBlobHashes(gitDir, snap1)
    const tree2 = await listBlobHashes(gitDir, snap2)
    expect(tree2.get('a.txt')).toBe(tree1.get('a.txt'))
    expect(tree2.get('b.txt')).toBeDefined()
  })

  it('restoring a snapshot removes files added after it', async () => {
    writeFileSync(join(sandbox, 'a.txt'), 'a')
    const snap1 = await createSnapshot(sandbox, gitDir)

    writeFileSync(join(sandbox, 'b.txt'), 'b')
    await createSnapshot(sandbox, gitDir)
    expect(existsSync(join(sandbox, 'b.txt'))).toBe(true)

    await restoreSnapshot(sandbox, gitDir, snap1)
    expect(existsSync(join(sandbox, 'a.txt'))).toBe(true)
    expect(existsSync(join(sandbox, 'b.txt'))).toBe(false)
    expect(readFileSync(join(sandbox, 'a.txt'), 'utf8')).toBe('a')
  })

  it('restoring after an unsnapshotted swap fully replaces prior contents, no leftovers', async () => {
    writeFileSync(join(sandbox, 'a.txt'), 'a')
    const snap1 = await createSnapshot(sandbox, gitDir)

    // Simulate live, uncaptured edits never committed to a snapshot.
    writeFileSync(join(sandbox, 'scratch.txt'), 'uncaptured live edit')
    mkdirSync(join(sandbox, 'sub'), { recursive: true })
    writeFileSync(join(sandbox, 'sub', 'nested.txt'), 'nested uncaptured')

    await restoreSnapshot(sandbox, gitDir, snap1)
    expect(existsSync(join(sandbox, 'scratch.txt'))).toBe(false)
    expect(existsSync(join(sandbox, 'sub'))).toBe(false)
    expect(existsSync(join(sandbox, 'a.txt'))).toBe(true)
  })

  it('preserves nested directories and subdirectory content', async () => {
    mkdirSync(join(sandbox, 'nested', 'deep'), { recursive: true })
    writeFileSync(join(sandbox, 'nested', 'deep', 'file.txt'), 'deep content')
    const snap = await createSnapshot(sandbox, gitDir)

    await restoreSnapshot(sandbox, gitDir, snap)
    expect(readFileSync(join(sandbox, 'nested', 'deep', 'file.txt'), 'utf8')).toBe('deep content')
  })
})

describe('SandboxTracker', () => {
  let root: string
  let sandbox: string
  let gitDir: string

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-tracker-test-'))
    sandbox = join(root, 'sandbox')
    gitDir = join(root, 'snapshots.git')
    mkdirSync(sandbox, { recursive: true })
    await initSnapshotRepo(gitDir)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('tracks ownership across a swap', async () => {
    writeFileSync(join(sandbox, 'a.txt'), 'a')
    const snap = await createSnapshot(sandbox, gitDir)

    const tracker = new SandboxTracker()
    expect(tracker.getOwner()).toBeUndefined()
    await tracker.swap(sandbox, gitDir, snap, { kind: 'recording', recordingId: 'rec-1', commitHash: snap })
    expect(tracker.getOwner()).toEqual({ kind: 'recording', recordingId: 'rec-1', commitHash: snap })
  })

  it('rejects a swap while a live turn is in flight', async () => {
    writeFileSync(join(sandbox, 'a.txt'), 'a')
    const snap = await createSnapshot(sandbox, gitDir)

    const tracker = new SandboxTracker()
    tracker.beginTurn()
    await expect(tracker.swap(sandbox, gitDir, snap, { kind: 'recording', recordingId: 'rec-1', commitHash: snap })).rejects.toThrow(
      /live turn/,
    )
    tracker.endTurn()
    await expect(tracker.swap(sandbox, gitDir, snap, { kind: 'recording', recordingId: 'rec-1', commitHash: snap })).resolves.toBeUndefined()
  })
})
