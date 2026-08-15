# Phase 4 — OpenSpec, Skills, Guides, and Sensors

## Status

not started

## Goal

Integrate the durable shelves from the ADM talk framework: OpenSpec artifacts, loaded skills, and human-authored guides and sensors. This phase turns the harness from a generic event viewer into a system for constraining and improving pi-driven development.

## Scope

### In scope

- OpenSpec workspace indexer for the sandbox folder.
- Plan shelf UI showing proposals, specs, design docs, and tasks.
- Skills shelf UI showing loaded skills and their metadata.
- Guide registry and editor.
- Sensor registry and editor.
- Introspection extension enforcement of guides and execution of sensors.
- End-to-end verification: a sensor flags an issue, the user writes a guide, and the next live session loads and applies it.

### Out of scope

- Tool call trace, approval flow, or file system mirror (covered in Phase 5).
- Polishing UI visuals.
- Model-backed sensors.

## Acceptance Criteria

- [ ] The plan shelf lists OpenSpec changes and artifacts from the sandbox.
- [ ] The skills shelf lists skills loaded by pi for the current session.
- [ ] A user can create, edit, enable, and disable guides from the UI.
- [ ] A user can create, edit, enable, and disable sensors from the UI.
- [ ] Guides in scope `system_prompt` are appended to the system prompt.
- [ ] Guides in scope `tool_call` can block matching tool calls.
- [ ] Sensors run after tool execution and produce pass/fail reports visible in the UI.
- [ ] A guide authored in response to a sensor report affects subsequent live sessions.

## Reference

See [`../proposal.md`](../proposal.md) for OpenSpec integration, guide/sensor schema, and feedback loop details.

## Proposed OpenSpec Change

Create a new OpenSpec change named `introspect-harness-phase-04` using the default spec-driven schema. Required artifacts:

- `proposal.md` — this phase's goal, scope, and acceptance criteria.
- `specs/openspec/spec.md` — functional spec for OpenSpec workspace indexing and artifact display.
- `specs/skills/spec.md` — functional spec for skills shelf display.
- `specs/guides/spec.md` — functional spec for guide authoring and enforcement.
- `specs/sensors/spec.md` — functional spec for sensor authoring and execution.
- `design.md` — registry, extension, and UI design.
- `tasks.md` — implementation tasks.

## Notes

- Guides and sensors should be stored in the sandbox project's `.pi/guides/` and `.pi/sensors/` directories so they are durable and portable with the demo.
- Keep sensor execution fast and deterministic for this phase. Model-backed sensors can be added later.
- The feedback loop is the key demo story; make sure it is easy to narrate.
