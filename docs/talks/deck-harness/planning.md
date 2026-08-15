# Deck Harness: Project Plan

## Overview

Build a web-backed pi coding-agent harness that lets a user chat with pi from a browser to collaboratively edit a live presentation deck. The user and pi share the same editor state: the user can select objects and type natural-language requests, and pi can invoke tools to update the deck in real time.

Example interactions:

- "Lay these out in a horizontal grid"
- "Resize the font to fit the text inside the box bounds"
- "Highlight all text blocks that contain the text 'server' in red"

The harness is **single-user (the owner)**, authenticated, and runs behind a web server. It uses the pi SDK directly so the agent runtime, tool execution, and event streaming all happen in-process.

---

## Goals

1. Run pi inside a Node.js web server with full tool-call access.
2. Expose a chat UI in the browser that streams pi events (text, tool calls, results).
3. Add custom presentation-editing tools that pi can call to modify a live deck.
4. Keep pi informed of the user's selection and deck changes.
5. Add defensive permission gates and tool allowlists for safety.
6. Use skills and system prompts so the model reliably uses the new tools.

---

## Architecture

```
┌─────────────────────────────┐
│  Browser (React/Vue/Svelte) │
│  - Chat panel               │
│  - Deck canvas              │
│  - Selection state          │
└──────────────┬──────────────┘
               │ WebSocket / SSE
┌──────────────▼──────────────┐
│  Node.js web server (Hono) │
│  - Auth middleware          │
│  - Session manager          │
│  - pi AgentSession          │
│  - Permission-gate ext      │
│  - Presentation-bridge ext    │
└──────────────┬──────────────┘
               │ in-process
┌──────────────▼──────────────┐
│  pi SDK                     │
│  - createAgentSession       │
│  - ModelRuntime             │
│  - SessionManager           │
│  - Extensions / tools       │
└─────────────────────────────┘
```

### Why the SDK instead of RPC mode?

- **Simpler lifecycle**: one `AgentSession` per chat session, no child-process management.
- **Direct event streaming**: subscribe to `message_update`, `tool_execution_*`, etc. and forward to the browser.
- **Custom tools/extensions** run in-process with full access to the server's context.
- **Better type safety** and easier debugging.

RPC mode is a fallback if we ever need language-agnostic clients or stronger process isolation.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Web server | Hono (Node.js) |
| Real-time transport | WebSocket (preferred) or SSE |
| Frontend | React 19 + existing repo patterns (Vite) |
| Agent runtime | `@earendil-works/pi-coding-agent` SDK |
| Schema | `typebox` |
| Auth | Existing repo auth (cookie session) |
| Deck state | In-memory store + WebSocket broadcast |

---

## Core components

### 1. Web server (`server/src/deck-harness.ts` or new workspace `deck-harness-server/`)

Responsibilities:

- Authenticate requests.
- Maintain a map of `sessionId -> AgentSession`.
- Forward browser messages to `session.prompt()`.
- Forward pi events to the browser via WebSocket.
- Serve the frontend SPA.

```ts
import { Hono } from "hono";
import { createAgentSession, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";

const app = new Hono();
const modelRuntime = await ModelRuntime.create();
const sessions = new Map<string, AgentSession>();

async function getOrCreateSession(sessionId: string, cwd: string) {
  let session = sessions.get(sessionId);
  if (session) return session;

  const { session: s } = await createAgentSession({
    modelRuntime,
    sessionManager: SessionManager.inMemory(cwd),
    cwd,
    tools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
    // customTools and resourceLoader added below
  });

  session = s;
  sessions.set(sessionId, session);
  return session;
}
```

### 2. Permission-gate extension

Extension file: `server/src/pi-extensions/permission-gate.ts`

Purposes:

- Hard block obviously dangerous commands (`rm -rf`, `mkfs`, `dd`, etc.).
- Restrict writes to the project working directory.
- Require interactive approval for destructive or outside-scope operations.
- In a web context, approval is routed through the WebSocket to the browser UI.

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

