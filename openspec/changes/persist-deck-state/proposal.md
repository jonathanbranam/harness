## Why

`editor-state.ts`'s `EditorStore` is explicitly in-memory only ("No
persistence: this is a local, iterate-fast prototype"). Every deck, slide,
and object lives only in server RAM, so restarting `deck-harness-server`
(e.g. to pick up a changed `.env` value, or a crash) silently discards all
deck work back to the hardcoded seed deck. As deck-harness moves past
throwaway prototyping, losing work on every restart is no longer acceptable.

## What Changes

- Add a debounced auto-save path: `EditorStore` already emits a state
  snapshot on every mutation (`subscribe`/`emit`); a new persistence layer
  subscribes to that and writes the full deck state to disk after a short
  quiet period (debounced, not on every keystroke/emit) so rapid edits (e.g.
  live dragging) coalesce into one write.
- Add restore-on-startup: when the server starts and a saved snapshot
  exists, `EditorStore` is seeded from it instead of the hardcoded "Deck
  Harness" demo deck; the demo deck remains the seed only for a first-ever
  run with no saved state.
- No save button or other new user-facing control — persistence is fully
  automatic and invisible to the user, matching "no save button is
  necessary."
- Storage format: a single JSON file under `deck-harness-server/data/`
  (sibling to the existing gitignored `data/workspace/`), holding the full
  `decks`/`activeDeckId` snapshot. JSON is the recommended choice here:
  it matches this repo's established "no database" pattern (see CLAUDE.md's
  "in-memory auth, not SQLite" — single user, single process, a restart is
  already an acceptable point to re-read from disk), needs no schema
  migration tooling for a shape that's still evolving, and the whole deck
  state snapshot is small enough that atomic whole-file writes (write to a
  temp file, rename over the target) are cheap and safe even at typical
  editing frequency. A per-deck-file split or an embedded SQLite file would
  add real complexity (partial-write/rename bookkeeping, or a schema/query
  layer) for no benefit at this scale; not recommended unless deck count or
  file size grows enough to make single-file writes a bottleneck.
- "Over an API": no new HTTP endpoint is needed for the save path itself —
  saves are server-internal (triggered by the existing in-process
  `EditorStore` mutations, which already arrive over the WS `object_update`
  messages and the deck-management pi tools). If a proposal reviewer wants
  an explicit persistence HTTP endpoint instead of (or in addition to) the
  internal subscribe-based debounce, flag it during spec/design review.
- The loader is lenient by construction, reusing the same sanitize-on-load
  approach `normalizeText` already applies to object text: unrecognized
  fields or shapes in the snapshot are dropped rather than rejected, so a
  saved file that's ahead of or behind the current in-memory shape still
  loads (falling back to defaults for anything missing/malformed) instead
  of crashing the server. This is explicitly *not* a versioned migration
  path — no schema version field, no upgrade functions between formats. If
  the snapshot shape changes later, old unrecognized data is just dropped
  on next load; a real migration path is out of scope unless requested.

## Capabilities

### New Capabilities
- `deck-persistence`: debounced auto-save of the full deck state to a
  server-side JSON snapshot on every change, and restoring that snapshot
  into `EditorStore` on server startup.

### Modified Capabilities
(none — `deck-management`'s create/list/select/delete requirements for
decks and slides are unchanged; only where the *initial* in-memory state
comes from at process start changes, which `deck-persistence` owns.)

## Impact

- `deck-harness-server/src/editor-state.ts`: `EditorStore` needs a way to
  be constructed from a restored snapshot (instead of always seeding the
  demo deck), and a way to serialize its current state for persistence.
- New module, e.g. `deck-harness-server/src/deck-persistence.ts`: owns the
  debounce timer, the snapshot file path/location, and the load/save
  file I/O.
- `deck-harness-server/src/index.ts` (or wherever `editorStore` is first
  touched at startup): wire up loading the snapshot before the server
  starts accepting connections, and subscribing the debounced saver.
- `deck-harness-server/src/env.ts`: likely a new env var for the snapshot
  file path (following `DECK_WORKSPACE_DIR`'s pattern), defaulting under
  `data/`.
- `deck-harness-server/data/` (gitignored, runtime-only): new snapshot file
  alongside the existing `data/workspace/`.
- No client-deck changes expected — persistence is entirely server-side and
  transparent to the browser UI.
