// Registers the tools that let pi read and modify the live deck, per the
// "Presentation-bridge extension" section of docs/talks/deck-harness/planning.md.
//
// The planning doc's sketch calls out to an "editor API" over HTTP
// (`fetch("http://localhost:3001/api/editor/...")`), which made sense if the
// editor lived in a separate process. Here the whole point of using the SDK
// (per pi-harness.md's "Why the SDK instead of RPC mode") is that everything
// runs in one process, so the tools call editorStore directly — no self-HTTP
// round trip, no port to configure, no failure mode where the "editor API"
// is unreachable.

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import { editorStore, type UpdateAction } from '../editor-state'

const ACTIONS = ['setPosition', 'setSize', 'setText', 'setFillColor', 'setFontSize', 'applyGridLayout'] as const

export function presentationBridge(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'presentation_get_state',
    label: 'Get Presentation State',
    description:
      'Get the current presentation state: the active deck and slide identity, every object on the active slide (id, bounds, text, styling), and the current selection. Call this before making changes so you are reasoning about the live deck, not a stale copy.',
    promptSnippet: 'Read the live deck: active deck/slide identity, all objects on the active slide, and the current selection',
    parameters: Type.Object({}),
    execute: async () => {
      const state = editorStore.getState()
      return { content: [{ type: 'text' as const, text: JSON.stringify(state, null, 2) }], details: state }
    },
  })

  pi.registerTool({
    name: 'presentation_update',
    label: 'Update Presentation',
    description: `Modify objects in the live presentation editor. Use when the user asks to change layout, styling, or content of slides.

Available actions:
- setPosition: { x?: number, y?: number, dx?: number, dy?: number }
- setSize: { width?: number, height?: number }
- setText: { text: string }
- setFillColor: { color: string } (hex, e.g. "#ff0000")
- setFontSize: { fontSize: number } (points)
- applyGridLayout: { direction: "horizontal" | "vertical", gap?: number }

Always prefer the most specific action. If multiple objects are selected and the user asks to lay them out, use applyGridLayout.`,
    promptSnippet: 'Move, resize, restyle, or lay out objects in the live deck',
    promptGuidelines: [
      'Use presentation_update on the current selection unless the user names other objects by text or id.',
      'Use presentation_update with applyGridLayout instead of computing per-object positions by hand.',
    ],
    parameters: Type.Object({
      action: Type.Union(ACTIONS.map((a) => Type.Literal(a))),
      targetIds: Type.Array(Type.String(), {
        description: 'IDs of the objects to modify. Use the current selection unless the user names specific objects.',
      }),
      args: Type.Record(Type.String(), Type.Unknown(), { description: 'Action-specific parameters; see the tool description.' }),
    }),
    execute: async (_id, params) => {
      const result = editorStore.applyUpdate(params.action as UpdateAction, params.targetIds, params.args as Record<string, unknown>)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
        isError: result.errors.length > 0 && result.changed.length === 0,
      }
    },
  })

  pi.registerTool({
    name: 'presentation_select_by_text',
    label: 'Select by Text',
    description: 'Return the IDs of objects whose visible text contains the given query string. Use this to find objects before styling or moving them.',
    promptSnippet: 'Find object ids by matching their visible text',
    parameters: Type.Object({
      query: Type.String(),
      caseSensitive: Type.Optional(Type.Boolean()),
    }),
    execute: async (_id, params) => {
      const ids = editorStore.selectByText(params.query, params.caseSensitive ?? false)
      return { content: [{ type: 'text' as const, text: `Matched IDs: ${ids.join(', ') || '(none)'}` }], details: { ids } }
    },
  })

  // Push the live selection into context on every prompt rather than relying
  // on the model to call presentation_get_state first — see "Keeping pi
  // informed of editor state" in the planning doc. display:false keeps the
  // raw JSON out of the visible chat history.
  pi.on('before_agent_start', async () => {
    const state = editorStore.getState()
    return {
      message: {
        customType: 'editor_context',
        role: 'user' as const,
        content: `Current presentation state (deck: ${state.activeDeckId}, slide: ${state.activeSlideId}, selected: ${state.selection.join(', ') || '(none)'}):\n${JSON.stringify(state, null, 2)}`,
        display: false,
      },
    }
  })
}
