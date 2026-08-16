// Snapshot storage for the sandbox workspace: a bare git repository per
// recording, driven via the `git` CLI using plumbing commands
// (hash-object/mktree/commit-tree/archive) rather than porcelain, so a
// snapshot can be built by reading the sandbox's files directly with no
// persistent index or working tree. See design.md's "Snapshot storage is a
// bare git repository per recording" decision.

import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readlinkSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Branch ref each recording's bare repo tracks, purely for `git log`/`git show` inspectability. */
const SNAPSHOT_REF = 'refs/heads/snapshots'

const GIT_IDENTITY_ENV = {
  GIT_AUTHOR_NAME: 'introspect-harness',
  GIT_AUTHOR_EMAIL: 'introspect-harness@localhost',
  GIT_COMMITTER_NAME: 'introspect-harness',
  GIT_COMMITTER_EMAIL: 'introspect-harness@localhost',
}

async function git(gitDir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['--git-dir', gitDir, ...args], {
    env: { ...process.env, ...GIT_IDENTITY_ENV },
    maxBuffer: 64 * 1024 * 1024,
  })
  return stdout
}

/**
 * Runs `git` with data piped to its stdin. `execFile`'s async form has no
 * `input` option (that's execFileSync/spawnSync-only), so commands like
 * `mktree` and `hash-object --stdin` need a real spawned child whose stdin
 * we write to and close.
 */
function gitWithStdin(gitDir: string, args: string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['--git-dir', gitDir, ...args], { env: { ...process.env, ...GIT_IDENTITY_ENV } })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += String(d)))
    child.stderr.on('data', (d) => (stderr += String(d)))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`git ${args.join(' ')} exited ${code}: ${stderr}`))
    })
    child.stdin.end(input)
  })
}

interface TreeEntry {
  /** Sort key: the entry's name, with a trailing "/" for directories — matches git's canonical tree ordering. */
  sortKey: string
  line: string
}

/** Recursively hashes `dirPath`'s contents into blob/tree objects and returns the root tree's hash. */
async function buildTree(dirPath: string, gitDir: string): Promise<string> {
  const entries: TreeEntry[] = []
  for (const dirent of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, dirent.name)
    if (dirent.isDirectory()) {
      const subtreeHash = await buildTree(fullPath, gitDir)
      entries.push({ sortKey: `${dirent.name}/`, line: `040000 tree ${subtreeHash}\t${dirent.name}` })
    } else if (dirent.isSymbolicLink()) {
      const target = readlinkSync(fullPath)
      const blobHash = (await gitWithStdin(gitDir, ['hash-object', '-w', '--stdin'], target)).trim()
      entries.push({ sortKey: dirent.name, line: `120000 blob ${blobHash}\t${dirent.name}` })
    } else if (dirent.isFile()) {
      const mode = statSync(fullPath).mode & 0o111 ? '100755' : '100644'
      const blobHash = (await git(gitDir, ['hash-object', '-w', fullPath])).trim()
      entries.push({ sortKey: dirent.name, line: `${mode} blob ${blobHash}\t${dirent.name}` })
    }
  }
  entries.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))
  const stdin = entries.map((e) => e.line).join('\n')
  const stdout = await gitWithStdin(gitDir, ['mktree'], stdin)
  return stdout.trim()
}

/** Creates a bare repo at `gitDir` for a new recording's snapshots, if one doesn't already exist. */
export async function initSnapshotRepo(gitDir: string): Promise<void> {
  if (existsSync(join(gitDir, 'HEAD'))) return
  mkdirSync(gitDir, { recursive: true })
  await execFileAsync('git', ['init', '--quiet', '--bare', gitDir])
}

/**
 * Hashes and commits `sandboxPath`'s current files into the bare repo at
 * `gitDir`, returning the new commit's hash. Unchanged files across
 * snapshots reuse the same content-addressed blob automatically — git's
 * object store dedupes by content hash regardless of commit history.
 */
export async function createSnapshot(sandboxPath: string, gitDir: string): Promise<string> {
  const treeHash = await buildTree(sandboxPath, gitDir)
  let parent: string | undefined
  try {
    parent = (await git(gitDir, ['rev-parse', '--verify', SNAPSHOT_REF])).trim()
  } catch {
    parent = undefined
  }
  const args = ['commit-tree', treeHash, '-m', 'snapshot']
  if (parent) args.push('-p', parent)
  const commitHash = (await git(gitDir, args)).trim()
  await git(gitDir, ['update-ref', SNAPSHOT_REF, commitHash])
  return commitHash
}

/**
 * Fully replaces `sandboxPath`'s contents with `commitHash`'s tree: clears
 * the directory, then extracts the commit via `git archive | tar -x`. No
 * incremental diff-apply — see design.md's determinism rationale.
 */
export async function restoreSnapshot(sandboxPath: string, gitDir: string, commitHash: string): Promise<void> {
  rmSync(sandboxPath, { recursive: true, force: true })
  mkdirSync(sandboxPath, { recursive: true })
  await new Promise<void>((resolve, reject) => {
    const gitArchive = spawn('git', ['--git-dir', gitDir, 'archive', commitHash])
    const tar = spawn('tar', ['-x', '-C', sandboxPath])
    let stderr = ''
    gitArchive.stdout.pipe(tar.stdin)
    gitArchive.stderr.on('data', (d) => (stderr += String(d)))
    tar.stderr.on('data', (d) => (stderr += String(d)))
    gitArchive.on('error', reject)
    tar.on('error', reject)
    gitArchive.on('close', (code) => {
      if (code !== 0) reject(new Error(`git archive exited ${code}: ${stderr}`))
    })
    tar.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tar exited ${code}: ${stderr}`))
    })
  })
}

/** Identifies what currently "owns" the sandbox's checked-out contents. */
export type SandboxOwner =
  | { kind: 'live'; sessionId: string }
  | { kind: 'recording'; recordingId: string; commitHash: string }
  | undefined

/**
 * Tracks which recording+commit (or live session) currently owns the one
 * shared sandbox's contents, and serializes swaps against in-flight live
 * turns. Phase 2 has exactly one sandbox (see design.md's "one hardcoded
 * sandbox path" constraint), so this is a single tracker, not a per-path map.
 */
export class SandboxTracker {
  private owner: SandboxOwner
  private turnInFlight = false

  getOwner(): SandboxOwner {
    return this.owner
  }

  setOwner(owner: SandboxOwner): void {
    this.owner = owner
  }

  isTurnInFlight(): boolean {
    return this.turnInFlight
  }

  beginTurn(): void {
    this.turnInFlight = true
  }

  endTurn(): void {
    this.turnInFlight = false
  }

  /** Restores `commitHash` into the sandbox and updates ownership. Throws if a live turn is currently in flight. */
  async swap(sandboxPath: string, gitDir: string, commitHash: string, owner: SandboxOwner): Promise<void> {
    if (this.turnInFlight) {
      throw new Error('Cannot swap sandbox contents while a live turn is in flight')
    }
    await restoreSnapshot(sandboxPath, gitDir, commitHash)
    this.owner = owner
  }
}

/** Single tracker for the one sandbox this phase supports. */
export const sandboxTracker = new SandboxTracker()
