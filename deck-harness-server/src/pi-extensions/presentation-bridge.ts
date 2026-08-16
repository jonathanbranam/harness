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
  'setEndpoint',
  'setZIndex',
  'bringForward',
  'sendBackward',
  'bringToFront',
  'sendToBack',
  'setOpacity',
  'setRotation',
  'setImageSource',
  'setCrop',
] as const

const SHAPE_TYPES = ['line', 'box', 'ellipse', 'arrow'] as const

export function presentationBridge(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'presentation_get_state',
    label: 'Get Presentation State',
    description:
      'Get the current presentation state: the active deck and slide identity, the active slide\'s backgroundColor, every object on the active slide, and the current selection. Every object has a `type` ("textBox", "line", "box", "ellipse", "arrow", or "image"), a `zIndex` (paint order — higher paints on top; not necessarily contiguous), and an `opacity` (0-1). `textBox`, `image`, `box`, `ellipse` also carry a `rotation` (degrees, about the bounding box\'s center) — `line`/`arrow` do not, since their angle is already fully expressed by their two endpoints. `textBox` objects carry bounds (x/y/width/height), structured rich-text `text`, fillColor, borderColor, fontColor, fontSize. `box`/`ellipse` carry bounds, fillColor, borderColor, borderWidth (`box` also cornerRadius). `line`/`arrow` carry endpoints (x1/y1/x2/y2), strokeColor, strokeWidth (`arrow` also arrowStart/arrowEnd booleans). `image` carries a destination bounding box (x/y/width/height), a `src` reference, and a crop rectangle in the source image\'s own pixel coordinates (cropX/cropY/cropWidth/cropHeight) — the two rectangles\' aspect ratios are independent of each other; the cropped region is fit inside the destination box at a single uniform scale (never stretched non-uniformly), letterboxed (transparent on the leftover axis) when the two don\'t match. `text` is an array of blocks (paragraph or listItem), each with inline runs carrying optional bold/italic flags. Color fields may be a color value or the literal "transparent" (fillColor/borderColor only — stroke/font colors are always a real color). Call this before making changes so you are reasoning about the live deck, not a stale copy.',
    promptSnippet: "Read the live deck: active deck/slide identity, the slide's background color, all objects on the active slide, and the current selection",
    parameters: Type.Object({}),
    execute: async () => {
      const state = editorStore.getState()
      return { content: [{ type: 'text' as const, text: JSON.stringify(state, null, 2) }], details: state }
    },
  })

  pi.registerTool({
    name: 'presentation_update',
    label: 'Update Presentation',
    description: `Modify objects in the live presentation editor. Use when the user asks to change layout, styling, content, or stacking order of slides.

Available actions:
- setPosition: { x?: number, y?: number, dx?: number, dy?: number } — works on every object type (line/arrow move as a unit).
- setSize: { width?: number, height?: number } — textBox/box/ellipse/image only; use setEndpoint for line/arrow. Each field given changes only that dimension — the other is left exactly as it was (no derivation from the other, even on image, whose crop rectangle has its own independent aspect ratio — see setCrop below).
- setText: { text: string | TextBlock[] } — textBox only. A plain string is wrapped as a single unstyled paragraph; pass TextBlock[] directly for rich content. TextBlock is { kind: "paragraph", runs: TextRun[] } | { kind: "listItem", listType: "bulleted" | "numbered", runs: TextRun[] }. TextRun is { text: string, bold?: boolean, italic?: boolean }.
- setFillColor: { color: string } (hex, e.g. "#ff0000", or "transparent" for no fill) — textBox/box/ellipse only.
- setFontColor: { color: string } (hex) — textBox only.
- setBorderColor: { color: string } (hex, or "transparent" for no border) — every type: sets the border color for textBox/box/ellipse, or the stroke color for line/arrow.
- setFontSize: { fontSize: number } (points) — textBox only.
- setEndpoint: { which: "start" | "end", x: number, y: number } — line/arrow only; moves one endpoint, the other is unaffected.
- setZIndex: { zIndex: number } — sets an object's explicit stacking-order value.
- bringForward / sendBackward: {} — swaps an object with the next object above/below it in stacking order.
- bringToFront / sendToBack: {} — moves an object above/below every other object on the slide.
- applyGridLayout: { direction: "horizontal" | "vertical", gap?: number } — works on any mix of object types.
- addObject: { x: number, y: number, width: number, height: number, text?: string | TextBlock[], fillColor?: string, borderColor?: string, fontColor?: string, fontSize?: number } — adds a textBox; targetIds is ignored. For line/box/ellipse/arrow use presentation_add_shape instead, or presentation_add_image for images. Returns the new object's id in the result's "changed" list.
- removeObject: {} — removes each object in targetIds from the active slide (any type, including image).
- applyTextStyle: { start: number, end: number, mark?: "bold" | "italic", value?: boolean } or { start: number, end: number, listType: "bulleted" | "numbered" | null } — textBox only; start/end are character offsets into the target's plain-text content (the same string presentation_select_by_text matches against, with blocks joined by "\\n"); mark+value toggles bold/italic on that range; listType converts the blocks the range touches into that list type, or back to a plain paragraph when null.
- setOpacity: { opacity: number } (0-1) — works on every object type.
- setRotation: { rotation: number } (degrees, about the bounding box's center) — textBox/image/box/ellipse only; rejected as a type mismatch for line/arrow, whose angle is already expressed by their endpoints.
- setImageSource: { src: string, naturalWidth: number, naturalHeight: number } — image only. Changes which image is displayed; naturalWidth/naturalHeight are the *new* source image's actual pixel dimensions (read the file before calling, this tool cannot inspect image bytes itself) and are used to reset the crop rectangle to that image's full extent. The destination position, width, and height are all left completely unchanged, whatever the new crop's aspect ratio turns out to be — see the rendering note under setCrop below.
- setCrop: { cropX?: number, cropY?: number, cropWidth?: number, cropHeight?: number } — image only, all fields in the source image's own pixel coordinates. cropX/cropY pan the crop (which region is shown) without affecting size. cropWidth/cropHeight resize the crop rectangle; each field given changes only that dimension — the other is left exactly as it was, so the crop rectangle's aspect ratio is free to change and does not need to match the destination box's. setSize's width/height and setCrop's cropWidth/cropHeight are fully independent of each other: resizing the destination never touches the crop, and vice versa. When the crop rectangle's aspect ratio doesn't match the destination box's, rendering fits the whole crop inside the destination box at a single uniform scale (never stretching X and Y by different amounts) and leaves the leftover space on one axis transparent — it never silently discards part of the crop to avoid that.

Setting an action's field(s) on a target whose type doesn't support them is reported in the result's "errors" instead of applied. Always prefer the most specific action. If multiple objects are selected and the user asks to lay them out, use applyGridLayout. For shape-specific styling (stroke/border width, corner radius, arrowheads) use presentation_style_shape.`,
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
      const result = editorStore.applyUpdate('agent', params.action as UpdateAction, params.targetIds, params.args as Record<string, unknown>)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
        isError: result.errors.length > 0 && result.changed.length === 0,
      }
    },
  })

  pi.registerTool({
    name: 'presentation_add_shape',
    label: 'Add Shape',
    description: `Add a new shape object to the active slide. "type" selects the shape and determines which other args apply:
- "box": rectangle. Args: x, y, width, height (required, bounding box), fillColor?, borderColor?, borderWidth?, cornerRadius?.
- "ellipse": ellipse, or a circle when width === height. Args: x, y, width, height (required, bounding box), fillColor?, borderColor?, borderWidth?.
- "line": straight line segment. Args: x1, y1, x2, y2 (required, slide-coordinate endpoints), strokeColor?, strokeWidth?.
- "arrow": straight line with an arrowhead. Args: x1, y1, x2, y2 (required), strokeColor?, strokeWidth?, arrowStart? (boolean, default false), arrowEnd? (boolean, default true).

fillColor/borderColor accept a hex color or "transparent"; strokeColor must be a real color. The new object is placed above every existing object on the slide (highest zIndex). Returns the new object's id in the result's "changed" list; a validation failure (e.g. missing geometry) is reported in "errors" and creates nothing.`,
    promptSnippet: 'Add a line, box, ellipse, or arrow shape to the live deck',
    parameters: Type.Object({
      type: Type.Union(SHAPE_TYPES.map((t) => Type.Literal(t))),
      id: Type.Optional(Type.String()),
      x: Type.Optional(Type.Number()),
      y: Type.Optional(Type.Number()),
      width: Type.Optional(Type.Number()),
      height: Type.Optional(Type.Number()),
      x1: Type.Optional(Type.Number()),
      y1: Type.Optional(Type.Number()),
      x2: Type.Optional(Type.Number()),
      y2: Type.Optional(Type.Number()),
      fillColor: Type.Optional(Type.String()),
      borderColor: Type.Optional(Type.String()),
      borderWidth: Type.Optional(Type.Number()),
      cornerRadius: Type.Optional(Type.Number()),
      strokeColor: Type.Optional(Type.String()),
      strokeWidth: Type.Optional(Type.Number()),
      arrowStart: Type.Optional(Type.Boolean()),
      arrowEnd: Type.Optional(Type.Boolean()),
    }),
    execute: async (_id, params) => {
      const result = editorStore.addShape('agent', params as Record<string, unknown>)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
        isError: result.errors.length > 0 && result.changed.length === 0,
      }
    },
  })

  pi.registerTool({
    name: 'presentation_add_image',
    label: 'Add Image',
    description: `Add a new image object to the active slide. Required: src (a URL — either an http(s):// URL, or a server-local /api/images/:id from an upload the user already made), x, y (destination position), and at least one of width/height (destination size; the other is derived from the crop's aspect ratio if omitted).

The crop rectangle (cropX/cropY/cropWidth/cropHeight, in the source image's own pixel coordinates) defaults to the full source image when omitted — but that requires naturalWidth/naturalHeight (the source image's actual pixel dimensions) so the default can be computed; pass either an explicit cropWidth/cropHeight, or naturalWidth/naturalHeight, not neither.

The new object is placed above every existing object on the slide (highest zIndex). Returns the new object's id in the result's "changed" list; a validation failure (e.g. missing geometry) is reported in "errors" and creates nothing. To edit an existing image's source/crop afterward, use presentation_update's setImageSource/setCrop.`,
    promptSnippet: 'Add an image to the live deck',
    parameters: Type.Object({
      src: Type.String(),
      id: Type.Optional(Type.String()),
      x: Type.Number(),
      y: Type.Number(),
      width: Type.Optional(Type.Number()),
      height: Type.Optional(Type.Number()),
      cropX: Type.Optional(Type.Number()),
      cropY: Type.Optional(Type.Number()),
      cropWidth: Type.Optional(Type.Number()),
      cropHeight: Type.Optional(Type.Number()),
      naturalWidth: Type.Optional(Type.Number({ description: "The source image's actual pixel width, used to default the crop to its full extent when cropWidth isn't given." })),
      naturalHeight: Type.Optional(Type.Number({ description: "The source image's actual pixel height, used to default the crop to its full extent when cropHeight isn't given." })),
    }),
    execute: async (_id, params) => {
      const result = editorStore.addImage('agent', params as Record<string, unknown>)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
        isError: result.errors.length > 0 && result.changed.length === 0,
      }
    },
  })

  pi.registerTool({
    name: 'presentation_style_shape',
    label: 'Style Shape',
    description:
      'Set shape-specific styling on target objects — fields presentation_update\'s generic actions can\'t express: strokeWidth (line/arrow), borderWidth (box/ellipse), cornerRadius (box only), arrowStart/arrowEnd (arrow only — whether an arrowhead is drawn at that end). For fill/border/stroke color, use presentation_update\'s setFillColor/setBorderColor instead (setBorderColor already applies to a line/arrow\'s stroke color). Setting a field on a target whose type doesn\'t support it is reported in the result\'s "errors" rather than applied.',
    promptSnippet: 'Set stroke/border width, corner radius, or arrowheads on shape objects',
    parameters: Type.Object({
      targetIds: Type.Array(Type.String(), { description: 'IDs of the shape objects to style.' }),
      strokeWidth: Type.Optional(Type.Number()),
      borderWidth: Type.Optional(Type.Number()),
      cornerRadius: Type.Optional(Type.Number()),
      arrowStart: Type.Optional(Type.Boolean()),
      arrowEnd: Type.Optional(Type.Boolean()),
    }),
    execute: async (_id, params) => {
      const changed = new Set<string>()
      const errors: string[] = []
      const apply = (action: UpdateAction, args: Record<string, unknown>) => {
        const result = editorStore.applyUpdate('agent', action, params.targetIds, args)
        for (const id of result.changed) changed.add(id)
        errors.push(...result.errors)
      }
      if (typeof params.strokeWidth === 'number') apply('setStrokeWidth', { strokeWidth: params.strokeWidth })
      if (typeof params.borderWidth === 'number') apply('setBorderWidth', { borderWidth: params.borderWidth })
      if (typeof params.cornerRadius === 'number') apply('setCornerRadius', { cornerRadius: params.cornerRadius })
      if (typeof params.arrowStart === 'boolean' || typeof params.arrowEnd === 'boolean') {
        apply('setArrowHeads', { arrowStart: params.arrowStart, arrowEnd: params.arrowEnd })
      }
      const result = { changed: [...changed], errors }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
        isError: errors.length > 0 && changed.size === 0,
      }
    },
  })

  pi.registerTool({
    name: 'presentation_set_slide_background',
    label: 'Set Slide Background',
    description:
      "Set the active slide's background color. Applies to the whole slide, not a specific object — there is no targetIds parameter. Color must be a real value (hex, e.g. \"#ffffff\"), not \"transparent\".",
    promptSnippet: "Set the active slide's background color",
    parameters: Type.Object({ color: Type.String() }),
    execute: async (_id, params) => {
      const result = editorStore.setSlideBackgroundColor('agent', params.color)
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: result, isError: !result.ok }
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

  pi.registerTool({
    name: 'presentation_history',
    label: 'Presentation History',
    description:
      'List recent entries in the shared undo/redo history, most-recent-first, each with who made the change ("user" or "agent"), when (a timestamp), and a short human-readable description. Also reports canUndo/canRedo. Call this before presentation_undo to work out how many of your own recent edits to step back through — e.g. for "undo your last 5 minutes of changes," count consecutive most-recent entries with actor "agent" within that window.',
    promptSnippet: 'List recent undo/redo history entries with actor, timestamp, and description',
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: 'Maximum number of entries to return, most-recent-first. Omit for the full history.' })),
    }),
    execute: async (_id, params) => {
      const result = editorStore.getHistory(params.limit)
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: result }
    },
  })

  pi.registerTool({
    name: 'presentation_undo',
    label: 'Undo',
    description:
      "Undo the most recent entries in the shared undo/redo history (shared with the user's own keyboard/toolbar undo), optionally stepping more than one at a time via count. Stops early if the history is exhausted before count is reached — no error is raised. Because this is a strict LIFO stack, you cannot skip over an intervening user edit to reach an older edit of your own underneath it.",
    promptSnippet: 'Undo the most recent edit(s) in the shared history',
    parameters: Type.Object({
      count: Type.Optional(Type.Number({ description: 'How many entries to undo. Defaults to 1.' })),
    }),
    execute: async (_id, params) => {
      const result = editorStore.undo('agent', params.count ?? 1)
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: result }
    },
  })

  pi.registerTool({
    name: 'presentation_redo',
    label: 'Redo',
    description:
      'Redo the most recently undone entries in the shared undo/redo history, optionally stepping more than one at a time via count. Stops early if there is nothing left to redo before count is reached — no error is raised.',
    promptSnippet: 'Redo the most recently undone edit(s) in the shared history',
    parameters: Type.Object({
      count: Type.Optional(Type.Number({ description: 'How many entries to redo. Defaults to 1.' })),
    }),
    execute: async (_id, params) => {
      const result = editorStore.redo('agent', params.count ?? 1)
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: result }
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
        content: `Current presentation state (deck: ${state.activeDeckId}, slide: ${state.activeSlideId}, slide backgroundColor: ${state.backgroundColor}, selected: ${state.selection.join(', ') || '(none)'}). Every object has a "type" ("textBox", "line", "box", "ellipse", "arrow", or "image"), a "zIndex" (paint order, higher on top), and an "opacity" (0-1). "textBox"/"image"/"box"/"ellipse" also carry a "rotation" (degrees, about the bounding box's center) — "line"/"arrow" do not. "textBox" objects' "text" is structured rich text (an array of paragraph/listItem blocks of runs with optional bold/italic); "textBox"/"box"/"ellipse" carry fillColor/borderColor (color value or "transparent"), "textBox" also fontColor; "line"/"arrow" carry strokeColor/strokeWidth instead; "image" carries src, a destination box (x/y/width/height), and a crop rectangle (cropX/cropY/cropWidth/cropHeight, in the source image's own pixel coordinates) with an independent aspect ratio, fit into the destination box at a single uniform scale when rendered:\n${JSON.stringify(state, null, 2)}`,
        display: false,
      },
    }
  })
}
