// Puts `@repo/dungeon-engine` into bench mode, once, for the process that is
// the bench.
//
// Not per session and not per board (design.md, "`setEngineMode('bench')` is
// called once at server startup"): one process is either the game or the
// bench and it never changes at runtime. 3a calls no bench-only engine
// operation, so nothing here depends on it yet, but `amendTelegraph` (3b)
// does — setting the mode now means 3b doesn't land alongside a mode bug.
//
// Its own module, called from `index.ts` rather than folded into `app.ts`:
// `app.ts` pulls in `./auth` → `./env`, which calls `process.exit(1)` at
// import time if `HARNESS_PASSWORD_HASH` isn't set — fine for the real
// server, fatal for a plain unit test that only wants to assert the engine
// mode got set.
import { setEngineMode } from '@repo/dungeon-engine'

export function startEngineInBenchMode(): void {
  setEngineMode('bench')
}
