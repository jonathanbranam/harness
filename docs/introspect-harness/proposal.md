# AI Engineering Introspection Harness — Proposal

## 1. Overview

Build a web-based harness that runs the `pi` coding agent in-process behind a browser UI, with a single purpose: **make the agent's working memory visible, constrainable, and replayable**. The harness visualizes the context window, skills, tool calls, OpenSpec artifacts, and file-system changes in real time. It lets the human author **guides** (rules that constrain future code) and **sensors** (checks that detect drift after code is written). It also lets the user **record** any live session and **replay** it deterministically, navigate the recording's tree, branch from any point, and drop back into **live** mode to continue experimenting or to record a new session.

This is a sibling project to the [deck harness](../talks/deck-harness/planning.md), but where that harness is domain-specific (live presentation editing), this one is **meta** — it is a harness for understanding, improving, and presenting any pi-driven project.

The design is heavily inspired by the [ADM talk's interactive framework](../track-web/docs/talks/ai-eng-dynamic/interactive-framework.md), which argued that AI-assisted development is fundamentally about moving knowledge out of volatile context-window RAM and onto durable shelves (plans and skills). The introspection harness turns that apparatus into a live, interactive system that can be recorded, replayed, branched, and resumed.

## 2. Motivation

Four observations from recent work converge here:

1. **The ADM talk framework is correct but manual.** The context window behaves like RAM: fast, finite, and lossy. Plans on disk and skills on disk are the durable shelves. But today the only way to show this is to draw it by hand or imagine it.
2. **A web UI is the best way to design the demo.** The presenter needs to see exactly what the audience will see. Iterating in the web UI — with a live LLM, real tool calls, and real file changes — lets the presenter refine the story before recording.
3. **Live demos are risky.** A demo that calls an LLM on stage can drift, hang, or say something unexpected. A recorded, deterministic replay eliminates that risk while still showing the real sequence of events and file changes.
4. **pi already has the right primitives.** Session files, `/tree` navigation, `/fork`, and `/clone` give us a natural model for checkpoints and branching. The harness can reuse those concepts rather than inventing new ones.

The goal is to close the loop: the human builds and refines a demo in the web UI, records it, replays it on stage, branches or rewinds as needed, and resumes to live mode at any point.

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Sandbox Workspace** | A separate folder on disk where all demo work happens. The harness reads and writes this folder during live and replay modes. It is never the harness project itself. |
| **Live Session** | A real `AgentSession` running in the harness server, streaming events to the browser, executing tools against the sandbox workspace, and optionally being recorded. |
| **Recording** | A structured log of a live session: events, messages, tool calls, and file-system snapshots. Multiple recordings can exist for the same sandbox. |
| **Replay Session** | A session that reads a recording and reconstructs the demo state step by step. Applies file snapshots to the sandbox workspace. Emits the same events the live session emitted. Does not call the LLM. |
| **Checkpoint / Tree Node** | A stable point in a session or recording that the user can jump to, rewind to, or branch from. Maps to pi's session tree semantics. |
| **Branch** | A new live session that starts from a replay checkpoint (or from another live session's checkpoint) and can itself be recorded. |
| **Apparatus View** | The central visualization: context window, pinned foundation zone, plan shelf, skills shelf, gauges, and gaze marker. |
| **Tool Call Trace** | A filterable, chronological log of every tool call and result during live or replay mode. |
| **Guides** | Durable rules that constrain agent behavior. Authored in the UI, persisted to disk, loaded into the foundation zone. |
| **Sensors** | Automated checks that run after tool execution or file changes. Authored in the UI, persisted to disk, loaded at runtime. |

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React)                                              │
│  - Apparatus view (context window, shelves, gauges)         │
│  - Session timeline / scrubber                                │
│  - Chat pane                                                  │
│  - Tool call trace                                          │
│  - File system diff / preview                               │
│  - OpenSpec artifact browser                                │
│  - Skills registry                                          │
│  - Guide / sensor editor                                    │
│  - Record / replay / live controls                          │
└──────────────────────┬──────────────────────────────────────┘
                       │ WebSocket / SSE
┌──────────────────────▼──────────────────────────────────────┐
│  Node.js web server (Hono)                                    │
│  - Auth middleware                                            │
│  - Session manager: Map<sessionId, HarnessSession>            │
│  - Live agent runtime (AgentSession)                          │
│  - Replay engine                                              │
│  - Event bus: recorded/live events → WebSocket broadcasts     │
│  - File system watcher                                        │
│  - Sandbox workspace manager (snapshots + checkout)           │
│  - OpenSpec artifact indexer                                  │
│  - Guide / sensor registry                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │ in-process
┌──────────────────────▼──────────────────────────────────────┐
│  pi SDK                                                       │
│  - createAgentSession                                         │
│  - ModelRuntime                                               │
│  - SessionManager                                             │
│  - Introspection extension (captures & constrains)            │
│  - Permission-gate extension                                  │
└──────────────────────────────────────────────────────────────┘
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

1. **Harness session lifecycle**: create, hold, and destroy `HarnessSession` objects. A harness session can be in **live** or **replay** mode.
2. **Live agent runtime**: create an `AgentSession` against the sandbox folder, forward browser prompts to `session.prompt()`, and stream pi events to the browser.
3. **Replay engine**: load a recording, step through events, restore file snapshots, and emit events to the browser.
4. **Recording writer**: when recording is enabled, persist events and file snapshots to a recording file.
5. **Event bus**: forward live or replayed events to connected browser clients.
6. **Sandbox workspace manager**: snapshot and restore the sandbox folder at checkpoints.
7. **OpenSpec indexer**: discover `openspec/` roots, changes, and artifacts inside the sandbox.
8. **Guide/sensor registry**: load guides and sensors from disk, feed them to the extension, and let the UI edit them.

### 4.2 Harness Session State

```ts
interface HarnessSession {
  sessionId: string;
  mode: "live" | "replay";
  sandboxPath: string;
  clients: Set<WebSocket>;

  // Live mode
  agentSession?: AgentSession;
  recordingWriter?: RecordingWriter;
  isRecording: boolean;

  // Replay mode
  recordingPath?: string;
  replayEngine?: ReplayEngine;
  currentEventIndex: number;
}
```

### 4.3 Recording Format

A recording is a single file (e.g. `demo-recordings/<name>.jsonl`) where each line is a JSON event. Events are captured by the introspection extension during live mode.

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

### 4.4 Introspection Extension

The extension is the bridge between pi and the harness during live mode. It lives at:

```
introspect-harness-server/src/pi-extensions/introspection-bridge.ts
```

It does four things:

1. **Capture**: subscribe to every relevant lifecycle event and forward it to the server.
2. **Record**: when recording is enabled, write events and snapshots to the recording file.
3. **Enforce guides**: at `before_agent_start` and `tool_call`, load active guides and apply them.
4. **Run sensors**: at `tool_execution_end` and `agent_settled`, run sensors against changed files and tool results.

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (event, ctx) => {
    emitToServer({ type: "session_start", event, cwd: ctx.cwd });
  });

  pi.on("message_update", async (event, ctx) => {
    emitToServer({ type: "message_update", event, usage: ctx.getContextUsage() });
  });

  pi.on("tool_execution_start", async (event) => {
    emitToServer({ type: "tool_execution_start", event });
  });

  pi.on("tool_call", async (event, ctx) => {
    const guideResult = await applyGuides(event, ctx);
    if (guideResult.block) {
      return { block: true, reason: guideResult.reason };
    }
    emitToServer({ type: "tool_call", event, blocked: false });
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    const sensorReports = await runSensors(event, ctx);
    emitToServer({ type: "sensor_reports", reports: sensorReports });
    emitToServer({ type: "tool_execution_end", event });
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const activeGuides = await loadActiveGuides(ctx.cwd);
    const activeSensors = await loadActiveSensors(ctx.cwd);
    emitToServer({ type: "foundation_update", guides: activeGuides, sensors: activeSensors });
  });

  pi.on("agent_settled", async (event, ctx) => {
    if (isRecording()) {
      const snapshotRef = await snapshotWorkspace(ctx.cwd);
      recorder.write({ type: "fs_snapshot", snapshotRef });
    }
  });
}
```

The extension runs with the server's full privileges, so it is paired with a permission-gate extension for `bash`/`write`/`edit` approval.

### 4.5 Replay Engine

The replay engine is server-side. Given a recording and a target event index, it:

1. Finds the nearest preceding `fs_snapshot` event.
2. Restores that snapshot into the sandbox folder.
3. Replays any subsequent `tool_execution_*` events by re-applying their effects from the next snapshot (if any), or by replaying the recorded file diffs.

Because file snapshots are taken at boundaries, the replay engine can always restore exact disk state without re-executing tools.

The engine emits events to the browser at user-controlled speed or on explicit advance. It never calls the LLM.

### 4.6 Live Mode from Replay

At any checkpoint or replay position, the user can click **Go Live**. The server:

1. Restores the sandbox folder to the current replay state.
2. Creates a new `AgentSession` with that folder as `cwd`.
3. Switches the harness session to live mode: new messages stream from the real LLM, new tool calls execute, and new events can be recorded into a new or extended recording.

This is analogous to pi's `/fork` or `/clone`: the demo branches from a recorded state into a live session.

## 5. Frontend Design

The UI is organized into panes that map to the ADM talk apparatus, plus session controls.

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

### 5.2 Session timeline / scrubber

A horizontal timeline showing:
- Checkpoints as labeled markers.
- Tree branches as diverging lines.
- Current playback position.
- Controls: previous, next, jump to checkpoint, play/pause, go live, record.

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
- Read-only during replay; editable during live mode.

### 5.6 OpenSpec artifact browser

- List changes in the sandbox's OpenSpec workspace.
- Show each change's artifacts and status.
- Render artifact contents.

### 5.7 Guide / sensor editor

A small rule-authoring UI:
- Create a new guide or sensor.
- Edit Markdown/YAML frontmatter.
- Test against the last tool call or file change.
- Save to disk so it loads into future contexts.

## 6. Guides and Sensors

This is the core feedback loop. The harness does not just visualize; it lets the human improve the harness itself.

### 6.1 Guides

A **guide** is a durable rule that constrains future behavior. It is stored on disk (e.g. `.pi/guides/no-pandas-mutation.md`) and loaded into the pinned foundation zone on every session start.

Example guide:

```markdown
---
name: no-pandas-mutation
scope: tool_call
trigger: bash | write | edit
---

