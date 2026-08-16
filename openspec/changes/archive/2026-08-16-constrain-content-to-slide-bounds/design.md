## Context

See proposal.md - Why. Relevant current state:

- `deck-harness-server/src/editor-state.ts`'s `EditorStore.applyUpdate` is the single place both the UI (via WebSocket update messages) and Claude's presentation-bridge tools (`setPosition`, `setSize`, `addObject`) end up mutating slide objects. It currently applies `Math.max(1, ...)` to width/height only — no upper bound, and no bound on x/y at all.
- `client-deck/src/components/DeckCanvas.tsx`'s `handlePointerDownMove`/`handlePointerDownResize` compute a live `Rect` on every `pointermove` and render it immediately via `liveRects` (for responsive dragging), then send the final rect to the server via `onObjectUpdate` on `pointerup`. The slide's logical size is fixed at `CANVAS_WIDTH = 960`, `CANVAS_HEIGHT = 540` (module-level constants in this file).
- There is no shared `packages/` tier (per CLAUDE.md) importable by both client and server, so the 960x540 constants are necessarily duplicated rather than imported from one place — consistent with existing practice in this codebase.

## Goals / Non-Goals

**Goals:**
- Make `editor-state.ts` the authoritative bounds check, so no code path (UI or tool call) can produce an out-of-bounds object.
- Give the UI live visual feedback during drag/resize that matches what the server will ultimately accept, so the object doesn't visually snap back after release.

**Non-Goals:**
- Repairing objects that are already off-canvas in existing deck data (see proposal.md).
- Enforcing bounds for `applyGridLayout` (out of scope per proposal's Impact section — it lays out existing on-canvas objects relative to each other, not by absolute coordinate input, and isn't listed as changed there).
- Adding a shared constants package for `960`/`540` — out of scope for this change; follows existing duplication precedent in this codebase.

## Decisions

**Clamp order: size first, then position.** For any action that changes width/height, first clamp width to `[1, 960]` and height to `[1, 540]`, then clamp x to `[0, 960 - width]` and y to `[0, 540 - height]` using the (possibly-just-clamped) width/height. For an action that changes only position, clamp x/y against the object's existing (unchanged) width/height the same way. This ordering means a resize that both grows an object and would push it off-edge always ends up fully on-slide, and a plain move never alters width/height.
- Alternative considered: clamp position independently of size (e.g., just clamp x to `[0, 960]`). Rejected — would allow an object's far edge to still sit off-slide.

**Single clamp helper in `editor-state.ts`, called from `setPosition`, `setSize`, and `addObject`.** Keeps the bounds rule in one place so UI-driven updates and tool calls can't drift apart, per proposal.md's "single source of truth" framing.
- Alternative considered: clamp only in the presentation-bridge tool layer. Rejected — the UI's WebSocket update path doesn't go through presentation-bridge, so this would miss UI-driven drags entirely.

**Client duplicates the same clamp formula for live drag/resize feedback, rather than round-tripping to the server on every pointermove.** `DeckCanvas.tsx`'s `onMove` handlers already compute `latest: Rect` locally for the `liveRects` optimistic-render path; clamping `latest` there with the same `[0, CANVAS_WIDTH]`/`[0, CANVAS_HEIGHT]` logic keeps the drag visually pinned to the edge in real time. The final `onObjectUpdate` call on `pointerup` still goes through the server's authoritative clamp, so a client/server formula mismatch would only ever be visible as a one-frame correction on release, not a persisted inconsistency.
- Alternative considered: send every pointermove to the server and wait for the clamped result before rendering. Rejected — reintroduces per-frame round-trip latency into dragging, which the existing `liveRects` mechanism was built specifically to avoid.

## Risks / Trade-offs

- **Duplicated clamp math (client + server)** → both implementations are a few lines of `Math.min`/`Math.max` against the same two constants already duplicated in this codebase (`CANVAS_WIDTH`/`CANVAS_HEIGHT` in `DeckCanvas.tsx`, implicit `960`/`540` to be added in `editor-state.ts`); mitigated by keeping the formula intentionally trivial rather than trying to unify it across the client/server boundary that doesn't otherwise exist.
- **`applyGridLayout` is excluded from clamping** → an agent could still lay out targets far enough apart that later members of the group land off-slide (cursor accumulates `width + gap` per item with no bound). Accepted as out of scope for this change; flagged here in case it becomes a follow-up.
