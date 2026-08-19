## Context

See `proposal.md` — Why, and `docs/dungeon-harness/harness-rebuild/phase-plan.md`
for where this sits. Three facts about the engine shaped everything below; each
was discovered by reading it, not assumed.

1. **The rules are pure functions over plain data.** `GameState` is a struct, and
   every rules function is `(state, …) => GameState`. So snapshots are values,
   and step-back is a list.
2. **The board and definition stores are process globals.** `applyMap` and
   `applyLoaded` mutate module-level state; one process has one board and one def
   table.
3. **Damage is side-asymmetric.** A PC attack damages NPCs and structures; an NPC
   attack damages PCs and structures. The two sides share movement rules but not
   attack resolution.

## Goals / Non-Goals

**Goals:**

- A bench a designer can actually use: set up, play both sides, step back.
- One authority for board state, shared by clicks and tool calls.
- No rule anywhere in this repo.

**Non-Goals:**

- Persistence of any kind (phase 2 adds bookmarks).
- Multiple boards at once (needs the engine instance-scoped).
- Any editor UI for unit definitions.
- Threat overlays and a transport strip (phases 3 and 4).

## Decisions

### The server owns the board; the client renders and sends intents

The agent drives the bench from phase 1, so a client-side simulation would mean
two copies of the state and a reconciliation problem the moment a tool call and a
click overlap. Instead `BenchStore` lives per session on the server, the browser
sends `BenchIntent`s, and state is pushed back over the existing WebSocket.
`bench/intents.ts` is the only translation from wire message to bench method, so
there is exactly one door.

*Alternative — run the engine in the browser:* attractive later, when many boards
must replay instantly on every edit, and reasonable because the engine is pure.
Rejected now because it splits authority while the agent is a first-class driver.

### Every engine call is preceded by re-applying this bench's board and defs

Because the engine's stores are process globals (fact 2), a second session would
otherwise leave the singleton pointing at someone else's board. `ensureActive()`
re-applies this bench's map and def overrides before each call. It is O(cells) at
bench sizes and it makes the multi-session case correct rather than
subtly wrong.

*Alternative — instance-scope the engine now:* the real fix, and the phase plan
says so, but it touches every rules call site and every test in track-web. Paid
when multiple boards must coexist, not before.

### Step-back is full-state snapshots, not the engine's undo

The engine's `undoLastMove` reverses movement only — attacks deliberately clear
its undo stack, because in the game an attack is committal. A bench needs to
reverse *anything*, including an attack that killed a unit or a definition change.
Snapshotting `GameState` before each action gives that for one line of code, and
it is what phase 4's scrub bar will read.

### Movement is shared between sides; attacks are not

Both sides move through `validMoveDests` / `computeMovePath` / `applyMove`, which
are archetype-agnostic. Attacks split on fact 3: a PC attack goes through
`resolvePcAction` (whole footprint), an NPC attack through `resolveNpcAction`
(one tile). The bench asks for a direction in both cases, derives the footprint
from the engine, and requires an NPC's target to be inside it — so nothing here
decides what is reachable, only which engine entry point applies.

One gap papered over deliberately: `resolveNpcAction` does not mark the attacker
as spent, because in the game NPC attacks resolve as end-of-round telegraphs
rather than turn actions. A hand-driven NPC would otherwise attack repeatedly, so
the bench adds it to `attackedThisTurn` itself. That is bench sequencing, not a
rule, but it is the one place the harness adds a constraint the engine did not.

### Boards are generated here, with a structure by default

The enemy AI walks toward power centers and shoots a PC only when one enters its
scan band; it does not hunt PCs. On a board with no structures, running the AI
correctly does nothing — which reads as a broken button. So generated boards
carry a power center unless asked otherwise, and both the tool description and
the workspace `AGENTS.md` say why.

### Definition tweaks are agent-only and session-scoped

The `UnitDef` model is expected to be replaced by turn machines, so no UI is built
against it. One tool mutates the in-memory store for the session; nothing is
persisted. This buys the edit→see loop for the cost of a wrapper, and throws away
cleanly.

## Risks / Trade-offs

- **Nothing persists** → A browser reload keeps the board (it lives in the
  session), but a server restart loses it. Acceptable for a POC; phase 2's
  bookmarks are the fix.

- **The cross-repo `file:` dependency is unusual** → `npm install` symlinks
  `@repo/dungeon-engine` into `node_modules`, and `tsx` compiles it from source
  across the repo boundary. Verified by booting the server and by the bench tests.
  If it ever breaks, the fallback is a build step in the package, which is a
  change to that package's `package.json` and nothing here.

- **A stale hand-mirrored type in the client** → `client-dungeon/src/bench/types.ts`
  duplicates the server's wire shapes because no shared package spans them. A
  mismatch shows up as a TypeScript error only on the side that changed. Kept
  small on purpose: only what the UI reads.

- **The agent could become the comfortable path for setup** → The risk flagged in
  the phase plan. Direct manipulation covers everything the tools do except
  definition tweaks, so the designer is never forced into chat; whether they
  prefer it is worth watching in use.

## Migration Plan

No data, no deploy, no schema. Verification is `npm run typecheck`, `npm test`,
`npm run build:client-dungeon`, and a boot of the server. Browser verification is
outstanding and needs the dev servers running.