Do not mutate pandas DataFrames in place. If you need to transform data,
create a new DataFrame and return it. Prefer explicit persistence layers
over in-memory dataframe state.
```

The introspection extension applies guides:
- **System prompt scope**: append the guide text to the system prompt.
- **Tool call scope**: evaluate the guide against the tool call and optionally block it.
- **Input scope**: transform or annotate user input before the agent starts.

### 6.2 Sensors

A **sensor** is a post-hoc check that runs after a tool executes or after a turn ends. It inspects tool results and file changes and produces a report.

Example sensor:

```markdown
---
name: detect-csv-persistence
scope: file_change
pattern: "*.py"
---

Check that Python files do not read/write CSV as the primary persistence
mechanism. If a file uses `pd.read_csv` or `to_csv` for state that should
survive restarts, flag it and suggest a document store or SQLite.
```

Sensors can be:
- **Static**: regex, AST, or simple file-content checks.
- **Dynamic**: run tests, type-check, or lint and report results.
- **Model-backed**: ask a small model to review a diff for a specific smell.

Sensor reports appear in the UI as cards with pass/fail status and evidence.

### 6.3 The feedback loop

```
agent writes code → sensor flags issue
                          ↓
human reviews diff + sensor report
                          ↓
human authors guide or improves sensor
                          ↓
