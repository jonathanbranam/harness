> # ⛔ STOPPED — superseded work, do not implement
>
> **This plan is stopped and has been fully backed out** (2026-08-18). The
> Gherkin-authoring dungeon-harness approach it belongs to put the LLM in
> the referee's chair for game rules, and the harness was never usable as a
> design tool. See [`../STATUS.md`](../STATUS.md) for why, what landed, and
> what happens to each piece, and [`../backout-plan.md`](../backout-plan.md)
> for the removal plan.
>
> **The replacement is the harness rebuild**
> ([`../harness-rebuild/phase-plan.md`](../harness-rebuild/phase-plan.md), the
> plan of record) — a design bench that plays a board through the real engine.
> Phases 1–4 shipped 2026-08-19. Its rules layer, a declarative unit language
> ([`../turn-machines/README.md`](../turn-machines/README.md)), is **still
> under evaluation and not approved**; only a scoped slice is planned, as
> phase 5.
>
> Kept for historical context only. The **Status** line below records what
> actually landed before the stop.

# Phase 08a — track-web existing-unit Gherkin extraction (agent-driven, no design session)

**Repo:** `track-web`
**Depends on:** this repo's phase 02 (hard — need a runnable step-def target) and phase 07 (hard — this is exactly what consumes the bundle)
**Blocks:** 08b

**Status:** ⚠️ **Partial, halted.** `melee` and `rogue` landed (archived changes
`2026-08-16-dungeon-tactics-melee-archetype`, `2026-08-17-dungeon-tactics-rogue-archetype`,
`2026-08-17-melee-move-attack-scenarios`); **`ranger` and `magic-user` were never started** and now
never will be under this plan.
**Disposition:** **KEEP the `.feature` files** (real regression coverage of shipped behavior);
**unwind the capability split** this phase introduced — `melee-archetype`/`rogue-archetype` were
carved out of `pc-archetypes`, leaving archetype specs split across three capabilities for no
reason that survives the stop. See [`../backout-plan.md`](../backout-plan.md).

## Goal

Produce real, passing Gherkin coverage for the 4 existing units —
`melee`/`ranger`/`rogue`/`magic-user` — by **extraction, not design**. Split
out of the original phase 08 because writing these units' `.feature` files
isn't designer work: their behavior is already fully pinned down by
`openspec/specs/pc-archetypes/spec.md`'s existing prose Requirement/Scenario
blocks (e.g. "Melee move range", "Melee attack targeting", "Melee attack
damage") and by the already-implemented, already-tested engine
(`client-games/src/games/dungeon-tactics-solo/unitDefs.ts`,
`attackFootprint.ts`, `pathfinding.ts`, plus their existing
`unitDefs.test.ts`/`attackFootprint.test.ts`). There's no undecided
behavior here — this is a format conversion (prose scenario + implementation
→ literal Gherkin), which an agent can do directly in track-web, no harness
session required.

## Why this isn't a harness design session

The harness's board-preview machinery (`dungeon_preview_movement`/
`dungeon_preview_attack`, phase 03) exists so a designer can sanity-check
*new or changing* behavior before committing it to Gherkin. For these 4
units, correctness is already established by passing code and tests —
routing that through a chat-driven design session would add overhead (open
a session, place units on a board, click through previews) to confirm
something already true, not surface new information.

It also means this phase can't meaningfully exercise the harness's diff
engine: track-web's canonical `.feature` corpus is empty for these units
today, so any changeset computed against that baseline is, by definition,
100% `added` — `modified`/`removed` classification never gets touched. That's
fine, it's not this phase's job. The meaningful diff exercise (real prior
baseline, real edits) is what 08b is for, and this phase's output is what
makes 08b possible in the first place.

## Are these change bundles where everything is new?

Yes, unavoidably — track-web has no canonical `.feature` files for these
units yet, so a changeset diffed against an empty baseline can only
classify scenarios as `added`. That's not a special case to work around:
phase 07's `scenario-to-change` skill already treats "no matching prior
scenario" as the normal `added` path, and its capability-matching step
(step 6) will find the existing `pc-archetypes` capability's per-unit
Requirements (e.g. "Melee PC archetype") and correctly target `MODIFIED
Requirements` there — restating the requirement's current prose, which
already fully describes this behavior — rather than fabricating a new
capability. In effect: the *scenarios* are new (first Gherkin
representation), the *behavior* they describe is not.

## Concrete steps

Skip the harness server entirely — no live session needed. Directly in
track-web, per unit:

1. Read the unit's existing prose spec (`openspec/specs/pc-archetypes/
   spec.md`'s matching `### Requirement:` block) and its implementation
   (`unitDefs.ts` entry, relevant `attackFootprint.ts`/`pathfinding.ts`
   logic) and existing tests.
2. Draft Given/When/Then scenarios covering the same ground the prose
   scenarios and tests already cover (move range, attack targeting, attack
   damage/propagation) — a transcription pass, not fresh authoring. Assign
   each scenario a stable `@scenario-id` tag, following phase 05's tagging
   convention (slug generated directly; no harness dependency needed just
   to mint a tag).
3. Hand-construct the same three-file handoff-bundle shape phase 07's skill
   already expects — `<unit>.feature`, `<unit>-changeset.json` (every
   scenario `status: "added"`, trivial to build against an empty baseline),
   `<unit>-implementation-notes.md` (state plainly that this bundle was
   produced by direct extraction from existing code/specs, not a harness
   design session, so the engineer skill's `design.md` callout reflects
   that provenance instead of implying invented design rationale).
4. Run the existing `scenario-to-change` skill against the bundle
   unmodified — no new ingestion path, no changes to phase 07's skill.
5. `apply-change` → implement the `@amiceli/vitest-cucumber` step
   definitions (should be close to 1:1 with the extraction, since it's
   describing already-passing behavior) → `npm test` green →
   `archive-change`.

One bundle per unit (melee, rogue, ranger, magic-user) → up to 4 separate
OpenSpec changes, consistent with the general instruction to keep changes
small. After all 4 land, regenerate the step catalog (phase 04) — this
seeds real data for 08b's first live harness session.

## Deliverable

4 units have real, passing Gherkin coverage landed in track-web, produced
by direct extraction rather than a harness session. track-web's canonical
`.feature` corpus and step catalog are non-empty for the first time — the
prerequisite substrate 08b needs to actually exercise `dungeon_load_baseline`
and the changeset diff against real prior content.

## Suggested OpenSpec capability

Target the existing `pc-archetypes` capability's per-unit Requirements
(`MODIFIED Requirements`) — confirmed via `scenario-to-change`'s own
capability-matching step, not a new capability.
