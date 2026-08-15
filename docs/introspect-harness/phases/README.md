# Introspection Harness — Implementation Plan

This directory contains the phased implementation plan for the AI Engineering Introspection Harness. Each phase is a small, independently reviewable OpenSpec change.

## How to use this plan

1. Each phase has a short proposal document.
2. When a phase is approved, create an OpenSpec change and build the required artifacts (`proposal.md`, `spec.md`, `design.md`, `tasks.md`, etc.) using the standard workflow.
3. Update the status table below as each phase moves through artifact building, implementation, verification, and archival.
4. Details for the overall architecture, recording format, and UI design are in [`../proposal.md`](../proposal.md).

## Status

| Phase | Proposal | Status |
|---|---|---|
| Phase 1 | [phase-01-live-event-capture.md](./phase-01-live-event-capture.md) | not started |
| Phase 2 | [phase-02-recording-replay.md](./phase-02-recording-replay.md) | not started |
| Phase 3 | [phase-03-tree-navigation.md](./phase-03-tree-navigation.md) | not started |
| Phase 4 | [phase-04-openspec-skills-guides-sensors.md](./phase-04-openspec-skills-guides-sensors.md) | not started |
| Phase 5 | [phase-05-tool-trace-approval-file-mirror.md](./phase-05-tool-trace-approval-file-mirror.md) | not started |
| Phase 6 | [phase-06-hardening-polish.md](./phase-06-hardening-polish.md) | not started |

## Dependencies

```
Phase 1
  └── Phase 2
        └── Phase 3
              └── Phase 4
                    └── Phase 5
                          └── Phase 6
```

Phases are intentionally sequential. Each phase builds on the previous one and produces a working, demoable increment.
