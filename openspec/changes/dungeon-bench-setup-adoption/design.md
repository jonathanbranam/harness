## Context

See `proposal.md — Why`, and the correction plan
`docs/dungeon-harness/harness-rebuild/phase-5-correction.md` §8.2, which is the
plan of record.

What exists today:

- `BenchStore` builds its own `emptyState()` in `npc-move` and edits it at will.
  Its setup methods (`bench-store.ts:547–630`) carry local copies of engine
  rules, and a `unitSeq` counter restored from `nextSeqFrom` on every timeline
  jump.
- The client keeps `const [mode, setMode] = useState<'setup' | 'play'>('setup')`
  (`DungeonPage.tsx:34`) — a local toggle with no connection to the round.
- `startScenario` shipped in the engine with `dungeon-round-transitions`, but the
  bench never called it: it had no placement phase to leave.
- The engine's scenario surface arrives with track-web
  `dungeon-bench-setup-surface`; this change is its only consumer.

## Goals / Non-Goals

**Goals:**

- No rule of the game implemented in this repo, setup included.
- The bench's notion of "am I setting up or playing" is the round's phase.
- Structures become editable, since the engine can now referee that.

**Non-Goals:**

- **The strict phase guard** (correction plan §9, change 3). Until it lands, the
  action surface still lets a bench drive a unit out of phase; this change does
  not tighten that and does not pretend to. It builds the legal home the guard
  needs.
- **Waves and flight** (change 4).
- **A "back to setup" transition.** Stepping back on the timeline is the way.
- **Spawn zones for bench boards** (correction plan §10.2).
- **Migrating bookmarks.** None is needed — `GameState`'s shape is unchanged.

## Decisions

### `BenchStore` keeps the frame, the engine keeps the rules

Each setup method shrinks to: call the engine, forward a refusal, commit the
returned state as a frame with a log line. The store still owns everything the
engine has no business knowing — the frame stack and cursor, bookmarks, plan
authorship, the action log, the selection.

Deleted outright: `emptyState`, `nextSeqFrom`, the `unitSeq` field and every
assignment to it, and every occupancy/structure/bounds/HP check in the setup
section. If any of them survives, this change has not done its job.

`placeUnit`'s log line needs the id and HP of what it just placed; that comes
from the engine's result, not from diffing unit arrays.

### `withoutDepartedUnits` stays, with a corrected comment

It was written for removing a unit mid-round, which this change makes
impossible. It is still reachable — a bookmark or timeline frame can install
units the current round records do not match — and change 4's fleeing enemy will
need exactly it. It stays, and its doc comment stops citing a case that can no
longer happen.

### Phase drives the client's mode

`DungeonPage`'s `mode` state is derived, not held:
`benchState.phase === 'placement' ? 'setup' : 'play'`. One consequence worth
accepting deliberately: the designer can no longer flip to the setup palette
mid-round to look at it. That is the point — the palette is not usable then, and
showing it implies otherwise.

The Start scenario control sits in `BenchControls` beside the other round
controls (Plan enemy turn, End turn, Resolve telegraphs), enabled on
`phase === 'placement'` with the same disabled-with-a-reason treatment they use.

### Structures: one intent per verb, kind chosen from a palette

Intents: `place-structure { kind, col, row, hp? }`, `remove-structure
{ col, row }`, `move-structure { fromCol, fromRow, toCol, toRow }`. The setup
palette gains the two kinds (`power-center`, `tower`) alongside the unit types,
so a click on an empty tile places whatever is armed. Relocating a structure
reuses the existing "select, then click an empty tile" gesture.

HP is optional everywhere and defaults to the engine's per-kind value; the
harness stops carrying its own copy of those numbers where it can
(`board-gen.ts`'s `STRUCTURE_CHARS` keeps its char mapping, but takes the HP
from the engine).

### Four new tools, each a thin wrapper

`dungeon_place_structure`, `dungeon_remove_structure`, `dungeon_move_structure`,
`dungeon_start_scenario` — registered in `bench-bridge.ts` **and** added to
`session-store.ts`'s allowlist, or they are silently not exposed. The existing
setup tools' descriptions gain one sentence each: this works during setup, and
the engine says so if it is too late.

### Tests re-aim, they do not relax

Bench tests that place units and then play now have to start the scenario in
between. That is a fixture helper (`startedWith(units)` or similar) used in
setup, not a per-test edit — and it is the same shape of helper the correction
plan already anticipates for change 3 (`playerPhase()`). Any test that asserts a
local rule check (occupancy, structure blocking, default HP) is re-aimed at
asserting the engine's refusal is forwarded, not deleted: the bench still owes
the designer a reason.

## Risks / Trade-offs

- **A designer loses free mid-round editing**, including dropping a unit to 1 HP
  to watch what happens → Traded for the bench and the game being one game. The
  timeline keeps the cost small. Two affordances are explicitly marked
  revisitable rather than dropped silently (unit-definition tweaks stay
  available; current-HP edits become placement-only).
- **The two repos must land together** → The engine change is additive and
  fenced, so track-web is safe on its own; this repo is not usable until the
  engine change is in place over the `file:` dependency. Verify in that order.
- **The client's setup/play toggle disappearing may read as a bug** → The Start
  scenario control and the phase readout in `BenchControls` are what replace it;
  both are visible in the same strip.
- **A test suite that merely goes green is not evidence here** → The failure mode
  this whole correction is correcting was tests quietly passing because a guard
  was disabled. Each re-aimed test must assert the engine's reason reached the
  caller.
