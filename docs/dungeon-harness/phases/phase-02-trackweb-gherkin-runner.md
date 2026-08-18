> # ⛔ STOPPED — superseded work, do not implement
>
> **This plan is stopped and is being backed out** (2026-08-18). The
> Gherkin-authoring dungeon-harness approach it belongs to put the LLM in
> the referee's chair for game rules, and the harness was never usable as a
> design tool. See [`../STATUS.md`](../STATUS.md) for why, what landed, and
> what happens to each piece, and [`../backout-plan.md`](../backout-plan.md)
> for the removal plan.
>
> Replacement direction — **still being evaluated, not approved**: a shared
> rules engine with a declarative unit language
> ([`../turn-machines/README.md`](../turn-machines/README.md)), plus a
> ground-up harness rebuild around live multi-scenario simulation.
>
> Kept for historical context only. The **Status** line below records what
> actually landed before the stop.

# Phase 02 — track-web Gherkin test runner

**Repo:** `track-web`
**Depends on:** none (parallel with phase 01)
**Blocks:** 04, 06, 07, 08

**Status:** ✅ **Complete** — archived OpenSpec changes `2026-08-16-dungeon-tactics-gherkin-runner`,
`2026-08-16-dungeon-tactics-separate-test-runner`, `2026-08-16-dungeon-tactics-gherkin-shared-steps`
(migrated from `@amiceli/vitest-cucumber` to `quickpickle`; own `npm run test:dungeon-tactics`).
**Disposition:** **KEEP for now, frozen.** Gherkin/cucumber is explicitly *not* being removed yet;
it stays as regression coverage, no longer as a design surface.

## Goal

Give track-web the ability to run Gherkin `.feature` files as Vitest
acceptance tests for unit behavior, without Phaser — the "one change for
track-web" from the original ask.

## Decisions carried over from `proposal.md`

- **Tool: `@amiceli/vitest-cucumber`.** track-web runs everything through
  Vitest already (`vitest.config.mts`; no Jest, no existing Cucumber
  dependency — confirmed via `package.json`), so this is the option that
  doesn't add a second test runner/CLI. `.feature` files pair with a
  `*.spec.ts` calling `loadFeature()`/`describeFeature()`, with ordinary
  Vitest assertions per Given/When/Then, running under the existing
  `npm test`.
  - Considered and set aside: classic `@cucumber/cucumber` has a stronger
    built-in global step-registry/dry-run story (which would make phase
    04's catalog close to free), but costs a second CLI/runner alongside
    Vitest for comparatively little gain, since phase 04's catalog approach
    sidesteps needing a step registry at all.
- **Placement: `client-games/src/games/dungeon-tactics-solo/features/`.**
  Follows track-web's existing colocate-tests-with-source convention
  (`unitDefs.test.ts` sits beside `unitDefs.ts`) — this is where the pure
  engine under test (`pc.ts`/`npc.ts`/`turn.ts`) actually lives, not the
  server-side schema mirror in `src/games/dungeon-tactics/`.

## Concrete steps

- Add `@amiceli/vitest-cucumber` as a devDependency of `client-games`.
- Create `client-games/src/games/dungeon-tactics-solo/features/`.
- Write **one** trivial example `.feature` + matching `.spec.ts` exercising
  an existing pure engine function (e.g. a melee unit's attack via `pc.ts`)
  to prove the wiring end-to-end under `npm test`. This is a
  proof-of-wiring example only — real scenario content is phase 08.
- Document the step-writing convention (short doc under
  `docs/games/dungeon-tactics/`, or inline in the `features/` directory):
  a step definition builds `GameState`/`UnitDef` inputs and asserts
  outcomes by calling `pc.ts`/`npc.ts`/`turn.ts` functions **directly**
  against in-memory state — not through `defStore.ts`/`contentStore.ts`,
  which both do network I/O against track-web's own `/api` and aren't
  appropriate for deterministic tests (per `proposal.md`'s engine-reuse
  note).

## Deliverable

`npm test` runs at least one Gherkin-driven test end-to-end, non-Phaser,
and the convention for writing more steps is written down somewhere a
future step-definition author (including phase 08's work) can find it.

## Suggested OpenSpec capability

`dungeon-tactics-gherkin-runner`.
