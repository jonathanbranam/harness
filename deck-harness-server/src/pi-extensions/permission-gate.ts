// Defense-in-depth for the built-in bash/write/edit tools, per the "Security
// and safety" section of docs/talks/deck-harness/planning.md:
//   1. Static blocklist for obviously destructive bash patterns.
//   2. Path jail: write/edit may not touch anything outside the agent's cwd.
//   3. Interactive approval, routed to the browser over the session's
//      WebSocket rather than a terminal — see websocket.ts for the
//      request/response plumbing this closes over.
//
// This is a per-session extension *factory*: session-store.ts calls
// createPermissionGateExtension() with that session's cwd and its own
// requestApproval callback, so concurrent chat sessions each get an
// isolated approval queue instead of sharing one module-level Map (the
// planning doc's sketch used a single shared map, which would cross wires
// between sessions).

import type { ExtensionAPI, ExtensionFactory } from '@earendil-works/pi-coding-agent'
import { isToolCallEventType } from '@earendil-works/pi-coding-agent'
import { resolve } from 'node:path'

// rm -rf, mkfs, dd to a raw device, clobbering a device node, and the classic
// curl/wget-pipe-to-shell remote-code-execution pattern. Exported for testing.
export const DANGEROUS_BASH =
  /\brm\s+-\w*(?:r\w*f\w*|f\w*r\w*)\s|\bmkfs(?:\.\w+)?\s|\bdd\s+if=|>\s*\/dev\/(?!null\b)|\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh)\b/i

/** Tools that only read state — never worth an approval prompt. */
const READ_ONLY_TOOLS = new Set([
  'read',
  'grep',
  'find',
  'ls',
  'presentation_get_state',
  'presentation_select_by_text',
  'presentation_history',
])

/** Tools that touch the filesystem or a shell and require explicit approval. */
const GATED_TOOLS = new Set(['bash', 'write', 'edit'])

export interface ApprovalRequest {
  toolCallId: string
  toolName: string
  input: unknown
}

export type RequestApproval = (request: ApprovalRequest) => Promise<boolean>

export function createPermissionGateExtension(opts: { cwd: string; requestApproval: RequestApproval }): ExtensionFactory {
  const jail = resolve(opts.cwd)

  return function permissionGate(pi: ExtensionAPI) {
    // Once the user approves a call this turn, don't re-prompt for an
    // identical repeat of it within the same turn.
    const approvedThisTurn = new Set<string>()

    pi.on('tool_call', async (event) => {
      if (READ_ONLY_TOOLS.has(event.toolName)) return

      if (event.toolName === 'bash' && isToolCallEventType('bash', event)) {
        if (DANGEROUS_BASH.test(event.input.command)) {
          return { block: true, reason: 'Blocked by static policy: command matches a known-dangerous pattern.', terminate: true }
        }
      }

      if (event.toolName === 'write' || event.toolName === 'edit') {
        const path = (event.input as { path?: unknown }).path
        if (typeof path === 'string') {
          const resolved = resolve(jail, path)
          if (resolved !== jail && !resolved.startsWith(jail + '/')) {
            return { block: true, reason: `Writes outside the workspace root are not allowed: ${path}` }
          }
        }
      }

      if (!GATED_TOOLS.has(event.toolName)) return

      const key = `${event.toolName}:${JSON.stringify(event.input)}`
      if (approvedThisTurn.has(key)) {
        approvedThisTurn.delete(key)
        return
      }

      const approved = await opts.requestApproval({ toolCallId: event.toolCallId, toolName: event.toolName, input: event.input })
      if (!approved) return { block: true, reason: 'Denied by user' }
      approvedThisTurn.add(key)
    })

    pi.on('turn_end', () => approvedThisTurn.clear())
  }
}