const DANGEROUS_BASH = /\b(rm\s+-rf|mkfs|dd\s+if=|>:?\s*\/dev\/|curl\s+.*\|\s*sh)\b/;

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    // 1. Static blocklist
    if (event.toolName === "bash" && isToolCallEventType("bash", event)) {
      if (DANGEROUS_BASH.test(event.input.command)) {
        return { block: true, reason: "Dangerous command blocked by policy", terminate: true };
      }
    }

    // 2. Path jail: writes must stay inside cwd
    if (["write", "edit"].includes(event.toolName)) {
      const path = (event.input as { path: string }).path;
      const resolved = await import("node:path").then(p => p.resolve(path));
      const cwd = await import("node:path").then(p => p.resolve(ctx.cwd));
      if (!resolved.startsWith(cwd + "/")) {
        return { block: true, reason: `Writes outside project root not allowed: ${path}` };
      }
    }

    // 3. Interactive approval for bash/write/edit
    if (["bash", "write", "edit"].includes(event.toolName)) {
      const approved = await requestApprovalFromBrowser(event);
      if (!approved) {
        return { block: true, reason: "Denied by user" };
      }
    }
  });
}
```

For web approval, the extension should emit a custom event and await a promise that the server resolves when the user clicks **Approve** in the browser. See the "Approval flow" section below.

### 3. Presentation-bridge extension

Extension file: `server/src/pi-extensions/presentation-bridge.ts`

This extension registers tools that let pi read and modify the live deck. It acts as a bridge to the editor's state API.

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const EDITOR_API = "http://localhost:3001/api/editor";

async function callEditor(method: string, body: unknown) {
  const res = await fetch(`${EDITOR_API}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Editor API ${method} failed: ${res.status}`);
  return res.json();
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "presentation_get_state",
    label: "Get Presentation State",
    description: `Get the current presentation state, including all objects, their IDs, bounds, text content, styling, and the current selection. Use this whenever you need to reason about the deck before making changes.`,
    parameters: Type.Object({}),
    execute: async () => {
      const state = await callEditor("getState", {});
      return {
        content: [{ type: "text", text: JSON.stringify(state, null, 2) }],
        details: state,
      };
    },
  });

  pi.registerTool({
    name: "presentation_update",
    label: "Update Presentation",
    description: `Modify objects in the live presentation editor. Use when the user asks to change layout, styling, or content of slides.

Available actions:
- setPosition: { x?: number, y?: number, dx?: number, dy?: number }
- setSize: { width?: number, height?: number }
- setText: { text: string }
- setFillColor: { color: string } (hex, e.g. "#ff0000")
- setFontSize: { fontSize: number } (points)
- applyGridLayout: { direction: "horizontal" | "vertical", gap?: number }

Always prefer the most specific action. If multiple objects are selected and the user asks to lay them out, use applyGridLayout.`,
    parameters: Type.Object({
      action: Type.StringEnum([
        "setPosition",
        "setSize",
        "setText",
        "setFillColor",
        "setFontSize",
        "applyGridLayout",
      ]),
      targetIds: Type.Array(Type.String(), {
        description: "IDs of the objects to modify. Use the current selection unless the user names specific objects.",
      }),
      args: Type.Record(Type.String(), Type.Unknown(), {
        description: "Action-specific parameters",
      }),
    }),
    execute: async (_id, params) => {
      const result = await callEditor("update", params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "presentation_select_by_text",
    label: "Select by Text",
    description: "Return the IDs of text boxes whose visible text contains the given query string. Use this to find objects before styling them.",
    parameters: Type.Object({
      query: Type.String(),
      caseSensitive: Type.Optional(Type.Boolean()),
    }),
    execute: async (_id, params) => {
      const state = await callEditor("getState", {});
      const ids = state.objects
        .filter((o: any) => {
          const text = o.text ?? "";
          return params.caseSensitive
            ? text.includes(params.query)
            : text.toLowerCase().includes(params.query.toLowerCase());
        })
        .map((o: any) => o.id);
      return {
        content: [{ type: "text", text: `Matched IDs: ${ids.join(", ")}` }],
        details: { ids },
      };
    },
  });
}
```

### 4. Loading the extensions

Use `DefaultResourceLoader` when creating the session:

```ts
import { DefaultResourceLoader, getAgentDir } from "@earendil-works/pi-coding-agent";

const resourceLoader = new DefaultResourceLoader({
  cwd: projectRoot,
  agentDir: getAgentDir(),
  additionalExtensionPaths: [
    "./server/src/pi-extensions/permission-gate.ts",
    "./server/src/pi-extensions/presentation-bridge.ts",
  ],
});
await resourceLoader.reload();

const { session } = await createAgentSession({
  modelRuntime,
  sessionManager: SessionManager.inMemory(projectRoot),
  cwd: projectRoot,
  resourceLoader,
  tools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
});
```

---

## Keeping pi informed of editor state

The model only knows what is in its context. For a live editor, push state into the session when the user acts.

### Preferred approach: tools + optional context injection

1. **Tools first**: `presentation_get_state` lets the model fetch state whenever it needs it. This avoids polluting context with large state dumps on every turn.
2. **Inject current selection on user prompt**: When the user sends a message, prepend a short, non-displayed context message with the current selection and recent changes.

