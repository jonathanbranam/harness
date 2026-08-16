// Defense-in-depth for the built-in bash/write/edit/read/ls/find/grep tools.
// introspect-harness-server has no interactive approval channel (unlike
// deck-harness-server's permission-gate.ts, which this is modeled on), so
// there is no approval fallback for anything the checks below miss: a
// blocked call just fails immediately with a reason.
//
// Layers:
//   1. Static blocklist for obviously destructive bash patterns, plus a
//      blanket ban on link creation (`ln`, `cp -s`) — see below.
//   2. Path jail: read/write/edit/ls/find/grep/bash may not touch anything
//      outside the session's workspace root. Unlike deck's gate, `read`
//      (and the other read-only tools) are included here too, since
//      there's no approval backstop to fall back on.
//   3. A system-prompt addendum (before_agent_start) telling the agent up
//      front that everything outside the workspace is off-limits, so it
//      doesn't burn turns probing for the boundary.
//
// The bash confinement checks (cd/absolute-path/`..`-traversal/`~`) are
// pattern-based, not a kernel-level sandbox — see design.md's Risks section
// for the known bypass surface (string-built commands, env-var expansion,
// non-shell interpreters invoked via bash). The path-jail checks (used by
// the non-bash tools, and as defense-in-depth for bash path tokens) resolve
// symlinks via realpath, so a *pre-existing* symlink pointing outside the
// workspace is blocked. But that check runs pre-execution, so it can't see
// a symlink a command is about to create — `ln -s /etc /workspace/x && cat
// /workspace/x/passwd` would plant the symlink and read through it inside
// one call before anything exists to resolve. Rather than try to detect
// "the target argument of `ln -s` resolves outside the jail" (fragile: many
// flag orderings, `cp -s`/`--symbolic-link` is an equivalent primitive,
// relative targets, etc.), link creation is disallowed outright — there's
// no legitimate need for this agent to create links in its workspace.

import type { ExtensionAPI, ExtensionFactory } from '@earendil-works/pi-coding-agent'
import { isToolCallEventType } from '@earendil-works/pi-coding-agent'
import { basename, dirname, resolve } from 'node:path'
import { realpathSync } from 'node:fs'

// Reused verbatim from deck-harness-server/src/pi-extensions/permission-gate.ts
// (duplicated rather than shared — see design.md's "New module, not a shared
// one" decision).
export const DANGEROUS_BASH =
  /\brm\s+-\w*(?:r\w*f\w*|f\w*r\w*)\s|\bmkfs(?:\.\w+)?\s|\bdd\s+if=|>\s*\/dev\/(?!null\b)|\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh)\b/i

/**
 * Blocks link creation outright: `ln` (any flags — hard or symbolic), or `cp`
 * with a symlink-creating flag (`-s`/`--symbolic-link`, GNU coreutils). See
 * the module comment for why this is a blanket ban rather than a
 * target-resolves-outside-jail check. Token-based (not a substring regex) so
 * it doesn't false-positive on unrelated flags that merely contain the
 * letter `s` (e.g. `cp -S .bak`, `cp --sparse=always`).
 */
export function checkLinkCreation(command: string): string | undefined {
  const tokens = command.split(/\s+/)
  if (tokens.some((token) => token === 'ln' || token.endsWith('/ln'))) {
    return 'creating links (ln) is not allowed in this workspace'
  }
  const hasCp = tokens.some((token) => token === 'cp' || token.endsWith('/cp'))
  if (hasCp) {
    const hasSymlinkFlag = tokens.some(
      (token) => token === '--symbolic-link' || (token.startsWith('-') && !token.startsWith('--') && token.includes('s')),
    )
    if (hasSymlinkFlag) {
      return 'creating a symlink via cp is not allowed in this workspace'
    }
  }
  return undefined
}

function isOutsideJail(jail: string, resolved: string): boolean {
  return resolved !== jail && !resolved.startsWith(jail + '/')
}

/**
 * Resolve symlinks in `target`, tolerating path segments that don't exist yet
 * (e.g. a `write` target that hasn't been created). Walks up to the nearest
 * existing ancestor, resolves *that*, and reattaches the non-existent tail —
 * so a symlinked directory inside the workspace that points outside it is
 * still caught even for a file that doesn't exist yet.
 */
function canonicalize(target: string): string {
  let current = target
  let tail = ''
  while (true) {
    try {
      const real = realpathSync(current)
      return tail ? resolve(real, tail) : real
    } catch {
      const parent = dirname(current)
      if (parent === current) return target // reached filesystem root; give up, use the lexical path
      tail = tail ? `${basename(current)}/${tail}` : basename(current)
      current = parent
    }
  }
}

