// Defense-in-depth for the built-in bash/write/edit/read tools.
// introspect-harness-server has no interactive approval channel (unlike
// deck-harness-server's permission-gate.ts, which this is modeled on), so
// there is no approval fallback for anything the checks below miss: a
// blocked call just fails immediately with a reason.
//
// Two layers:
//   1. Static blocklist for obviously destructive bash patterns.
//   2. Path jail: read/write/edit/bash may not touch anything outside the
//      session's workspace root. Unlike deck's gate, `read` is included
//      here too, since there's no approval backstop to fall back on.
//
// The bash confinement checks (cd/absolute-path/`..`-traversal) are
// pattern-based, not a kernel-level sandbox — see design.md's Risks section
// for the known bypass surface (string-built commands, env-var expansion,
// non-shell interpreters invoked via bash).

import type { ExtensionAPI, ExtensionFactory } from '@earendil-works/pi-coding-agent'
import { isToolCallEventType } from '@earendil-works/pi-coding-agent'
import { resolve } from 'node:path'

// Reused verbatim from deck-harness-server/src/pi-extensions/permission-gate.ts
// (duplicated rather than shared — see design.md's "New module, not a shared
// one" decision).
export const DANGEROUS_BASH =
  /\brm\s+-\w*(?:r\w*f\w*|f\w*r\w*)\s|\bmkfs(?:\.\w+)?\s|\bdd\s+if=|>\s*\/dev\/(?!null\b)|\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh)\b/i

function isOutsideJail(jail: string, resolved: string): boolean {
  return resolved !== jail && !resolved.startsWith(jail + '/')
}

function stripQuotes(token: string): string {
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
    return token.slice(1, -1)
  }
  return token
}

/** `cd <target>`, tolerating a quoted or bare argument. `cd -` (previous dir) is exempt. */
const CD_TARGET = /\bcd\s+(-|"[^"]*"|'[^']*'|\S+)/g

/** An absolute path, or a `..`-rooted relative path, as a standalone token. */
const PATH_TOKEN = /(?:^|[\s=:])((?:\.\.(?:\/[^\s'"]*)?)|(?:\/[^\s'"]*))/g

/** Exported for testing. Returns a violation reason, or undefined if the command stays confined to `jail`. */
export function checkBashConfinement(command: string, jail: string): string | undefined {
  for (const match of command.matchAll(CD_TARGET)) {
    const raw = stripQuotes(match[1])
    if (raw === '-') continue
    const resolved = resolve(jail, raw)
    if (isOutsideJail(jail, resolved)) {
      return `cd outside the workspace root: ${raw}`
    }
  }

  for (const match of command.matchAll(PATH_TOKEN)) {
    const raw = stripQuotes(match[1])
    const resolved = resolve(jail, raw)
    if (isOutsideJail(jail, resolved)) {
      return `path outside the workspace root: ${raw}`
    }
  }

  return undefined
}

/** Exported for testing. Returns a violation reason, or undefined if `path` stays inside `jail`. */
export function checkPathJail(path: string, jail: string): string | undefined {
  const resolved = resolve(jail, path)
  if (isOutsideJail(jail, resolved)) {
    return `path outside the workspace root: ${path}`
  }
  return undefined
}

const JAILED_TOOLS = new Set(['read', 'write', 'edit'])

export function createPermissionGateExtension(opts: { cwd: string }): ExtensionFactory {
  const jail = resolve(opts.cwd)

  return function permissionGate(pi: ExtensionAPI) {
    pi.on('tool_call', (event) => {
      if (event.toolName === 'bash' && isToolCallEventType('bash', event)) {
        if (DANGEROUS_BASH.test(event.input.command)) {
          return { block: true, reason: 'Blocked by static policy: command matches a known-dangerous pattern.', terminate: true }
        }
        const violation = checkBashConfinement(event.input.command, jail)
        if (violation) {
          return { block: true, reason: `Blocked: ${violation}` }
        }
        return
      }

      if (JAILED_TOOLS.has(event.toolName)) {
        const path = (event.input as { path?: unknown }).path
        if (typeof path === 'string') {
          const violation = checkPathJail(path, jail)
          if (violation) {
            return { block: true, reason: `Blocked: ${violation}` }
          }
        }
      }
    })
  }
}