guide/sensor lands on skills shelf or sensor registry
                          ↓
next context loads it → next diff is better
```

This is the ADM talk's Stage 3 made concrete and repeatable.

## 7. Data Model

### 7.1 Server-side state

```ts
interface HarnessSession {
  sessionId: string;
  mode: "live" | "replay";
  sandboxPath: string;
  clients: Set<WebSocket>;
  eventLog: HarnessEvent[];

  // Live mode
  agentSession?: AgentSession;
  recordingWriter?: RecordingWriter;
  isRecording: boolean;

  // Replay mode
  recordingPath?: string;
  replayEngine?: ReplayEngine;
  currentEventIndex: number;
}

interface HarnessEvent {
  id: string;
  timestamp: number;
  type: string;
  payload: unknown;
}
```

### 7.2 Recording index

```ts
interface RecordingHeader {
  name: string;
  createdAt: number;
  sandboxPath: string;
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

### 7.4 Guide / sensor schema

```ts
interface Guide {
  id: string;
  name: string;
  scope: "system_prompt" | "tool_call" | "input";
  trigger?: string; // e.g. "bash" or "*.tsx"
  content: string;
  enabled: boolean;
}

interface Sensor {
  id: string;
  name: string;
  scope: "tool_result" | "file_change" | "turn_end";
  pattern?: string;
  command?: string;
  content?: string;
  enabled: boolean;
}
```

## 8. Security and Safety

| Layer | Implementation |
|---|---|
| Sandbox isolation | Demo work happens in a dedicated folder, never the harness project root. |
| Path jail | Server refuses to read or write outside the configured sandbox path. |
| Tool allowlist | `tools: [...]` in `createAgentSession` during live mode. |
| Static blocklist | Permission gate blocks dangerous bash patterns during live mode. |
| Interactive approval | Permission gate pauses `bash`/`write`/`edit` for browser approval during live mode. |
| Guide enforcement | Introspection extension blocks tool calls that violate active guides. |
| Replay safety | Replay only restores snapshots and emits recorded events; it cannot execute new bash commands. |
| Auth | Cookie-session auth gates all routes and WebSocket upgrade. |
| Process isolation | Runs as its own PM2 app and subdomain, not inside track-web. |

Important caveats:
- Live mode can execute arbitrary code in the sandbox. The sandbox should be treated as untrusted relative to the harness server.
- Recordings may contain sensitive file contents. Store and transmit them carefully.
- Extensions run with the server's full privileges.

## 9. Implementation Phases

### Phase 1: Live event capture and basic apparatus

- [ ] Create `introspect-harness-server/` and `client-introspect/` workspaces.
- [ ] Set up Hono server with WebSocket endpoint and cookie-session auth.
- [ ] Create `AgentSession` lifecycle: create, prompt, destroy.
- [ ] Write `introspection-bridge.ts` extension that captures all lifecycle events and forwards them to the server.
- [ ] Build the apparatus view: context window, foundation zone, gauge, token counter.
- [ ] Verify end-to-end: a prompt in the browser streams events and updates the apparatus.

### Phase 2: Recording and replay scaffold

- [ ] Implement file snapshotting for the sandbox workspace.
- [ ] Add recording writer that captures events and snapshots during live mode.
- [ ] Build replay engine that can load a recording and restore the sandbox to any checkpoint.
- [ ] Add session timeline UI with play/pause/step controls.
- [ ] Verify: record a short live session, replay it, and see the same apparatus state.

### Phase 3: Tree navigation and branching

- [ ] Support checkpoints during live and replay modes.
- [ ] Build tree navigation: jump to any checkpoint, step backward/forward.
- [ ] Implement branching: from any checkpoint, start a new live session.
- [ ] Record branches as separate or extended recordings.

### Phase 4: OpenSpec, skills, guides, and sensors

- [ ] Index the OpenSpec workspace inside the sandbox.
- [ ] Render the plan shelf with OpenSpec artifacts.
- [ ] Load and display the skills shelf from pi's `resources_discover` event.
- [ ] Add guide/sensor editor and registry.
- [ ] Close the loop: sensor finds issue → human writes guide → next context loads it.

### Phase 5: Tool call trace, approval, and file system mirror

- [ ] Build the tool call trace pane with filtering and search.
- [ ] Add the permission-gate extension with browser-mediated approval.
- [ ] Show block reasons and approval dialogs in the UI.
- [ ] Add the file system mirror with change highlighting and diff view.

### Phase 6: Hardening and polish

- [ ] Add session timeouts and rate limiting.
- [ ] Add recording import/export and replay validation.
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
│   ├── session-store.ts        # Map<sessionId, HarnessSession>
│   ├── websocket.ts            # WebSocket handler + event broadcast
│   ├── auth-middleware.ts      # cookie/session auth
│   ├── replay-engine.ts        # recording loading + stepping
│   ├── recording-writer.ts     # recording creation + append
│   ├── workspace-manager.ts    # sandbox snapshots and checkout
│   ├── live-mode.ts            # AgentSession creation/resumption
│   ├── openspec-indexer.ts     # OpenSpec workspace scanner
│   ├── guide-registry.ts       # guide load/apply logic
│   ├── sensor-registry.ts      # sensor load/run logic
│   └── pi-extensions/
│       ├── introspection-bridge.ts
│       └── permission-gate.ts
├── demo-recordings/            # default storage for recordings
├── package.json
└── tsconfig.json

client-introspect/
├── src/
│   ├── App.tsx
│   ├── ApparatusView.tsx
│   ├── SessionTimeline.tsx
│   ├── ChatPanel.tsx
│   ├── ToolCallTrace.tsx
│   ├── FileSystemMirror.tsx
│   ├── OpenSpecBrowser.tsx
│   ├── SkillsRegistry.tsx
│   ├── GuideSensorEditor.tsx
│   └── api.ts
├── index.html
├── package.json
└── vite.config.ts

.pi/guides/                     # Active guides (in sandbox project)
.pi/sensors/                    # Active sensors (in sandbox project)
```

## 11. Relationship to Other Work

- **[`docs/arch/pi-harness.md`](../arch/pi-harness.md)** — explains why harnesses should be separate deployables from track-web, and what to reuse from track-web. This project follows that advice.
- **[`docs/talks/deck-harness/planning.md`](../talks/deck-harness/planning.md)** — the first concrete harness (presentation editing). This introspection harness generalizes its WebSocket/event-streaming pattern and adds recording/replay/branching.
- **[`../track-web/docs/talks/ai-eng-dynamic/interactive-framework.md`](../track-web/docs/talks/ai-eng-dynamic/interactive-framework.md)** — the conceptual source. The introspection harness is the interactive framework made real and replayable.
- **OpenSpec skills in `.agents/skills/`** — the workflow this harness will visualize and constrain. The harness reads OpenSpec artifacts from the sandbox and can author guides that reference OpenSpec capabilities.

## 12. Open Questions

1. Should file snapshots use tar archives, a content-addressed object store, or git snapshots inside the sandbox?
2. Should the harness support multiple concurrent harness sessions, or one active demo session at a time?
3. How should live mode handle model credentials — use the harness server's configured model, or require the presenter to provide them?
4. Should checkpoints be inserted automatically at every user prompt, or only on explicit user action?
5. How should the harness handle a sandbox folder that already has uncommitted changes when a recording is loaded?
6. Should model-backed sensors be allowed, or should sensors be restricted to fast, deterministic checks?
7. What is the minimum viable guide/sensor authoring format — Markdown frontmatter, YAML, or a structured form in the UI?

## 13. Next Step

If this direction feels right, the next step is to approve the proposal and move to **Phase 1** — a minimal live event-capture prototype that streams pi lifecycle events to a browser and renders them in the apparatus view. That prototype will validate the hardest new pieces (WebSocket event forwarding, in-process `AgentSession`, and the introspection extension) before committing to recording/replay and the full UI surface.
