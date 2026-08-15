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
