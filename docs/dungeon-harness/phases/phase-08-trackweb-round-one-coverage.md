# Phase 08 — track-web round-one Gherkin coverage (existing units)

**Repo:** `track-web` (using the harness)
**Depends on:** all of phases 01–07
**Blocks:** nothing — this is the payoff, not further infrastructure

## Goal

The first real use of the whole pipeline. Per `proposal.md`'s "Archetype
scope" decision: author and implement Gherkin acceptance coverage for the
4 existing units — `melee`/`ranger`/`rogue`/`magic-user` — in today's
simpler `UnitDef` shape (flat `maxHp`/`movement.range`/`attack`), **not**
the not-yet-built `fighter`/`rogue`/`ranger`/`mage` archetype/turn-structure
system from `unit-definition.md`.

## Why this scope, knowingly

This is **partially throwaway**: once the archetype system lands, these
units' data shape changes (`archetype`/`params`/`actions[]` instead of a
flat attack block), so their scenarios and step definitions will likely
need rewriting rather than extending. Worth it anyway — this is what
actually proves the pipeline end-to-end (harness board tools → Gherkin
output → engineer skill → OpenSpec change → `@amiceli/vitest-cucumber` step
library → step catalog → next session reading that catalog back) while the
domain is as simple as it will ever be. A rough edge found here, against 4
simple existing units, is far cheaper than finding it against the first
archetype. It also seeds the step library with real, passing step
definitions before the harder design work starts.

## Concrete steps

- Run one or more dungeon-harness design sessions (phases 01–06) to
  produce `.feature` files + changesets for each unit's core behaviors
  (movement, basic attack — whatever the existing design docs call for at
  this simpler tier).
- Per unit (or a reasonably small batch — split further if any single
  change grows large, per the general instruction to keep changes small):
  1. Sign off in the harness.
  2. Run phase 07's skill to scaffold the OpenSpec change.
  3. Implement the corresponding `@amiceli/vitest-cucumber` step
     definitions in `client-games/src/games/dungeon-tactics-solo/
     features/`.
  4. Get `npm test` green.
  5. `archive-change`.
- After the **first** unit's change archives, regenerate the step catalog
  (phase 04's script) and confirm the *next* unit's harness session
  (`dungeon_read_step_catalog`) actually sees the newly-implemented steps —
  this is the first real end-to-end proof of the full loop, not just each
  phase working in isolation.

## Deliverable

4 units have real, passing Gherkin acceptance coverage in track-web,
produced through the full harness pipeline at least once each — proof the
design holds up in practice, not just on paper.

## Suggested OpenSpec capability

Not one change — expect roughly 2–4 separate changes (one per unit or
small batch), sized by what actually comes out of each harness session
rather than fixed in advance here. Naming should follow whatever capability
convention track-web's existing `dungeon-tactics` OpenSpec specs already
use.