/**
 * True if `raw` escapes every root in `roots`. A relative `raw` is resolved
 * against `roots[0]` (the process's actual cwd — the same base the real
 * tool implementations use), matching how a relative tool-call path is
 * actually interpreted; an absolute `raw` resolves the same regardless of
 * base. The resolved path then has to fall lexically inside at least one
 * root — and, after following symlinks, inside at least one root's
 * canonical form — or it counts as an escape.
 */
function escapesAllRoots(raw: string, roots: string[]): boolean {
  const resolved = resolve(roots[0], raw)
  const insideLexically = roots.some((root) => !isOutsideJail(root, resolved))
  if (!insideLexically) return true
  const canonicalResolved = canonicalize(resolved)
  const insideCanonically = roots.some((root) => !isOutsideJail(canonicalize(root), canonicalResolved))
  return !insideCanonically
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

/** `~`, `~user`, `~/rest`, or `~user/rest` — shell home-directory expansion. */
const HOME_TOKEN = /(?:^|[\s=:])(~[a-zA-Z0-9_-]*(?:\/[^\s'"]*)?)/g

/** Exported for testing. Returns a violation reason, or undefined if the command stays confined to `roots`. */
export function checkBashConfinement(command: string, roots: string[]): string | undefined {
  for (const match of command.matchAll(CD_TARGET)) {
    const raw = stripQuotes(match[1])
    if (raw === '-') continue
    if (escapesAllRoots(raw, roots)) {
      return `cd outside the workspace root: ${raw}`
    }
  }

  for (const match of command.matchAll(HOME_TOKEN)) {
    return `references the home directory, which is outside the workspace root: ${stripQuotes(match[1])}`
  }

  for (const match of command.matchAll(PATH_TOKEN)) {
    const raw = stripQuotes(match[1])
    if (escapesAllRoots(raw, roots)) {
      return `path outside the workspace root: ${raw}`
    }
  }

  return undefined
}

/** Exported for testing. Returns a violation reason, or undefined if `path` stays inside one of `roots`. */
export function checkPathJail(path: string, roots: string[]): string | undefined {
  if (escapesAllRoots(path, roots)) {
    return `path outside the workspace root: ${path}`
  }
  return undefined
}

/** Built-in tools that take a `path` argument and must stay confined to the workspace. */
const JAILED_TOOLS = new Set(['read', 'write', 'edit', 'ls', 'find', 'grep'])

function jailPolicyNotice(roots: string[]): string {
  const rootList = roots.map((root) => `- ${root}`).join('\n')
  return `\n\n## Workspace sandbox\n\nYour tools (read, write, edit, ls, find, grep, bash) are confined to these directories:\n${rootList}\n\nDo not attempt to read, write, list, search, or execute anything outside them — not via parent-directory traversal (\`..\`), absolute paths, the home directory (\`~\`), symlinks, or any other means. Creating links (\`ln\`, \`cp -s\`) is also disallowed outright. Such calls are blocked by the server and just waste a turn; treat these directories as the entire filesystem available to you.`
}

export function createPermissionGateExtension(opts: { cwd: string; tempDir: string }): ExtensionFactory {
  const roots = [resolve(opts.cwd), resolve(opts.tempDir)]

  return function permissionGate(pi: ExtensionAPI) {
    pi.on('before_agent_start', (event) => ({
      systemPrompt: event.systemPrompt + jailPolicyNotice(roots),
    }))

    pi.on('tool_call', (event) => {
      if (event.toolName === 'bash' && isToolCallEventType('bash', event)) {
        if (DANGEROUS_BASH.test(event.input.command)) {
          return { block: true, reason: 'Blocked by static policy: command matches a known-dangerous pattern.', terminate: true }
        }
        const linkViolation = checkLinkCreation(event.input.command)
        if (linkViolation) {
          return { block: true, reason: `Blocked by static policy: ${linkViolation}.`, terminate: true }
        }
        const violation = checkBashConfinement(event.input.command, roots)
        if (violation) {
          return { block: true, reason: `Blocked: ${violation}. Stay within the allowed directories (${roots.join(', ')}).` }
        }
        return
      }

      if (JAILED_TOOLS.has(event.toolName)) {
        const path = (event.input as { path?: unknown }).path
        if (typeof path === 'string') {
          const violation = checkPathJail(path, roots)
          if (violation) {
            return { block: true, reason: `Blocked: ${violation}. Stay within the allowed directories (${roots.join(', ')}).` }
          }
        }
      }
    })
  }
}
