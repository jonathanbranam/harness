## Context

`editorStore` (`deck-harness-server/src/editor-state.ts`) is a module-level
singleton (`export const editorStore = new EditorStore()`), constructed
synchronously at import time and used synchronously by `websocket.ts`,
`pi-extensions/deck-management.ts`, and `pi-extensions/presentation-bridge.ts`.
It already has a `subscribe`/`emit` mechanism that fires on every mutation
(`createDeck`, `applyUpdate`, `addSlide`, etc.) — see `proposal.md`'s "What
Changes" for why that's the natural hook point for auto-save, and
`specs/deck-persistence/spec.md` for the behavior this design implements.

`deck-harness-server/src/agent-workspace.ts` already establishes this repo's
house style for this kind of local runtime state: plain synchronous
`node:fs` calls, a `data/` directory (gitignored) seeded/read relative to
`import.meta.dirname`, and an `env.ts` override for the path.

## Goals / Non-Goals

**Goals:**
- Debounced, crash-tolerant-enough auto-save of the full deck snapshot to a
  local JSON file, with no client-visible API surface.
- Startup restore that's lenient to unrecognized/malformed persisted data,
  per spec's "Lenient loading" requirement.
- Keep `editorStore`'s existing synchronous, singleton-at-import-time shape
  intact — no restructuring of `index.ts`/`app.ts` startup into an async
  sequence.

**Non-Goals:**
- Multi-process or concurrent-writer safety — this harness is explicitly
  single-user/single-process (CLAUDE.md's "in-memory auth, not SQLite").
- Versioned schema migration between snapshot formats (per proposal.md and
  explicit user direction: unrecognized data is dropped, not migrated).
- Deck history/undo, export, or any user-facing save control.
- Protecting against a hard kill (`SIGKILL`, power loss) losing the most
  recent debounce window — only graceful shutdown is covered (see Risks).

## Decisions

**Snapshot file location & shape**: a single JSON file,
`deck-harness-server/data/decks.json` by default, path overridable via a
new `DECK_STATE_FILE` env var (mirrors `DECK_WORKSPACE_DIR`'s pattern in
`env.ts`). Contents are `{ decks: Deck[], activeDeckId: string }` — the same
shape `EditorStore` already holds internally, so serialization is a direct
`JSON.stringify` of that state with no separate DTO/mapping layer.
*Alternative considered*: one file per deck. Rejected — adds directory
listing/cleanup-on-delete bookkeeping for no benefit at the deck counts this
harness handles; a single small JSON file is cheap to write whole every
time (see proposal.md's storage-format rationale).

**Synchronous load at construction**: `EditorStore`'s constructor attempts
a synchronous read (`existsSync` + `readFileSync`) of the snapshot file and,
if present and parseable, seeds `decks`/`activeDeckId` from it (via the
sanitizer below) instead of always building the hardcoded demo deck.
*Alternative considered*: an async `loadOrInit()` called from `index.ts`
before `serve()`. Rejected — `editorStore` is imported and used
synchronously by several modules already; making startup async to
accommodate this would ripple through `app.ts`'s construction for a read of
one small local file, which is cheap enough to do synchronously (same
justification `agent-workspace.ts` already relies on for its sync `fs`
calls at startup).

**Debounced save via the existing `subscribe` hook**: a new
`deck-harness-server/src/deck-persistence.ts` module calls
`editorStore.subscribe(...)` once at startup; each emitted state resets a
trailing debounce timer (on the order of ~750ms) before writing. Only the
trailing edge writes, matching the spec's "one write after activity
settles" and "single write reflecting the final state" scenarios.
*Alternative considered*: throttling (write at most every N ms during
continuous activity). Rejected — the spec scenario explicitly wants the
*final* state after a burst, and trailing-debounce alone achieves that with
less code.

**Atomic writes**: write the serialized snapshot to `decks.json.tmp` in the
same directory, then `renameSync` over `decks.json`. `rename` within the
same filesystem is atomic, so a save that's interrupted mid-write never
leaves `decks.json` itself truncated or corrupt — worst case, the `.tmp`
file is incomplete and is simply overwritten by the next save attempt.

**Flush on graceful shutdown**: register `SIGINT`/`SIGTERM` handlers that
synchronously flush any pending debounced write before the process exits.
This covers the common restart path (`tsx watch` picking up a file change,
or a deliberate restart) without adding durability guarantees for a hard
kill — see Risks.

**Sanitize-on-load, not schema-validate-and-reject**: `deck-persistence.ts`
exposes a `loadSnapshot(raw: unknown): { decks: Deck[]; activeDeckId: string } | null`
function that mirrors `editor-state.ts`'s existing `normalizeText`/
`sanitizeBlock` style — walk the expected shape field by field, keep only
recognized/well-typed values, substitute safe defaults for anything
missing or malformed, and drop anything unrecognized. It returns `null`
(triggering the existing "first run" seed-deck path) only when the
top-level shape is unusable (not an object, `decks` not a non-empty array).
*Alternative considered*: a schema-validation library (e.g. zod) that
parses-and-rejects on mismatch. Rejected — the spec (and explicit user
direction) calls for tolerating unrecognized/malformed data by ignoring it,
not failing the load; a hand-rolled sanitizer consistent with the file's
existing `normalizeText` approach needs no new dependency and matches the
"ignore what it doesn't understand" requirement more directly than a
reject-on-mismatch validator would.
- If sanitizing leaves `activeDeckId` pointing at a deck that doesn't
  exist in the sanitized `decks` list, fall back to the first deck's id
  (same fallback `deleteDeck` already uses when the active deck disappears).
- A `decks` array that sanitizes down to zero decks (e.g. every entry was
  malformed) is treated the same as "no persisted state": fall back to the
  seed deck.
- JSON that fails to `JSON.parse` at all is treated the same as "no
  persisted state" (logged as a warning), not a startup crash.

**No versioning, no migration**: no schema-version field is written or
read. If a future change alters the snapshot shape, old files simply have
their now-unrecognized parts dropped by the sanitizer above on next load —
consistent with proposal.md's explicit "not a versioned migration path."

## Risks / Trade-offs

- **Hard kill during the debounce window loses recent edits** → mitigated
  to "graceful shutdown only" by the `SIGINT`/`SIGTERM` flush; a hard crash
  or `SIGKILL` can still lose up to one debounce interval (~750ms) of
  edits. Acceptable per proposal.md framing; not solvable without
  write-ahead logging, which is out of scope at this scale.
- **Hand-edited or corrupted `decks.json`** → mitigated by treating both
  JSON-parse failure and post-sanitize "zero usable decks" as equivalent to
  "no persisted state," so the server always starts rather than crash-looping.
- **`renameSync`/`writeFileSync` are synchronous and block the event loop**
  → acceptable: the snapshot is small (typical deck sizes per
  `editor-state.ts`'s seed data), and saves are already debounced to a low
  frequency, so blocking time per save is negligible.

## Migration Plan

No deployment-order dependencies: `data/decks.json` doesn't exist until the
first save, at which point the "no persisted state" path already handles
its absence identically to today's behavior. Rollback is a plain code
revert — a reverted (pre-persistence) server simply never reads the file
and continues seeding the demo deck as before; the leftover `decks.json` is
inert and gitignored.
