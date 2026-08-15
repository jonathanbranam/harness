// Registers the slide_view tool, backing slide-visual-inspection's spec:
// let pi see a rendered image of the active slide instead of only inferring
// layout from numeric bounds. Per design.md's "captures the real canvas in
// the browser, not a server-side render" decision, this tool doesn't render
// anything itself — it asks the browser connection that originated the
// current turn to do it (via opts.requestRender, wired up per-session in
// websocket.ts/session-store.ts, mirroring permission-gate.ts's approval
// pattern) and returns the resulting image as tool content.
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

export function createSlideVisualInspectionExtension(opts: { requestRender: RequestRender }): ExtensionFactory {
  return function slideVisualInspection(pi: ExtensionAPI) {
    pi.registerTool({
      name: 'slide_view',
      label: 'View Slide',
      description:
        'Render the active slide to an image and return it, so you can visually check for layout problems — text overflowing its box, objects overlapping, sizing that looks wrong — that numeric bounds alone might not reveal. Reflects the slide as of the moment this is called.',
      promptSnippet: 'Render the active slide to an image and inspect it visually',
      promptGuidelines: [
        'Call this after a layout change you are unsure about, not on every edit — it round-trips to the browser and is slower than presentation_get_state.',
      ],
      parameters: Type.Object({}),
      execute: async () => {
        const result = await opts.requestRender({ requestId: randomUUID() })
        if (!result.ok) {
          return {
            content: [{ type: 'text' as const, text: `Failed to render the active slide: ${result.error}` }],
            details: { ok: false },
            isError: true,
          }
        }
        const parsed = parseDataUrl(result.dataUrl)
        if (!parsed) {
          return {
            content: [{ type: 'text' as const, text: 'Failed to render the active slide: invalid image data' }],
            details: { ok: false },
            isError: true,
          }
        }
        return { content: [{ type: 'image' as const, data: parsed.data, mimeType: parsed.mimeType }], details: { ok: true } }
      },
    })
  }
}
