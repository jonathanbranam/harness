## Context

See proposal.md - Why for motivation. Today `BoardStore`
(`dungeon-harness-server/src/board-state.ts`) holds `cells: BoardCell[][]`
(each `{ terrain }`) and `units: PlacedUnit[]` (each tied to a fixed
`Archetype` via `board-engine/unit-catalog.ts`), and exposes
`placeUnit`/`setTerrain`/`removeUnit`/`moveUnit`/`clearBoard`/`getState`
plus a `subscribe`/`emit` pattern that mirrors
`deck-harness-server/src/editor-state.ts`'s store shape (per-session
instance, no persistence, no undo/redo). `board-engine/movement.ts` and
`board-engine/attack.ts` compute range-limited pathing and footprint/
penetration against that unit model; `pi-extensions/board-bridge.ts`
exposes it all as `pi.registerTool` calls, allowlisted in
`session-store.ts`; `client-dungeon/src/components/BoardCanvas.tsx`
renders it. This design replaces the unit/terrain data model with a
generic drawn-object model and removes the movement/attack engine
entirely, while keeping the store/broadcast/render architecture (per-
session `BoardStore`, `subscribe`/`emit`, WebSocket push, canvas render)
unchanged.

## Goals / Non-Goals

**Goals:**
- Define the drawn-object data model (shape/line/overlay/label) and the
  cell-fill model that replace units/terrain.
- Decide how the six new/changed tools map onto `BoardStore` methods and
  `board-bridge.ts` tool registrations.
- Decide what happens to `board-engine/` and its tests.

**Non-Goals:**
- Redesigning the store/broadcast architecture itself (subscribe/emit,
  per-session instantiation, no persistence) — that carries forward
  unchanged from the current implementation.
- Any change to `dungeon-scenario-authoring` or `dungeon-baseline-changeset`
  (see proposal.md - Impact: out of scope).
- Object styling beyond what the spec requires (no z-order control,
  no grouping/layers, no animation) — the primitives are deliberately
  minimal; add more only if a real scenario need shows up.

## Decisions

**One discriminated-union `BoardObject` type, one flat array.**
Replace `units: PlacedUnit[]` with `objects: BoardObject[]`, where
`BoardObject` is a discriminated union on `kind: "shape" | "line" |
"overlay" | "label"`, each carrying an `id` (via `randomUUID()`, matching
today's unit-id generation) plus its kind-specific geometry
(`shape`: `{ shapeType, position, radius | (width,height), color, label? }`;
`line`: `{ points, color, style }`; `overlay`: `{ cells, color }`; `label`:
`{ position, text, color }`). Alternative considered: separate arrays per
kind (`shapes[]`, `lines[]`, `overlays[]`, `labels[]`). Rejected: it forces
every "any object" operation (`dungeon_move_object`, `dungeon_remove_object`,
and the object list `dungeon_get_board_state` returns) to search four
arrays and re-tag results with their kind anyway; one array with a `kind`
discriminant makes those operations a single filter/find and keeps id
uniqueness a single-array invariant instead of a cross-array one.

**Cells hold `fillColor: string` instead of `terrain: TerrainType`.**
Replace `BoardCell { terrain }` with `BoardCell { fillColor }`, defaulted
to a fixed neutral constant (e.g. `#e5e5e5`) in `emptyCells()`. No enum
validation — any string the caller passes is stored as-is, matching the
spec's "harness SHALL NOT interpret the color."

**`board-engine/` is deleted, not repurposed.** `movement.ts` (pathing),
`attack.ts` (footprint/penetration), and `unit-catalog.ts` (archetype
stats) have no successor in the generic model — nothing computes paths or
footprints anymore, so there's no code to migrate them into. `types.ts`'s
surviving shape concepts (`Cell`/point coordinates) move into
`board-state.ts` directly since the object model is small enough not to
warrant a separate module. Their `.test.ts` files are deleted alongside
the modules they test, not repurposed as tests for the new tools (the new
tools get their own tests against `BoardStore`, replacing
`board-bridge.test.ts`'s existing unit/movement/attack cases).

**`BoardStore` methods map roughly 1:1 to tools, replacing the current
five (`placeUnit`, `setTerrain`, `removeUnit`, `moveUnit`, `clearBoard`)
with: `setCellFill`, `drawShape`, `drawLine`, `drawOverlay`, `drawLabel`,
`moveObject`, `removeObject`, `clearBoard` (kept, generalized). Each
mutating method keeps today's pattern: validate, mutate, `this.emit()`,
return `OpResult`. `getState()` returns `{ width, height, cells, objects
}` instead of `{ width, height, cells, units }`.

**Point coordinates are plain `{ x, y }` numbers, not a wrapped type.**
The spec's continuous coordinate system (cell `(col,row)` spans
`(col,row)`–`(col+1,row+1)`) needs no server-side validation beyond what
each tool already checks (overlay cells in-bounds; line needs ≥2 points) —
points for shapes/lines/labels are allowed off-grid or between cells
intentionally, since the primitives are visual, not occupancy-tracked.
Only `dungeon_set_cell_fill` and `dungeon_draw_overlay` take integer cell
coordinates and get bounds-checked against `BOARD_WIDTH`/`BOARD_HEIGHT`;
shape/line/label positions are unchecked floats.

**`dungeon_move_object` takes a kind-appropriate payload, not a generic
JSON blob.** The tool's input schema is a union keyed by the object's
existing kind (looked up server-side by id before validating the new
geometry), so a client can't send line points to move a shape. Alternative
considered: one untyped `geometry: unknown` field validated ad hoc.
Rejected — losing schema-level shape/line/overlay/label distinction in the
tool input makes tool-call errors show up as opaque validation failures
instead of a typed pi tool-call rejection.

## Risks / Trade-offs

- [Removing movement/attack computation means the agent must manually
  keep a drawn "path" or "footprint" visually consistent with whatever
  it's describing in prose/Gherkin — nothing checks that a drawn line is
  actually reachable] → Accepted per proposal.md - Why: that check was
  the harness reimplementing game rules, which is exactly what this
  change removes. Scenario correctness is the agent's/designer's
  responsibility, not the board's.
- [Dropping the archetype catalog means no built-in visual vocabulary for
  "this is a ranger" — the agent must choose consistent colors/labels
  itself, and different sessions could label the same unit type
  differently] → Accepted; out of scope for this change. If consistency
  becomes a real problem, a follow-up change could add a convention
  (e.g. a skill/prompt guideline) without touching these tools' specs.
- [Deleting `board-engine/`'s tests loses their movement/attack edge-case
  coverage] → Acceptable: that code is deleted, not refactored, so its
  tests would just be testing removed behavior. New tests cover the
  replacement primitives' own edge cases (out-of-bounds cell fill/overlay,
  <2-point lines, unknown ids).

## Migration Plan

No persisted state to migrate — `BoardStore` is in-memory and
per-session with no durability across restarts (see Context), so there's
no stored data in the old `{ terrain, units }` shape to convert. Deploying
this change simply means: any board state a live session had before the
deploy is gone on restart, same as any other restart today. Tool-name
changes (e.g. `dungeon_place_unit` → `dungeon_draw_shape`) are breaking
for any in-progress agent conversation referencing the old tool names by
name in its context, but since sessions aren't long-lived across a server
restart in practice, no compatibility shim is needed.
