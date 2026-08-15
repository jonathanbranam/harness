---
name: introspect
description: Common workflows for the introspection harness.
---

# Introspection Harness Skill

Use this skill when the user is working with the introspection harness.

## Key concepts

- The harness runs a pi AgentSession in-process behind a Hono server.
- Browser prompts are forwarded over WebSocket and events are streamed back.
- The workspace sandbox is the only filesystem area the agent should modify.

## Common patterns

### Explore the current workspace

1. Use `ls` or `find` to list files.
2. Use `read` to inspect files before editing.

### Make a small change

1. Read the target file.
2. Use `edit` or `write` to update it.
3. Briefly summarize what changed.