```ts
function buildEditorContext(selection: string[], recentChanges: any[]) {
  return `Current editor context:
- Selected object IDs: ${selection.join(", ") || "(none)"}
- Recent user changes: ${JSON.stringify(recentChanges)}

User message:`;
}

// In the server, before calling session.prompt():
await session.prompt(buildEditorContext(selection, recentChanges) + "\n" + userMessage);
```

For a cleaner separation, use an extension's `before_agent_start` event:

```ts
pi.on("before_agent_start", async (event, ctx) => {
  const state = await fetchEditorState();
  return {
    message: {
      customType: "editor_context",
      role: "user",
      content: `Current presentation state:\n${JSON.stringify(state, null, 2)}`,
      display: false,
    },
  };
});
```

`display: false` keeps the raw state out of the visible chat history while still sending it to the model.

---

## Skills and prompts

Create a skill to teach the model common presentation-editing workflows.

File: `.pi/skills/presentation/SKILL.md`

```markdown
# Presentation Editor Skill

Use this skill when the user is working with the live presentation editor.

## Key concepts

- The editor maintains a list of objects (text boxes, shapes, images).
- Each object has an `id`, `x`, `y`, `width`, `height`, `text`, `fillColor`, and `fontSize`.
- The user can select objects; the current selection IDs are available via `presentation_get_state`.
- Changes made by the user or by pi are immediately reflected in the shared state.

## Common patterns

### Lay out selected objects horizontally

1. Get current state to confirm selection.
2. Call `presentation_update` with action `applyGridLayout`, direction `"horizontal"`, optional `gap`.

### Resize font to fit text inside a box

1. Get the text and bounds of the selected text box via `presentation_get_state`.
2. Call `presentation_update` with action `setFontSize`, passing a smaller font size until the text fits.
   - You may need to iterate 2-3 times, checking bounds after each change.

### Highlight text blocks containing a keyword

1. Call `presentation_select_by_text` with the keyword to get matching IDs.
2. Call `presentation_update` with action `setFillColor` and color `"#ff0000"` for each match.

## Safety

- Only modify objects the user has selected or explicitly referenced.
- Do not delete objects unless explicitly asked.
- Prefer `applyGridLayout` over manual position calculations.
```

Also add a project-level `AGENTS.md` or `.pi/SYSTEM.md` with global rules:

```markdown
# Deck Harness Rules

- You are assisting the user inside a live presentation editor.
- Always operate on the current selection unless the user explicitly names other objects.
- Before making layout changes, call `presentation_get_state` to confirm the current selection and bounds.
- After making changes, briefly summarize what changed.
```

---

## Approval flow for web UI

Because `ctx.ui.confirm` is terminal/RPC-oriented, build a custom approval flow:

1. Extension blocks the tool call and emits an `approval_required` event.
2. Server forwards it to the browser over WebSocket.
3. Browser shows a dialog: "Allow `bash: rm -rf node_modules`?"
4. User clicks **Approve** or **Deny**.
5. Server resolves the pending promise in the extension.
6. Extension returns `{ block: true }` or allows the call to proceed.

```ts
// In permission-gate extension
const pending = new Map<string, { resolve: (ok: boolean) => void }>();
const approvedThisTurn = new Set<string>();

async function requestApproval(event: any): Promise<boolean> {
  return new Promise((resolve) => {
    pending.set(event.toolCallId, { resolve });
    emitToServer({ type: "approval_required", toolCallId: event.toolCallId, tool: event.toolName, input: event.input });
  });
}

pi.on("tool_call", async (event, ctx) => {
  if (isReadOnly(event.toolName)) return;

  const key = `${event.toolName}:${JSON.stringify(event.input)}`;
  if (approvedThisTurn.has(key)) {
    approvedThisTurn.delete(key);
    return;
  }

  const approved = await requestApproval(event);
  if (!approved) {
    return { block: true, reason: "Denied by user" };
  }
  approvedThisTurn.add(key);
});

pi.on("turn_end", () => approvedThisTurn.clear());
```

Server-side:

```ts
ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "approval_response") {
    pending.get(msg.toolCallId)?.resolve(msg.approved);
  }
});
```

---

## Frontend design

### Chat panel

- Shows user messages and assistant responses.
- Streams `message_update` text deltas.
- Shows tool calls in progress (`tool_execution_start` / `tool_execution_end`).
- Shows approval dialogs when required.

### Deck canvas

- Renders objects from the shared state.
- Sends selection changes to the server.
- Applies updates received from pi tools.

### Message flow

