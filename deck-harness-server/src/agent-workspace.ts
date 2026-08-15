// The pi AgentSession's cwd: sandbox root for its bash/write/edit tools (see
// permission-gate.ts's path jail) and where DefaultResourceLoader discovers
// .pi/skills/ and AGENTS.md from (see docs/sdk.md's "Directories" section).
//
// Seeded once from templates/agent-workspace/ (versioned in git) into
// data/workspace/ (gitignored, mutable at runtime) so the committed
// AGENTS.md/SKILL.md act as defaults without clobbering local edits to them
// on every restart.

import { existsSync, mkdirSync, cpSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function copyMissing(srcDir: string, destDir: string) {
  mkdirSync(destDir, { recursive: true })
  for (const entry of readdirSync(srcDir)) {
    const src = join(srcDir, entry)
    const dest = join(destDir, entry)
    if (statSync(src).isDirectory()) {
      copyMissing(src, dest)
    } else if (!existsSync(dest)) {
      cpSync(src, dest)
    }
  }
}

export function ensureAgentWorkspace(workspaceDir: string, templatesDir: string): string {
  copyMissing(templatesDir, workspaceDir)
  return workspaceDir
}
