## Context

See proposal.md - Why for motivation. Current state:

- deck-harness-server's `slide_view` tool (`pi-extensions/slide-visual-inspection.ts`) asks the browser to render `DeckCanvas`'s DOM node to a PNG via a `render_request`/`render_response` WebSocket round trip, implemented with a per-connection `pendingRenders` Map + 15s timeout in `websocket.ts`, and a `toPng(node, { width: 960, height: 540, style: { transform: 'none' } })` call in `useDeckSocket.ts`'s `handleRenderRequest`. The `style: { transform: 'none' }` override defeats `DeckCanvas`'s scale-to-fit CSS transform so the capture always reflects the canvas's fixed logical size.
- dungeon-harness-server has no equivalent today; `client-dungeon`'s `useDungeonSocket.ts` explicitly notes it has "no canvasRef/render-request handling," and `BoardCanvas.tsx` does not forward a ref. `BoardCanvas` has no scale-to-fit transform (it's `overflow-auto`, not scaled), so it needs no style override for capture.
- `packages/ui` already exists and holds purely client-side, non-session UI mechanics (`ChatPanel`, `usePaneManager`, etc.), consumed by both `client-deck` and `client-dungeon`.
- `pi-extensions/permission-gate.ts` is deliberately duplicated across all three harness servers (89/79/205 lines) rather than shared, because each harness's allowlist/jail is genuinely different and the project treats server-side pi-extension code as staying local for auditability.

## Goals / Non-Goals

**Goals:**
- One shared implementation of "capture this DOM node to a fixed-size PNG" that both `client-deck` and `client-dungeon` call, usable by a future visually-oriented harness without copy-paste.
- dungeon-harness gets a `dungeon_board_view` tool with parity to `slide_view`'s behavior (per the new `dungeon-board-visual-inspection` spec).
- No observable behavior change to deck-harness's existing `slide_view` tool.

**Non-Goals:**
- Sharing the server-side WebSocket render-request protocol or pi-extension tool registration across harnesses — see Decision 1.
- Building a general "shared harness-server package" tier. This change only touches `packages/ui` (client-side).
- Changing `BoardCanvas`'s visual rendering, or giving it a scale-to-fit transform it doesn't have today.

## Decisions

### Decision 1: Split at the client/server boundary, not by DRY-ing the whole feature

The capture mechanism has two halves with different risk profiles: the client-side "turn this ref into a PNG" call is pure UI mechanics with no session or security semantics; the server-side pi-extension + WebSocket plumbing is per-session tool-registration code, the same category as `permission-gate.ts`.

**Decision**: extract only the client-side capture call into `@harness/ui`. Copy the server-side `pendingRenders`/timeout plumbing and the pi-extension tool registration into dungeon-harness-server, following `permission-gate.ts`'s existing precedent exactly.

**Alternatives considered**:
- *Share everything behind a generic `createVisualInspectionExtension({ toolName, requestRender, ... })` factory in a new shared server package.* Rejected: this repo has already faced this exact choice for `permission-gate.ts` (arguably a better DRY candidate, since it's larger and identically shaped) and chose per-harness copies. Introducing a shared server package for this smaller case while still fully duplicating the bigger, riskier one would leave two contradictory precedents with no clear rule for which future pi-extension goes where.
- *Copy the client-side capture code too, per harness.* Rejected: this half is exactly what `packages/ui` already exists for (pure UI mechanics, already proven with `ChatPanel`/`usePaneManager`), and a third visually-oriented harness is explicitly anticipated — copying here has no auditability benefit, only drift risk on a mechanical `toPng` call.

### Decision 2: `captureNode` signature stays a thin, unopinionated wrapper

```ts
function captureNode(
  node: HTMLElement,
  opts: { width: number; height: number; style?: Partial<CSSStyleDeclaration> },
): Promise<string> // resolves to a PNG data URL
```

Dimensions and any style override are always caller-supplied — `captureNode` has no knowledge of "slide" or "board" concepts. `useDeckSocket.ts` passes `{ width: 960, height: 540, style: { transform: 'none' } }`; `useDungeonSocket.ts` passes the board's fixed pixel dimensions with no style override, since `BoardCanvas` has nothing to defeat.

**Alternatives considered**: a higher-level hook (e.g. `useRenderRequestHandler(nodeRef, opts)`) that also owns the WebSocket message handling. Rejected for now — each harness's socket hook already has a bespoke message-dispatch switch (`useDeckSocket.ts`'s `ws.onmessage`), and folding WS wiring into a shared hook would pull `@harness/ui` into knowing about each harness's message protocol, which is exactly the server-side coupling Decision 1 avoids on the client side too. The ~10-line `render_request` case in each socket hook's switch stays per-harness, calling the shared `captureNode`.

### Decision 3: dungeon's WebSocket protocol and pi-extension mirror deck's structure exactly

`dungeon-harness-server/src/websocket.ts` gains a `render_request`/`render_response` message pair, a `pendingRenders` Map, and the same 15s timeout constant as deck's. `board-visual-inspection.ts` mirrors `slide-visual-inspection.ts`'s shape (factory taking `requestRender`, parsing the returned data URL, returning image tool content or an error), with `dungeon_board_view` in place of `slide_view` and board-appropriate tool description/prompt guidelines.

`session-store.ts` must both wire `createBoardVisualInspectionExtension({ requestRender })` into the per-session extension list *and* add `dungeon_board_view` to the tool allowlist — per this project's existing gotcha that a registered-but-not-allowlisted tool is silently invisible to the agent.

## Risks / Trade-offs

- [The server-side render-request plumbing (Map + timeout + message types) now exists in two near-identical copies, and will exist in a third if another visually-oriented harness is added] → Mitigation: it's small (~25 lines) and behaviorally inert (no security implications), the same trade-off already accepted for the much larger `permission-gate.ts`. Revisit extraction only if a real bug from drift actually occurs, not preemptively.
- [`BoardCanvas` gaining a forwarded ref is a small API change to an existing component] → Mitigation: purely additive (an optional forwarded ref), mirrors `DeckCanvas`'s existing pattern, and `DungeonPage.tsx`'s only other consumer is updated in the same change.
- [Forgetting to add `dungeon_board_view` to dungeon's tool allowlist would silently leave it unreachable] → Mitigation: called out explicitly in tasks.md as its own step, per CLAUDE.md's documented gotcha.

## Migration Plan

Additive on both harnesses; no data migration. Suggested order: (1) add `captureNode` to `@harness/ui`, (2) refactor `useDeckSocket.ts` to use it and verify `slide_view` still works unchanged, (3) add dungeon's WebSocket protocol + `board-visual-inspection.ts` + session-store wiring + tool allowlist entry, (4) forward a ref through `BoardCanvas`/`DungeonPage`/`useDungeonSocket.ts` and wire the render-request handler. No rollback concerns beyond reverting the change; nothing is persisted.