```
User selects objects -> browser sends selection to server
User types prompt    -> server calls session.prompt()
pi streams events      -> server forwards to browser
pi calls tool          -> server executes via editor API
editor state updates -> browser re-renders canvas
```

---

## Security and safety

### Defense in depth

| Layer | Implementation |
|-------|----------------|
| Tool allowlist | `tools: [...]` in `createAgentSession` |
| Static blocklist | Extension regex checks for dangerous bash patterns |
| Path jail | Extension rejects writes outside `ctx.cwd` |
| Interactive approval | Extension blocks bash/write/edit until user approves in browser |
| Process sandbox | Run server as non-root user; consider containers for untrusted code |
| Auth | Existing cookie-session auth gates all routes |

### Important caveats

- Extensions run with the server's full privileges.
- The model can be socially engineered into running dangerous commands; the blocklist and approval gates are the safety net.
- For a public-facing instance, run each session in an isolated sandbox (container, VM, or restricted user).
- If the harness is only ever used locally by the owner, the risk is lower, but the gates still protect against mistakes.

---

## Implementation phases

### Phase 1: SDK harness prototype

- [ ] Create a minimal Hono server that creates an `AgentSession`.
- [ ] Add a WebSocket endpoint that accepts a prompt and streams pi events back.
- [ ] Build a tiny React chat UI that shows streamed text.
- [ ] Verify built-in tools (`read`, `bash`) work end-to-end.

### Phase 2: Permission gates

- [ ] Write `permission-gate.ts` extension.
- [ ] Add static blocklist for dangerous bash patterns.
- [ ] Add path-jail for write/edit operations.
- [ ] Implement web approval flow for bash/write/edit.
- [ ] Test blocking and approval paths manually.

### Phase 3: Presentation tools

- [ ] Define the editor state shape (objects, selection, history).
- [ ] Write `presentation-bridge.ts` extension with `presentation_get_state`, `presentation_update`, `presentation_select_by_text`.
- [ ] Build an in-memory editor API in the server (or connect to an existing deck component).
- [ ] Verify pi can query and modify the deck through tools.

### Phase 4: Skills and context

- [ ] Write `.pi/skills/presentation/SKILL.md`.
- [ ] Write project `AGENTS.md` or `.pi/SYSTEM.md` rules.
- [ ] Inject current selection into context before each prompt.
- [ ] Iterate on tool descriptions and skill content based on real usage.

### Phase 5: Frontend integration

- [ ] Build deck canvas that renders editor state.
- [ ] Wire selection changes to the server.
- [ ] Apply pi-driven updates to the canvas in real time.
- [ ] Polish chat UI: tool call visibility, approval dialogs, error handling.

### Phase 6: Hardening

- [ ] Review all tool descriptions for clarity and safety.
- [ ] Add more robust sandboxing if exposed beyond localhost.
- [ ] Add rate limiting and session timeouts.
- [ ] Write runbook for deployment.

---

## Files to create

```
docs/talks/deck-harness/
├── planning.md                 # This file
└── (future)
    ├── architecture-diagram.png
    ├── api-spec.md
    └── runbook.md

server/src/deck-harness/
├── index.ts                    # Hono server entry
├── session-store.ts            # sessionId -> AgentSession map
├── websocket.ts                # WebSocket handler
├── auth-middleware.ts          # cookie/session auth
└── pi-extensions/
    ├── permission-gate.ts
    └── presentation-bridge.ts

.pi/skills/presentation/SKILL.md
AGENTS.md or .pi/SYSTEM.md

client-deck/                    # New Vite client app (optional)
├── src/
│   ├── App.tsx
│   ├── ChatPanel.tsx
│   ├── DeckCanvas.tsx
│   └── api.ts
├── index.html
├── package.json
└── vite.config.ts
```

---

## Open questions

1. Should the deck editor be a new client app (`client-deck`) or integrated into an existing client?
2. Where should deck state live? In-memory in the server, in a database, or persisted to files?
3. Should pi sessions be persisted to disk (`SessionManager.create`) or kept in-memory only?
4. Do we need multi-slide support, or is a single canvas enough for the prototype?
5. Should approval be required for *all* `bash`/`write`/`edit`, or only for commands matching certain patterns?

---

## References

- pi README: `/Users/jbranam/.nvm/versions/node/v24.12.0/lib/node_modules/@earendil-works/pi-coding-agent/README.md`
- pi extensions docs: `/Users/jbranam/.nvm/versions/node/v24.12.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
- pi SDK docs: `/Users/jbranam/.nvm/versions/node/v24.12.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/sdk.md`
- pi RPC docs: `/Users/jbranam/.nvm/versions/node/v24.12.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/rpc.md`
