# Backout plan — dungeon-harness work

Companion to [`STATUS.md`](STATUS.md), which records *why* the work stopped
and what landed. This file is the concrete **remove / disable / keep**
breakdown across both repos.

**Guiding rule:** track-web is the source of truth for the game, so it gets
the conservative treatment — delete only what exists *solely* to serve the
dead harness pipeline, keep everything that is real coverage of shipped
game behavior. The harness gets the aggressive treatment: it is being
rebuilt nearly from scratch, so anything past the scaffold goes.

**Not in scope:** removing Gherkin/quickpickle, changing game behavior, and
implementing anything from [`turn-machines/`](turn-machines/README.md)
(still under evaluation). This plan only removes the aborted pipeline.

---

## Part 1 — track-web (conservative)

### 1.1 Delete: step catalog (phase 04)

Exists only to feed harness-side scenario drafting. Nothing in the game or
its tests reads it.

| Path | Action |
|---|---|
| `client-games/src/games/dungeon-tactics-solo/features/steps-catalog.json` | delete |
| `client-games/scripts/generate-step-catalog.ts` | delete |
| `client-games/package.json` → `"generate:step-catalog"` script | remove line |
| `openspec/specs/dungeon-tactics-step-catalog/` | delete capability |
| `features/README.md` references to the catalog | edit out |

**Verify:** `rg -n "steps-catalog|generate:step-catalog"` returns only
archived-change and phase-doc hits (both historical, leave them).

### 1.2 Delete: engineer skill (phase 07)

`scenario-to-change` converts a harness handoff bundle (`.feature` +
changeset JSON + implementation notes) into an OpenSpec change. No bundles
will be produced again.

| Path | Action |
|---|---|
| `.claude/skills/scenario-to-change/SKILL.md` (whole dir) | delete |
| `openspec/specs/dungeon-tactics-engineer-skill/` | delete capability |

**Note:** this is the only skill removal; `track-web:*` OpenSpec skills are
untouched.

### 1.3 Unwind: the archetype capability split (phase 08a)

08a split `melee-archetype` and `rogue-archetype` out of `pc-archetypes`
(by engineer direction at the time, then by precedent). The result is PC
archetype specs scattered across three capabilities, with `ranger` and
`magic-user` still in `pc-archetypes` and no plan that justifies the split.

| Path | Action |
|---|---|
| `openspec/specs/melee-archetype/spec.md` → Requirement "Melee PC archetype" | move into `pc-archetypes/spec.md` |
| `openspec/specs/rogue-archetype/spec.md` → Requirement "Rogue PC archetype" | move into `pc-archetypes/spec.md` |
| `openspec/specs/melee-archetype/`, `openspec/specs/rogue-archetype/` | delete after the move |

Result: one `pc-archetypes` capability holding all four PC archetypes
(melee, rogue, ranger, magic-user) plus "PC HP starts at 3", as it was
before 08a. Requirement text is moved **verbatim** — this is a filing
change, not a spec change, and no game behavior moves with it.

**Do this as a normal OpenSpec change** (it edits `openspec/specs/`), not a
hand-edit.

### 1.4 Keep, frozen: Gherkin runner and scenarios (phase 02 + 08a output)

| Path | Action |
|---|---|
| `vitest.dungeon-tactics.config.mts`, `npm run test:dungeon-tactics` | **keep** |
| `client-games/src/games/dungeon-tactics-solo/features/*.feature` (`melee`, `rogue`) | **keep** — real regression coverage of shipped behavior |
| `features/steps/` (`index.ts`, `pc.steps.ts`) | **keep** |
| `openspec/specs/dungeon-tactics-gherkin-runner/` | **keep** |
| `features/README.md` | **keep**, with the frozen-status banner (already added) |

"Frozen" means: keep them green, don't add scenarios via a harness, don't
build new tooling on them. Whether cucumber survives the eventual rules
rework is a **later** decision, deliberately deferred.

### 1.5 Keep untouched: the game itself

No changes to `client-games/src/games/dungeon-tactics-solo/` engine
(`pc.ts`, `npc.ts`, `pathfinding.ts`, `attackFootprint.ts`, `turn.ts`,
`unitDefs.ts`, `defStore.ts`, `contentStore.ts`), the Phaser scenes, the
HUD, the map editor, or the persisted unit-def API. **None of the aborted
work touched game behavior** — that is the main reason this backout is
cheap on the track-web side.

---

## Part 2 — harness (aggressive)

Everything below the scaffold is being removed rather than adapted, because
the replacement harness is a different tool (live multi-scenario
simulation driven by the real game engine) and keeping half-built
Gherkin/freehand-board machinery around would only constrain its design.

### 2.1 Delete: Gherkin authoring core (phase 05)

| Path | Action |
|---|---|
| `dungeon-harness-server/src/gherkin/` (`model.ts`, `parse.ts`, `render.ts`, `diff.ts`, `slug.ts`, `diff.test.ts`, `round-trip.test.ts` — ~420 lines) | delete directory |
| `dungeon-harness-server/src/pi-extensions/scenario-bridge.ts` (`dungeon_read_feature`, `dungeon_write_feature`, `dungeon_write_implementation_notes`) | delete |
| `openspec/specs/dungeon-scenario-authoring/` | delete capability |

### 2.2 Delete: baseline / changeset / read-only track-web access (phase 06)

| Path | Action |
|---|---|
| `dungeon-harness-server/src/pi-extensions/baseline-bridge.ts` + `.test.ts` (`dungeon_load_baseline`, `dungeon_read_step_catalog`, `dungeon_get_changeset`, `dungeon_write_changeset`) | delete |
| `dungeon-harness-server/src/env.ts` → `DUNGEON_TRACKWEB_FEATURES_DIR` | remove (and from `.env`/`.env.example` if present) |
| `openspec/specs/dungeon-baseline-changeset/` | delete capability |

