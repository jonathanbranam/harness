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

const ACTIONS = [
  'setPosition',
  'setSize',
  'setText',
  'setFillColor',
  'setFontColor',
  'setBorderColor',
  'setFontSize',
  'applyGridLayout',
  'addObject',
  'removeObject',
  'applyTextStyle',
] as const

export function presentationBridge(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'presentation_get_state',
    label: 'Get Presentation State',
    description:
      'Get the current presentation state: the active deck and slide identity, every object on the active slide (id, bounds, structured rich-text `text`, and styling: fillColor, borderColor, fontColor, fontSize), and the current selection. `text` is an array of blocks (paragraph or listItem), each with inline runs carrying optional bold/italic flags. `fillColor`/`borderColor` may be a color value or the literal "transparent". Call this before making changes so you are reasoning about the live deck, not a stale copy.',
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
- setText: { text: string | TextBlock[] } — a plain string is wrapped as a single unstyled paragraph; pass TextBlock[] directly for rich content. TextBlock is { kind: "paragraph", runs: TextRun[] } | { kind: "listItem", listType: "bulleted" | "numbered", runs: TextRun[] }. TextRun is { text: string, bold?: boolean, italic?: boolean }.
- setFillColor: { color: string } (hex, e.g. "#ff0000", or "transparent" for no fill)
- setFontColor: { color: string } (hex)
- setBorderColor: { color: string } (hex, or "transparent" for no border)
- setFontSize: { fontSize: number } (points)
- applyGridLayout: { direction: "horizontal" | "vertical", gap?: number }
- addObject: { x: number, y: number, width: number, height: number, text?: string | TextBlock[], fillColor?: string, borderColor?: string, fontColor?: string, fontSize?: number } — targetIds is ignored; x/y/width/height are required since only you (not the editor) know where the new box should go. Returns the new object's id in the result's "changed" list.
- removeObject: {} — removes each object in targetIds from the active slide.
- applyTextStyle: { start: number, end: number, mark?: "bold" | "italic", value?: boolean } or { start: number, end: number, listType: "bulleted" | "numbered" | null } — start/end are character offsets into the target's plain-text content (the same string presentation_select_by_text matches against, with blocks joined by "\\n"); mark+value toggles bold/italic on that range; listType converts the blocks the range touches into that list type, or back to a plain paragraph when null.

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
    description:
      'Return the IDs of objects whose visible text contains the given query string. Matching is against the plain-text content of each object\'s structured text (all runs concatenated, ignoring bold/italic/list formatting). Use this to find objects before styling or moving them.',
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
        content: `Current presentation state (deck: ${state.activeDeckId}, slide: ${state.activeSlideId}, selected: ${state.selection.join(', ') || '(none)'}). Each object's "text" is structured rich text (an array of paragraph/listItem blocks of runs with optional bold/italic), and objects carry fillColor, borderColor, and fontColor, each of which may be a color value or "transparent" (for fillColor/borderColor):\n${JSON.stringify(state, null, 2)}`,
        display: false,
      },
    }
  })
}
