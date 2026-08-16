## 1. Config

- [ ] 1.1 Add `DECK_STATE_FILE` to `deck-harness-server/src/env.ts`, defaulting to `data/decks.json` relative to `import.meta.dirname`, following `DECK_WORKSPACE_DIR`'s pattern.

## 2. Snapshot sanitizer and file I/O

- [ ] 2.1 Create `deck-harness-server/src/deck-persistence.ts` with a `loadSnapshot(raw: unknown): { decks: Deck[]; activeDeckId: string } | null` function that sanitizes a parsed JSON value field-by-field (reusing `editor-state.ts`'s `normalizeText`/sanitize style), dropping unrecognized data and substituting defaults for malformed/missing fields, returning `null` when the top-level shape or the sanitized `decks` array is unusable.
- [ ] 2.2 In the same module, add a `readSnapshotFile(path: string): unknown | null` helper: `existsSync` + `readFileSync` + `JSON.parse`, returning `null` (and logging a warning) on a missing file or `JSON.parse` failure instead of throwing.
- [ ] 2.3 Add a `writeSnapshotFile(path: string, state: { decks: Deck[]; activeDeckId: string }): void` helper that writes to `<path>.tmp` via `writeFileSync` then `renameSync`s over `path`.

## 3. EditorStore integration

- [ ] 3.1 Change `EditorStore`'s constructor to accept an optional initial `{ decks, activeDeckId }` (falling back to today's hardcoded seed deck when omitted/`null`), so it can be constructed either way without duplicating seeding logic.
- [ ] 3.2 At module load in `editor-state.ts`, call `readSnapshotFile` + `loadSnapshot` (using `env.DECK_STATE_FILE`) and pass the result into `new EditorStore(...)` when constructing the exported `editorStore` singleton.

## 4. Debounced auto-save

- [ ] 4.1 In `deck-persistence.ts`, add a `startAutoSave(store: EditorStore, path: string): () => void` that calls `store.subscribe(...)`, resets a ~750ms trailing debounce timer on each emitted state, and calls `writeSnapshotFile` on timer fire; returns an unsubscribe/stop function.
- [ ] 4.2 Wire `startAutoSave(editorStore, env.DECK_STATE_FILE)` into server startup (`deck-harness-server/src/index.ts`), keeping `editorStore`'s construction and this call synchronous/import-time as designed.
- [ ] 4.3 Register `SIGINT`/`SIGTERM` handlers in `index.ts` that synchronously flush any pending debounced write (via a "flush now" function exposed from `deck-persistence.ts`) before the process exits.

## 5. Tests

- [ ] 5.1 Unit-test `loadSnapshot`: valid snapshot round-trips; unrecognized extra fields are dropped; malformed/missing fields fall back to defaults; unusable top-level shape (not an object, empty/invalid `decks`) returns `null`; `activeDeckId` pointing at a missing deck falls back to the first deck's id.
- [ ] 5.2 Unit-test `readSnapshotFile`: missing file and invalid JSON both return `null` without throwing.
- [ ] 5.3 Unit-test the debounce behavior in `startAutoSave`: multiple rapid emits within the debounce window produce exactly one write, reflecting the final state.
- [ ] 5.4 Integration-test (or extend `editor-state.test.ts`): constructing `EditorStore` with a sanitized snapshot restores decks/slides/objects/active ids; constructing with `null` falls back to the existing seed deck.

## 6. Docs

- [ ] 6.1 Update `deck-harness-server`'s `.env.example` (if present) with `DECK_STATE_FILE`.
- [ ] 6.2 Add a short note to `editor-state.ts`'s top-of-file comment (currently says "No persistence") reflecting that state is now persisted, pointing at `deck-persistence.ts`.