This also removes the harness's only read path into track-web. Good: the
replacement design should import the game engine as a **dependency**, not
read its source tree.

### 2.3 Delete: freehand board tools and board state

The freehand drawing surface is exactly what let the agent free-hand rules
reasoning. It must not survive into the rebuild.

| Path | Action |
|---|---|
| `dungeon-harness-server/src/pi-extensions/board-bridge.ts` + `.test.ts` (`dungeon_draw_shape/_line/_overlay/_label`, `dungeon_set_cell_fill`, `dungeon_move_object`, `dungeon_remove_object`, `dungeon_clear_board`, `dungeon_get_board_state`) | delete |
| `dungeon-harness-server/src/board-state.ts` + `.test.ts` (~460 lines) | delete |
| `client-dungeon/src/components/BoardCanvas.tsx` | delete |
| `openspec/specs/dungeon-board-bridge/` | delete capability |

**Judgment call to confirm:** `BoardCanvas.tsx` could be kept as a
rendering starting point. Recommendation is **delete** — the rebuilt
harness renders *game state from the real engine* across several
simultaneous scenarios, which is a different component with a different
data model. Keeping it invites accidental reuse of the freehand object
model. It stays in git history either way.

### 2.4 Update: session store, websocket, app wiring

`session-store.ts` currently constructs the board store and registers all
five extensions, and holds an allowlist of `dungeon_*` tool names.
`websocket.ts` carries board events; `app.ts` may expose board routes.

| Path | Action |
|---|---|
| `dungeon-harness-server/src/session-store.ts` | drop board store + the four deleted extensions; keep `AgentSession`, permission gate, visual inspection |
| `dungeon-harness-server/src/websocket.ts`, `app.ts`, `types.ts` | remove board/scenario message types and routes |
| `client-dungeon/src/` (App/pane layout) | drop the board pane, keep chat + auth shell |

### 2.5 Keep: the scaffold (phase 01) and shared infra

| Path | Action |
|---|---|
| `dungeon-harness-server/src/{index,app,auth,env,session-store}.ts` (trimmed per 2.4) | **keep** |
| `dungeon-harness-server/src/routes/auth.ts`, `agent-workspace.ts` | **keep** |
| `dungeon-harness-server/src/pi-extensions/permission-gate.ts` + `.test.ts` | **keep** — the path jail is substrate-independent |
| `dungeon-harness-server/src/pi-extensions/board-visual-inspection.ts` (`dungeon_board_view`) | **keep** — generic "let pi see the rendered canvas," shared pattern with deck-harness (`extract-shared-canvas-capture`); the rebuilt harness will want it |
| `client-dungeon` auth/chat shell, `openspec/specs/dungeon-{agent-session,chat-panel-ux,pane-layout,tool-permission-gate,board-visual-inspection}/` | **keep** |
| `dungeon-harness-server/templates/agent-workspace/AGENTS.md` | **keep the file, rewrite the contents** — it currently teaches the Gherkin/board workflow |

### 2.6 Close out the open OpenSpec changes

| Change | Action |
|---|---|
| `openspec/changes/dungeon-preview-lifecycle` | **delete** — proposal-only, describes tools that no longer exist; its bug class is dead with the freehand board |
| `openspec/changes/dungeon-board-rules-engine` | **delete** — proposal-only placeholder to resume the exploration; superseded by `turn-machines/` (or, if preferred, retarget it as the rebuild's first change once that design exists) |

Both are proposals with no implementation, so deletion loses nothing; the
reasoning they pointed at lives in `board-rules-engine-exploration.md` and
`STATUS.md`.

---

## Part 3 — sequencing

Small, reviewable steps; each is an OpenSpec change in its own repo.

| Step | Repo | Content | Risk |
|---|---|---|---|
| 1 | track-web | Delete step catalog (1.1) + engineer skill (1.2) | Very low — nothing reads them |
| 2 | track-web | Unwind archetype capability split (1.3) | Low — verbatim requirement moves, no behavior |
| 3 | harness | Delete Gherkin authoring + baseline/changeset (2.1, 2.2) | Low — self-contained modules |
| 4 | harness | Delete board tools + board state + canvas, rewire session/ws/client (2.3, 2.4) | Medium — touches wiring; typecheck + `npm test` gate it |
| 5 | harness | Rewrite workspace `AGENTS.md`, delete the two open changes (2.5, 2.6) | Very low |

Steps 1–2 and 3–5 are independent; either repo can go first.

**Gates after each step:** `npm run typecheck` and `npm test` in the
touched repo, plus `npm run test:dungeon-tactics` in track-web for steps
1–2. The harness dev servers must not be restarted by the agent doing this
work (see `harness/CLAUDE.md`) — ask.

**Explicitly not done here:** removing cucumber/quickpickle; touching the
game engine; building anything from `turn-machines/`.

---

## Part 4 — what the ground looks like afterward

- **track-web:** the game, unchanged. Gherkin runner + `melee`/`rogue`
  scenarios, green and frozen. One `pc-archetypes` capability again. No
  harness-facing surface at all.
- **harness:** a dungeon harness that is auth + chat + agent session +
  permission gate + canvas capture, and nothing else — the phase-01
  scaffold, ready for a rebuild whose design has not been written yet.
- **docs:** this folder, with every historical doc bannered, `STATUS.md` as
  the decision record, and `turn-machines/` as an unapproved candidate for
  the rules layer.
