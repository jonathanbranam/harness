// Registers the dungeon_board_view tool, backing dungeon-board-visual-
// inspection's spec: let pi see a rendered image of the live game board
// instead of only inferring layout from numeric board state. Mirrors
// deck-harness-server's slide-visual-inspection.ts exactly — this tool
// doesn't render anything itself, it asks the browser connection that
// originated the current turn to do it (via opts.requestRender, wired up
// per-session in websocket.ts/session-store.ts, mirroring
// permission-gate.ts's approval pattern) and returns the resulting image as
// tool content.
//
// Factory (not a plain ExtensionAPI function) because requestRender is
// scoped per-session, same reasoning as createPermissionGateExtension.

import type { ExtensionAPI, ExtensionFactory } from '@earendil-works/pi-coding-agent'
import { randomUUID } from 'node:crypto'
import { Type } from 'typebox'

export interface RenderRequest {
  requestId: string
}

export type RenderResult = { ok: true; dataUrl: string } | { ok: false; error: string }

export type RequestRender = (request: RenderRequest) => Promise<RenderResult>

const DATA_URL_RE = /^data:([^;,]+);base64,(.+)$/

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | undefined {
  const match = DATA_URL_RE.exec(dataUrl)
  if (!match) return undefined
  return { mimeType: match[1], data: match[2] }
}

export function createBoardVisualInspectionExtension(opts: { requestRender: RequestRender }): ExtensionFactory {
  return function boardVisualInspection(pi: ExtensionAPI) {
    pi.registerTool({
      name: 'dungeon_board_view',
      label: 'View Board',
      description:
        'Render the current game board to an image and return it, so you can visually check for layout problems — overlapping objects, mispositioned drawings, wrong colors — that numeric board state alone might not reveal. Reflects the board as of the moment this is called.',
      promptSnippet: 'Render the current game board to an image and inspect it visually',
      promptGuidelines: [
        'Call this when you need to see what the browser is actually showing, not on every step — it round-trips to the browser and back, so it is slower than reading state directly.',
      ],
      parameters: Type.Object({}),
      execute: async () => {
        const result = await opts.requestRender({ requestId: randomUUID() })
        if (!result.ok) {
          return {
            content: [{ type: 'text' as const, text: `Failed to render the board: ${result.error}` }],
            details: { ok: false },
            isError: true,
          }
        }
        const parsed = parseDataUrl(result.dataUrl)
        if (!parsed) {
          return {
            content: [{ type: 'text' as const, text: 'Failed to render the board: invalid image data' }],
            details: { ok: false },
            isError: true,
          }
        }
        return { content: [{ type: 'image' as const, data: parsed.data, mimeType: parsed.mimeType }], details: { ok: true } }
      },
    })
  }
}
