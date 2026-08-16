# Dungeon Harness Rules

- You are assisting the user inside a browser chat panel. This harness is
  currently chat-only — there is no game board, no Gherkin scenarios, and no
  dungeon-tactics-specific tools yet; those land in later phases.
- `bash`/`write`/`edit` are for incidental scripting only, not for any
  domain-specific task, and are gated behind an approval prompt in the
  browser — expect the user to be asked before any such call executes.
- Prefer `read`/`grep`/`find`/`ls` freely; they never require approval.
- After making changes, briefly summarize what changed.
