## Context

See proposal.md for motivation. Relevant current state in the recording pipeline (`introspect-harness-server/src`):

- `recording-types.ts`'s `RecordingEvent` union is currently only `RecordingStartEvent | FsSnapshotEvent | ForwardedLifecycleEvent` — every real event recorded today originates from `introspection-bridge.ts`'s `pi.on(...)` handlers, forwarded via a shared `EventEmitter` (`hs.events`) that `websocket.ts` broadcasts to every socket on the session, with `recordingWriter.appendEvent()` called alongside that broadcast (see `introspection-bridge.ts`'s `emit()` helper).
- `HarnessSession` (`session-store.ts`) already exposes `recordingWriter: RecordingWriter` as a plain field, and `websocket.ts`'s `onMessage` handler already has `harnessSession` in scope for every message — so appending a new event type directly, without going through the broadcast `EventEmitter`, needs no new plumbing through `session-store.ts`. (The proposal's Impact section speculated `session-store.ts` might need changes; on inspection it doesn't.)
- `replay-engine.ts`'s `stepTo`/`jumpToCheckpoint` already treat every event generically — anything in `events.jsonl` not in `RECORDING_INTERNAL_EVENT_TYPES` gets replayed back to the client in order. Adding a new event type needs zero changes here.
- `useIntrospectSocket.ts` already has a `replay_reset` branch that resets chat/foundation/usage state before a replayed prefix re-arrives (used for backward jumps); pane-layout state needs the same treatment.
- `event-streaming`'s existing spec requires broadcasting every captured event to all connected clients on a session — this change's `ui_layout` event is a deliberate, documented exception to that pattern (see Decision 2).

## Goals / Non-Goals

**Goals:**
- Recorded sessions capture pane-layout state changes (from `redesign-introspect-ui`'s `introspect/pane-layout` capability) alongside agent lifecycle events, so replay can show where the user was focused.
- Replay reconstructs pane layout at any scrubber position, including backward jumps, using the same generic mechanism already used for chat/foundation/usage state.

**Non-Goals:**
- Cross-tab layout sync — a `ui_layout` event from one tab must never move another tab's panes. This change deliberately does *not* extend the live broadcast; the divergence from `event-streaming`'s broadcast requirement is documented here, not treated as a bug to fix.
- Persisting layout outside recordings (e.g. `localStorage`) — remains explicitly out of scope, matching the sibling change.
- Attributing which tab a `ui_layout` event came from, for the (currently out of scope) case of two tabs open against the same session — see Risks.

## Decisions

**1. Full-snapshot event, not a diff.**
`{ type: 'ui_layout', panes: PaneLayoutState }` carries the complete layout on every change, matching how `context_usage` and `foundation_update` already work. Layout state is small (a handful of panes, each `{ width, mode }`), so diffing would add complexity for no real payload-size benefit.

**2. Server appends directly via `harnessSession.recordingWriter.appendEvent(...)`, bypassing the `hs.events` broadcast.**
This is the one place a recorded event doesn't follow `event-streaming`'s "broadcast to every connected client" requirement, and that's intentional: pane layout is per-browser-tab UI state, not a shared fact about the agent. Concretely, `websocket.ts` gets a new `ClientMessage` case:
```ts
if (msg.type === 'ui_layout') {
  harnessSession?.recordingWriter.appendEvent({ type: 'ui_layout', panes: msg.panes })
  return
}
```
No response is sent back to the client — this is fire-and-forget from the browser's perspective, same as the writer's existing no-op-when-not-recording gate (`RecordingWriter.appendEvent` already no-ops if `current` is unset).

**3. Client sends its current layout once when recording starts, in addition to on every settled change.**
`useIntrospectSocket.ts` already exposes a `recording` boolean sourced from `recording_status` messages. The pane-layout hook (from the sibling change) watches that boolean via `useEffect`; on the `false → true` transition, it calls the same `sendUiLayout(panes)` function used for ordinary layout changes. This guarantees replay from index 0 always has a defined starting layout instead of an undefined one, without adding a second message type or server-side special-casing "first event after recording starts."

**4. `useIntrospectSocket` gains a `sendUiLayout(panes: PaneLayoutState)` export**, symmetric with existing `sendPrompt`/`startRecording`/etc. — the pane-layout hook calls it; it does nothing live-side (no local state changes, since layout is already applied optimistically/locally by the caller), it only ships the WS message.

**5. Replay-side reset.**
The existing `replay_reset` handler branch in `useIntrospectSocket.ts` gets a new line resetting pane-layout-from-replay state to an "unknown/default" value, matching how chat blocks and foundation state already reset there, before the replayed event prefix re-populates it.

## Risks / Trade-offs

- [Old recordings made before this change ships contain zero `ui_layout` events] → Replaying one should just keep whatever default layout the client starts with, not error or show a broken state — graceful degradation, not a hard requirement on old data.
- [Sending on every intermediate drag frame would flood `events.jsonl`] → Mitigated by only sending on settle (drag release / click), per the proposal.
- [Two tabs open against the same session, both resizing] → Each tab's `ui_layout` events land in the same linear recording with no per-tab attribution, so a replay would show layout "flickering" between two users' intents if that ever happens. Acceptable for now given this harness's single-user, single-focus design (see `CLAUDE.md`); worth revisiting only if multi-tab use becomes a real scenario.

## Open Questions

None — this change's scope is narrow enough (one new event type, generic replay reuse, no new server state) that everything material was resolved above.
