## Context

`dungeon-harness-server` exists today (`dungeon-harness-scaffold`) with an
`AgentSession` per login, a jailed workspace (`agent-workspace.ts`), and a
per-session `permission-gate.ts` extension that gates `bash`/`write`/`edit`
behind interactive browser approval and jails `write`/`edit` paths to the
workspace root (see that gate's `GATED_TOOLS`/path-jail check). There is no
Gherkin model, no custom tool registration, and `session-store.ts` only
allowlists pi's built-ins. See proposal.md for why this phase exists and
what it deliberately excludes (no track-web access).

## Goals / Non-Goals

**Goals:**
- A pure, dependency-free-of-I/O internal model (`Feature`/`Scenario`/`Step`)
  that a parser produces and a renderer consumes, testable without touching
  the filesystem.
- Round-trip stability for harness-produced content, so closing and
  reopening a session never silently mutates a designer's prior work.
- Three new tools, self-jailed to the workspace, wired into
  `session-store.ts`'s allowlist.

**Non-Goals:**
- Preserving byte-for-byte formatting of `.feature` files hand-edited
  outside the harness (or pre-existing files not produced by it) — only
  round-trip stability of harness-produced output is required.
- Any board/track-web tooling, baseline loading, or changeset diffing —
  phases 03/06.
- A directory-structure convention for where `.feature`/notes files live
  within the workspace (e.g. one file per unit) — left to the agent via the
  tools' `path` parameter, same as pi's built-in `write`/`edit`; not
  something this phase needs to fix.

## Decisions

### Internal model is a translation target, not `@cucumber/messages`' `GherkinDocument`

`@cucumber/gherkin`'s `Parser` produces a `GherkinDocument` (from
`@cucumber/messages`) — a schema built for the whole Cucumber execution
pipeline (source spans, pickle-compilation concerns, comment nodes as
siblings rather than attached to what they annotate). Round-tripping that
shape directly would mean keeping *all* of it byte-stable, including fields
this harness has no use for.

Decision: parse with `@cucumber/gherkin`, then translate the result into a
small internal type — `WorkingFeature { name, scenarios: WorkingScenario[] }`,
`WorkingScenario { scenarioId: string, title: string, steps: WorkingStep[] }`,
`WorkingStep { keyword: 'Given'|'When'|'Then'|'And'|'But', text: string }` —
and write a hand-rolled renderer from that type back to Gherkin text. This
is more code than piping `GherkinDocument` through a generic pretty-printer,
but it's the only way to make "round-trip stable" a meaningful, checkable
property: stability is defined over *our* model, which only carries what we
actually assign meaning to.

**Alternative considered**: `@cucumber/gherkin-utils`'s `AstBuilder` +
pretty-printer, which can round-trip a full `GherkinDocument`. Rejected —
it round-trips *more* than needed (comments, exact blank-line placement)
which makes "stable" a much harder bar for no benefit to this harness's use
case, and pulls in a second Cucumber package. `@cucumber/gherkin` +
`@cucumber/messages` (the proposal's stated choice) is enough on its own
once translation to an internal model is the plan.

### New tools bypass the interactive approval gate, but self-enforce the path jail

`permission-gate.ts`'s `GATED_TOOLS`/path-jail logic only fires for the tool
names `bash`, `write`, `edit` (`pi.on('tool_call', ...)` checks
`event.toolName` against those literals) — it does not automatically cover
new tool names. Two sub-decisions follow:

1. **No interactive approval prompt** for `dungeon_read_feature`/
   `dungeon_write_feature`/`dungeon_write_implementation_notes`. Precedent:
   deck-harness's `presentation_update` (a custom tool with real write
   effects on the live deck) is likewise not in `GATED_TOOLS` and never
   prompts. Both cases share the reasoning: a purpose-built tool with a
   narrow, well-understood effect (render Gherkin text to a workspace path;
   mutate deck state) carries much less blast radius than the fully general
   `bash`/`write`/`edit`, which is what the approval friction exists for.
   Requiring a click per scenario save would make the core chat workflow
   this harness exists for tedious for no real safety gain.
2. **The workspace path jail is still mandatory**, so each tool must
   re-implement the containment check itself (`resolve(jail, path)`, reject
   unless the result is the jail root or starts with `jail + '/'`) rather
   than relying on the gate. This is the same three-line check
   `permission-gate.ts` already has for `write`/`edit`; it's duplicated
   into `scenario-bridge.ts` rather than factored into a shared helper —
   there's no `packages/` tier yet (CLAUDE.md), and three near-identical
   three-line checks isn't the "real duplication" that tier is meant for.
   `dungeon_write_implementation_notes` needs it too even though its output
   is advisory, since it still writes to disk from an agent-supplied path.

### Scenario-id slug: derived from title at creation, then frozen

`dungeon_write_feature`'s example in `proposal.md`
(`@scenario-id:ranger-retreat-after-shot`) implies human-readable,
title-derived slugs, not opaque ids. Decision: when a `Scenario` is created
with no existing `@scenario-id:` tag, slugify its current title (lowercase,
non-alphanumeric runs → `-`, trimmed) and use that as the tag, appending
`-2`, `-3`, ... on collision within the same `Feature`. Once assigned, the
tag is copied forward verbatim on every later edit regardless of title
changes — the working model's edit operations for title/steps never touch
`scenarioId`.

**Alternative considered**: a random/opaque id (e.g. `nanoid`). Rejected —
the example in `proposal.md` is explicitly readable, and a human-legible
tag is more reviewable by the designer scanning raw `.feature` text (a
stated non-goal in the parent proposal is never re-deriving it from title
later, so readability at a glance matters more here than it would for an
id that's only ever machine-read).

### Tool result payload: full re-serialized working model, not a diff

`dungeon_read_feature` returns the whole parsed `WorkingFeature` (JSON) as
its result `content`/`details`, and `dungeon_write_feature` returns the
same shape for what it just wrote (confirming what was rendered). No
partial/diffed result. This phase has no baseline to diff against (that's
`dungeon_get_changeset` in phase 06) — returning the full model is the only
option available now, and matches the tool contract phase 06 will extend
rather than replace.

## Risks / Trade-offs

- **Hand-rolled renderer drifting from real Gherkin syntax** → mitigated by
  the round-trip test (parse → render → re-parse) as the actual correctness
  bar, run against representative fixtures (multiple scenarios, all four
  step keywords, an existing `@scenario-id:` tag) rather than relying on
  visual inspection of rendered output.
- **Duplicated path-jail check (three copies: `permission-gate.ts` +
  `scenario-bridge.ts`'s two write tools) drifting out of sync** → low risk
  given the check is three lines and covered by tests per tool; revisit
  extraction if a fourth workspace-jailed tool shows up.
- **No interactive approval on writes** means a prompt-injected or
  confused agent could overwrite a `.feature` file the designer was mid-way
  through, with no click-through to catch it → acceptable for this phase
  because the blast radius is fully contained to the harness's own
  disposable workspace (same trust boundary `presentation_update` already
  operates in); revisit only if the workspace ever stops being treated as
  disposable.

## Migration Plan

No migration — this is new functionality on a scaffold with no prior
Gherkin state to preserve. Rollout is: land the dependency + model/parser/
renderer + tools + allowlist entry in one change (this one), verified by
the round-trip and tag-stability tests plus a manual session-level check
per proposal.md's "Deliverable" (build scenarios in a session, close,
reopen, `dungeon_read_feature` reloads exactly what was written).
