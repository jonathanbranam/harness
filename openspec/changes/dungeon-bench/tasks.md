## 1. Depend on the shared engine

- [x] 1.1 Add `@repo/dungeon-engine` to `dungeon-harness-server` by relative
      `file:` path into the sibling track-web checkout, and install
- [x] 1.2 Drop the now-unused `@cucumber/gherkin` and `@cucumber/messages`
      dependencies left over from the backed-out Gherkin work
- [x] 1.3 Confirm the package resolves and runs under `tsx` from this repo

## 2. Generate boards

- [x] 2.1 `bench/board-gen.ts`: `open` / `scattered` / `arena` presets, seeded
      and reproducible
- [x] 2.2 Build a board from explicit terrain rows, rejecting a ragged grid or an
      unknown character
- [x] 2.3 Render a board back to rows, so the agent can read one without a
      screenshot
- [x] 2.4 Place power centers by default, since the enemy AI advances on
      structures rather than PCs

## 3. The bench

- [x] 3.1 `bench/bench-store.ts`: one board per session, holding `GameState`, the
      selection, session def overrides, and a snapshot stack
- [x] 3.2 Re-apply this bench's board and def overrides before every engine call
- [x] 3.3 Setup operations: place, remove, relocate, set HP, clear, new board
- [x] 3.4 Play operations: select, move, attack, run enemy AI, end round
- [x] 3.5 Step back over any action from the snapshot stack
- [x] 3.6 Session-scoped definition tweaks and a reset
- [x] 3.7 Derive every overlay at read time from engine queries

## 4. Wire it up

- [x] 4.1 `bench/intents.ts`: the single translation from a browser message to a
      bench method
- [x] 4.2 `session-store.ts`: one bench per session, alongside the agent session
- [x] 4.3 `websocket.ts`: push `bench_state` on change and on connect, accept
      `bench_intent`, report a refused intent as `bench_error`

## 5. Agent tools

- [x] 5.1 `pi-extensions/bench-bridge.ts`: read, setup, play, and definition
      tools, each wrapping one bench method
- [x] 5.2 Register the tool names in the session allowlist
- [x] 5.3 Rewrite the workspace `AGENTS.md` around the tools and the rule that
      the engine referees

## 6. The client

- [x] 6.1 `bench/types.ts`: the wire shapes the UI reads
- [x] 6.2 `components/BoardView.tsx`: SVG terrain, structures, units with HP,
      selection, reachable tiles, attack footprints, enemy telegraphs
- [x] 6.3 `components/BenchControls.tsx`: setup/play modes, unit palette,
      direction arming, AI, end round, step back
- [x] 6.4 `useDungeonSocket`: bench state in, intents out
- [x] 6.5 `DungeonPage`: board pane beside the chat pane, board mounted on the
      capture ref so `dungeon_board_view` sees what the designer sees

## 7. Verify

- [x] 7.1 Bench tests: setup, movement legality and budget, attack damage and
      commitment, hand-driven enemy attacks, enemy AI, round end, step back,
      definition tweaks, session isolation
- [x] 7.2 Intent tests covering the whole intent surface
- [x] 7.3 `npm run typecheck` passes
- [x] 7.4 `npm test` passes
- [x] 7.5 `npm run build:client-dungeon` passes
- [x] 7.6 The server boots with the engine dependency
- [ ] 7.7 Drive the bench in a browser — needs the dev servers running and the
      login password; not done in this session
