import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/** Default seed applied to a new live session's sandbox. */
export const DEFAULT_SEED = 'openspec-skills'

/**
 * Resets `workspaceDir` to exactly the named seed's contents: clears the
 * directory (unlike `ensureAgentWorkspace`'s copy-missing merge) and copies
 * in `<seedsDir>/<seedName>/`. A seed with no matching directory resets the
 * workspace to empty rather than erroring, so an unconfigured seed name
 * degrades to "no starting files" instead of blocking session creation.
 */
export function resetWorkspaceToSeed(workspaceDir: string, seedsDir: string, seedName: string): void {
  rmSync(workspaceDir, { recursive: true, force: true })
  mkdirSync(workspaceDir, { recursive: true })
  const seedDir = join(seedsDir, seedName)
  if (existsSync(seedDir)) {
    cpSync(seedDir, workspaceDir, { recursive: true })
  }
}
