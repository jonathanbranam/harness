## Why

Session recordings capture every agent lifecycle event (messages, tool calls, usage) but nothing about what the user was doing in the browser. Once `redesign-introspect-ui` lands, pane layout (widths, and which pane is minimized/maximized) becomes something the user actively changes while working — replaying a recording should be able to show where the user was focused, not just what the agent did, so a review of a recorded session can reconstruct the full picture of the interaction, not only the agent side of it.

## What Changes

- New client→server WebSocket message, `ui_layout`, carrying a full snapshot of pane layout state (each pane's width/mode: normal, minimized, or maximized). The client sends this whenever a layout interaction settles (drag release, or a minimize/maximize/restore click) — not on every intermediate drag frame.
- The server appends `ui_layout` events directly to the active recording via the existing `RecordingWriter.appendEvent`, gated the same way every other recorded event already is (`isRecording()` no-op when not recording).
- **Deliberately does not** go through the existing session-wide event broadcast (`HarnessSession.events`, per `event-streaming`'s "broadcast to every connected client" requirement) — pane layout is per-browser-tab state, not a shared agent-lifecycle fact, so one tab's layout must never move another tab's panes.
- When recording starts, the client immediately sends its current layout as the first `ui_layout` event, so a replay starting at index 0 shows a defined layout instead of an unknown one.
- Replay re-emits recorded `ui_layout` events through the existing generic prefix-replay mechanism (`replay-engine.ts` already treats any non-internal event type generically — no changes needed there). The client applies `ui_layout` events to reconstruct pane state at the current replay position, including resetting and rebuilding on backward jumps (`replay_reset`), the same way chat blocks and usage state already do.

## Capabilities

### New Capabilities
- `introspect/session-recording`: recording and replaying browser-side pane-layout interactions (resize, minimize, maximize, restore) alongside the existing agent-lifecycle event recording.

## Impact

- `introspect-harness-server/src/recording-types.ts`: new `ui_layout` event shape.
- `introspect-harness-server/src/websocket.ts`: new `ClientMessage` case that appends directly to the recording writer instead of broadcasting.
- `introspect-harness-server/src/session-store.ts`: may need to expose direct recording-writer access to the socket handler for this one message type.
- `client-introspect/src/hooks/useIntrospectSocket.ts`: sends `ui_layout` on layout settle; handles incoming `ui_layout` during replay (including reset/rebuild on backward jumps).
- Depends on the `introspect/pane-layout` capability from `redesign-introspect-ui` — this change should land after (or alongside, but not before) that one, since there's no pane layout state to record until it exists.
