# AI Engineering Introspection Harness — Proposal

## 1. Overview

Build a web-based harness for **presenting and communicating** how the `pi` coding agent works. The harness visualizes pi's working memory — context window, skills, tool calls, OpenSpec artifacts, and file-system changes — but it is **not the primary development environment**. When actually building a solution, the user works in a terminal and editor. The harness's job is to **record real pi sessions, replay them as deterministic demos, and let the presenter step through them live on stage**.

A demo replay must:
- Restore files on disk to exactly what was recorded at each step.
- Play without making any LLM calls.
- Support branching/rewinding to previous states, similar to pi's `/tree` command.
- Allow the presenter to drop back into **live mode** at any point, turning the current replay state into a real pi session.

All demo work happens in a **separate sandbox workspace** that is isolated from the harness project itself.

This is a sibling project to the [deck harness](../talks/deck-harness/planning.md), but where that harness is domain-specific (live presentation editing), this one is **meta** — it is a harness for demonstrating and explaining any pi-driven project.

The design is heavily inspired by the [ADM talk's interactive framework](../track-web/docs/talks/ai-eng-dynamic/interactive-framework.md), which argued that AI-assisted development is fundamentally about moving knowledge out of volatile context-window RAM and onto durable shelves (plans and skills). The introspection harness turns that apparatus into a live, interactive system that can be recorded, replayed, and resumed.

## 2. Motivation

Three observations from recent work converge here:

1. **The ADM talk framework is correct but manual.** The context window behaves like RAM: fast, finite, and lossy. Plans on disk and skills on disk are the durable shelves. But today the only way to show this is to draw it by hand or imagine it.
2. **Live demos are risky.** A demo that calls an LLM on stage can drift, hang, or say something unexpected. A recorded, deterministic replay eliminates that risk while still showing the real sequence of events and file changes.
3. **pi already has the right primitives.** Session files, `/tree` navigation, `/fork`, and `/clone` give us a natural model for checkpoints and branching. The harness can reuse those concepts rather than inventing new ones.

The goal is to close the loop: the human builds a real solution in a terminal, the harness records it, the presenter replays it on stage, and at any interesting point the presenter can resume to live mode and continue working with the LLM.

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Sandbox Workspace** | A separate folder on disk where all demo work happens. The harness reads and writes this folder during replay; the user edits it during live mode. It is never the harness project itself. |
| **Demo Recording** | A structured, append-only log of a real pi session: events, messages, tool calls, and file-system snapshots. Captured while the user builds in a terminal. |
| **Replay Engine** | Reads a recording and reconstructs the demo state step by step. Applies file snapshots to the sandbox workspace. Emits the same events the live session emitted. Does not call the LLM. |
| **Checkpoint / Tree Node** | A stable point in the recording that the presenter can jump to, rewind to, or branch from. Maps to pi's session tree semantics. |
| **Live Mode** | A mode in which the harness runs a real `AgentSession` against the current sandbox state. The user can prompt pi and continue the session. |
| **Apparatus View** | The central visualization: context window, pinned foundation zone, plan shelf, skills shelf, gauges, and gaze marker. |
| **Tool Call Trace** | A filterable, chronological log of every tool call and result during replay or live mode. |
| **Guides** | Durable rules that constrain agent behavior. Captured during recording and visible during replay. |
| **Sensors** | Automated checks that run after tool execution or file changes. Captured during recording and visible during replay. |

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React)                                              │
│  - Apparatus view (context window, shelves, gauges)         │
│  - Demo timeline / scrubber                                 │
│  - Chat pane                                                  │
│  - Tool call trace                                          │
│  - File system diff / preview                               │
│  - OpenSpec artifact browser                                │
│  - Skills registry                                          │
│  - Guide / sensor viewer                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │ WebSocket / SSE
┌──────────────────────▼──────────────────────────────────────┐
│  Node.js web server (Hono)                                    │
│  - Auth middleware                                            │
│  - Session manager: Map<sessionId, DemoSession>             │
│  - Replay engine                                              │
│  - Live-mode agent runtime                                    │
│  - Event bus: recorded/live events → WebSocket broadcasts   │
│  - Sandbox workspace manager (snapshots + checkout)         │
│  - OpenSpec artifact indexer                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                             │
┌────────▼────────┐          ┌────────▼────────┐
│  Recording file   │          │  Sandbox folder │
│  (events +       │          │  (demo work)    │
│   snapshots)      │          │                 │
└─────────────────┘          └─────────────────┘
```

### 4.1 Server (Hono + WebSocket)

Reuse the patterns from [`docs/arch/pi-harness.md`](../arch/pi-harness.md) and [`docs/arch/track-web-architecture.md`](../arch/track-web-architecture.md):

- Hono with `@hono/node-server`
- Cookie-session auth
- `tsx watch` for dev, `tsc` build for prod
- One npm workspace: `introspect-harness-server/`
- One paired client workspace: `client-introspect/`
- Independent PM2 entry and subdomain (e.g. `introspect.branam.us`)

New server responsibilities:

1. **Demo session lifecycle**: load a recording, hold the current tree position, and manage replay/live transitions.
2. **Replay engine**: step forward/backward through the recording, apply file snapshots, and emit events.
3. **Live-mode agent runtime**: create an `AgentSession` against the current sandbox state when the presenter switches to live mode.
4. **Event bus**: forward recorded or live events to connected browser clients.
5. **Sandbox workspace manager**: snapshot and restore the sandbox folder at checkpoints.
6. **OpenSpec indexer**: discover `openspec/` roots, changes, and artifacts inside the sandbox.

### 4.2 Recording Format

A recording is a single file (e.g. `demo-recordings/<name>.jsonl`) where each line is a JSON event. Events are emitted by a small pi **recording extension** while the user builds the demo in a terminal.

```ts
// Recording event types
type RecordingEvent =
  | { type: "session_start"; timestamp: number; cwd: string; sessionFile?: string }
  | { type: "user_message"; timestamp: number; entryId: string; text: string }
  | { type: "assistant_message"; timestamp: number; entryId: string; text: string }
  | { type: "message_update"; timestamp: number; entryId: string; delta: string }
  | { type: "tool_execution_start"; timestamp: number; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_execution_end"; timestamp: number; toolCallId: string; result: unknown; isError: boolean }
  | { type: "foundation_update"; timestamp: number; skills: Skill[]; guides: Guide[]; sensors: Sensor[] }
  | { type: "checkpoint"; timestamp: number; checkpointId: string; label: string; snapshotRef: string }
  | { type: "tree_branch"; timestamp: number; entryId: string; branchFrom: string; branchTo: string }
  | { type: "context_usage"; timestamp: number; tokens: number; percentage: number }
  | { type: "fs_snapshot"; timestamp: number; snapshotRef: string; manifest: FsManifest };
```

File snapshots are stored separately (e.g. `demo-recordings/<name>/snapshots/<ref>.tar` or a content-addressed store) and referenced by `snapshotRef`. A snapshot captures the entire sandbox folder at a checkpoint.

### 4.3 Recording Extension

A pi extension that the user loads in their terminal pi session while working in the sandbox folder:

```
.pi/extensions/demo-recorder.ts
```

It subscribes to the same lifecycle events the harness visualizes and writes them to the recording file. It also triggers file snapshots at natural boundaries:

- Before/after each user prompt (`before_agent_start`, `agent_settled`)
- At each `/tree` or `/fork` action
- On explicit `/demo-checkpoint <label>` command

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (event, ctx) => {
    recorder.write({ type: "session_start", cwd: ctx.cwd, sessionFile: ctx.sessionManager.getSessionFile() });
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const snapshotRef = await snapshotWorkspace(ctx.cwd);
    recorder.write({ type: "fs_snapshot", snapshotRef });
  });

  pi.on("message_update", async (event, ctx) => {
    recorder.write({ type: "message_update", delta: extractText(event) });
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    recorder.write({ type: "tool_execution_end", result: event.result, isError: event.isError });
  });

  pi.on("agent_settled", async (event, ctx) => {
    const snapshotRef = await snapshotWorkspace(ctx.cwd);
    recorder.write({ type: "fs_snapshot", snapshotRef });
  });

  pi.registerCommand("demo-checkpoint", {
    description: "Save a named checkpoint in the demo recording",
    handler: async (args, ctx) => {
      const snapshotRef = await snapshotWorkspace(ctx.cwd);
      recorder.write({ type: "checkpoint", checkpointId: generateId(), label: args, snapshotRef });
    },
  });
}
```

The extension is intentionally minimal: it records, it does not visualize. Visualization happens in the harness.

### 4.4 Replay Engine

The replay engine is server-side. Given a recording and a target event index, it:

1. Finds the nearest preceding `fs_snapshot` event.
2. Restores that snapshot into the sandbox folder.
3. Replays any subsequent `tool_execution_*` events by re-applying their effects from the next snapshot (if any), or by replaying the recorded file diffs.

Because file snapshots are taken at boundaries, the replay engine can always restore exact disk state without re-executing tools.

The engine emits events to the browser at presenter-controlled speed or on explicit advance. It never calls the LLM.

### 4.5 Live Mode Transition

At any checkpoint or replay position, the presenter can click **Go Live**. The server:

1. Restores the sandbox folder to the current replay state.
2. Creates a new `AgentSession` (or resumes the recorded session file if available) with that folder as `cwd`.
3. Switches the UI from replay to live mode: new messages stream from the real LLM, new tool calls execute, and new events are recorded into a **new branch** of the demo.

This is analogous to pi's `/fork` or `/clone`: the demo branches from a recorded state into a live session.

## 5. Frontend Design

The UI is organized into panes that map to the ADM talk apparatus, plus presentation controls.

### 5.1 Apparatus view (center stage)

A persistent, live-updating diagram:

- **Context window** — vertical container.
  - **Pinned foundation zone** at the bottom: system prompt, loaded skills, active guides, active sensors.
  - **Scroll zone** above it: chat blocks enter from the top and push downward.
  - **Middle danger zone**: highlighted to show where blocks are most likely to be lost.
- **Context gauge** — fill percentage of the current model's context window.
- **Token / cost counter** — running total for the session.
- **Plan shelf** — OpenSpec artifacts (proposal, specs, design, tasks) as durable cards.
- **Skills shelf** — loaded skills as cards.
- **Gaze marker** — indicates where the human's attention is currently pointed: app/output, plan, code, skills, or sensors.

### 5.2 Demo timeline / scrubber

A horizontal timeline showing:
- Checkpoints as labeled markers.
- Tree branches as diverging lines.
- Current playback position.
- Controls: previous, next, jump to checkpoint, play/pause, go live.

### 5.3 Chat pane

Standard streaming chat:
- User messages and assistant responses.
- Inline tool call cards (expandable).
- During replay, messages appear as they were recorded.
- During live mode, new messages stream in.

### 5.4 Tool call trace

A filterable, chronological list of every tool call:
- Tool name, input, output, duration, success/error.
- Links to the file(s) touched.
- Block reasons from guides or permission gates.

### 5.5 File system mirror / diff

- Tree view of the sandbox folder.
- Highlight files changed during the current step.
- Diff view for text files against the previous checkpoint.
- Read-only by default; edits require entering live mode.

### 5.6 OpenSpec artifact browser

- List changes in the sandbox's OpenSpec workspace.
- Show each change's artifacts and status.
- Render artifact contents.

### 5.7 Guide / sensor viewer

- Display active guides and sensors loaded from the recording.
- During live mode, allow toggling guides/sensors and authoring new ones.

## 6. Guides and Sensors

Guides and sensors are still part of the harness, but their role is slightly different in a demo context:

- **Guides** are durable rules that were active during the recorded session. They explain *why* the agent behaved the way it did.
- **Sensors** are checks that fired during the recorded session. They explain *what* got caught.
- During **live mode**, the presenter can author new guides or sensors, and those changes are recorded into the new branch.

The feedback loop from the original proposal still applies, but it is now something the presenter can narrate: "Here the sensor flagged CSV persistence, so I wrote this guide, and on the next run the agent avoided it."

## 7. Data Model

### 7.1 Server-side state

```ts
interface DemoSession {
  sessionId: string;
  mode: "replay" | "live";
  recordingPath: string;
  sandboxPath: string;
  currentEventIndex: number;
  currentCheckpointId?: string;
  agentSession?: AgentSession; // only in live mode
  clients: Set<WebSocket>;
}
```

### 7.2 Recording index

```ts
interface RecordingHeader {
  name: string;
  createdAt: number;
  sandboxPath: string; // original path, remapped at load time
  eventCount: number;
  checkpoints: Checkpoint[];
}

interface Checkpoint {
  id: string;
  label: string;
  eventIndex: number;
  snapshotRef: string;
}
```

### 7.3 Sandbox workspace manager

```ts
interface WorkspaceSnapshot {
  ref: string;
  createdAt: number;
  // content-addressed archive or git-like object store
}

async function restoreSnapshot(sandboxPath: string, ref: string): Promise<void>;
async function createSnapshot(sandboxPath: string): Promise<string>;
```

## 8. Security and Safety

| Layer | Implementation |
|---|---|
| Sandbox isolation | Demo work happens in a dedicated folder, never the harness project root. |
| Path jail | Server refuses to read or write outside the configured sandbox path. |
| Tool allowlist | `tools: [...]` in `createAgentSession` during live mode. |
| Static blocklist | Permission gate blocks dangerous bash patterns during live mode. |
| Replay safety | Replay only restores snapshots and emits recorded events; it cannot execute new bash commands. |
| Auth | Cookie-session auth gates all routes and WebSocket upgrade. |
| Process isolation | Runs as its own PM2 app and subdomain, not inside track-web. |

Important caveats:
- Live mode can execute arbitrary code in the sandbox. The sandbox should be treated as untrusted relative to the harness server.
- Recordings may contain sensitive file contents. Store and transmit them carefully.

## 9. Implementation Phases

### Phase 1: Recording extension and replay scaffold

- [ ] Create `introspect-harness-server/` and `client-introspect/` workspaces.
- [ ] Write the pi **recording extension** (`demo-recorder.ts`) that captures lifecycle events and file snapshots to a recording file.
- [ ] Build a minimal **replay engine** that can load a recording and restore the sandbox to any checkpoint.
- [ ] Build a minimal UI that shows the event log and current sandbox file tree.
- [ ] Verify end-to-end: record a short terminal pi session, load it in the harness, and step through it.

### Phase 2: Apparatus visualization

- [ ] Render the context window with pinned foundation zone and scroll zone.
- [ ] Add context gauge, token/cost counter, plan shelf, skills shelf, and gaze marker.
- [ ] Wire replay events to update the apparatus in real time as the presenter steps forward.

### Phase 3: Timeline, checkpoints, and tree navigation

- [ ] Build the demo timeline / scrubber UI.
- [ ] Support jumping to checkpoints and stepping backward/forward.
- [ ] Support branching: from any checkpoint, create a new recording branch.
- [ ] Integrate with pi's `/tree`-like semantics.

### Phase 4: Live mode

- [ ] Implement "Go Live" from any replay position.
- [ ] Create/resume an `AgentSession` in the restored sandbox state.
- [ ] Stream live events into the same apparatus UI.
- [ ] Record the live branch back into the demo recording.

### Phase 5: Guides, sensors, and OpenSpec integration

- [ ] Load and display active guides and sensors from the recording.
- [ ] During live mode, allow authoring new guides/sensors and recording their effects.
- [ ] Index and display OpenSpec artifacts from the sandbox.

### Phase 6: Hardening and polish

- [ ] Add session timeouts and rate limiting.
- [ ] Add recording import/export and session replay validation.
- [ ] Review replay determinism: same recording → same visible state, every time.
- [ ] Write deployment runbook.

## 10. Files to Create

```
docs/introspect-harness/
├── proposal.md                 # This file
└── (future)
    ├── architecture-diagram.png
    ├── api-spec.md
    ├── recording-format.md
    └── runbook.md

introspect-harness-server/
├── src/
│   ├── index.ts                # Hono entry
│   ├── session-store.ts        # Map<sessionId, DemoSession>
│   ├── websocket.ts            # WebSocket handler + event broadcast
│   ├── auth-middleware.ts      # cookie/session auth
│   ├── replay-engine.ts        # recording loading + stepping
│   ├── workspace-manager.ts    # sandbox snapshots and checkout
│   ├── live-mode.ts            # AgentSession creation/resumption
│   ├── openspec-indexer.ts     # OpenSpec workspace scanner
│   └── pi-extensions/
│       └── permission-gate.ts  # only used in live mode
├── demo-recordings/            # default storage for recordings
├── package.json
└── tsconfig.json

client-introspect/
├── src/
│   ├── App.tsx
│   ├── ApparatusView.tsx
│   ├── DemoTimeline.tsx
│   ├── ChatPanel.tsx
│   ├── ToolCallTrace.tsx
│   ├── FileSystemMirror.tsx
│   ├── OpenSpecBrowser.tsx
│   ├── SkillsRegistry.tsx
│   ├── GuideSensorViewer.tsx
│   └── api.ts
├── index.html
├── package.json
└── vite.config.ts

.pi/extensions/demo-recorder.ts   # Installed into the sandbox project
.pi/guides/                       # Active guides (in sandbox project)
.pi/sensors/                      # Active sensors (in sandbox project)
```

## 11. Relationship to Other Work

- **[`docs/arch/pi-harness.md`](../arch/pi-harness.md)** — explains why harnesses should be separate deployables from track-web, and what to reuse from track-web. This project follows that advice.
- **[`docs/talks/deck-harness/planning.md`](../talks/deck-harness/planning.md)** — the first concrete harness (presentation editing). This introspection harness generalizes its WebSocket/event-streaming pattern and adds recording/replay.
- **[`../track-web/docs/talks/ai-eng-dynamic/interactive-framework.md`](../track-web/docs/talks/ai-eng-dynamic/interactive-framework.md)** — the conceptual source. The introspection harness is the interactive framework made real and replayable.
- **OpenSpec skills in `.agents/skills/`** — the workflow this harness will visualize and constrain. The harness reads OpenSpec artifacts from the sandbox and can author guides that reference OpenSpec capabilities.

## 12. Open Questions

1. Should the recording extension be distributed as a pi package, or just a file the user copies into their sandbox project?
2. Should file snapshots use tar archives, a content-addressed object store, or git snapshots?
3. Should the harness support multiple concurrent demo sessions, or one active demo at a time?
4. How should live mode handle model credentials — use the harness server's configured model, or require the presenter to provide them?
5. Should the recording capture the full session file so `/resume` works, or only the events needed for replay?
6. Should checkpoints be inserted automatically at every user prompt, or only on explicit `/demo-checkpoint`?
7. How should the harness handle a sandbox folder that already has uncommitted changes when a recording is loaded?

## 13. Next Step

If this direction feels right, the next step is to approve the proposal and move to **Phase 1** — a minimal recording extension plus replay scaffold. That prototype will validate the two hardest new pieces (capturing a real terminal pi session and restoring exact sandbox state) before committing to the full apparatus UI.
