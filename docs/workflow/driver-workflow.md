# The driver workflow

How a strong model (the **driver**) plans work with a human, delegates the
typing to cheap fresh agents, verifies the result itself, and lets the human
close the loop.

Written 2026-08-21 from the way the dungeon-harness ↔ track-web work actually
ran. It is a workflow, not *the* workflow — but when an agent is pointed at this
file, this is what it should do.

## Why it is shaped this way

Three scarce things, spent deliberately:

| Scarce | Spent on | Not spent on |
|---|---|---|
| **The human's attention** | Decisions only they can make, and the final "yes, this is done" | Watching an agent type |
| **The driver's context** | The plan, the decisions, the review, the browser | Tool output from mechanical edits |
| **API budget** | One expensive planner | Expensive models doing rote implementation |

Everything below falls out of those three.

## The three roles

**The human** is the authority. They decide scope questions the code cannot
answer, they review plans before implementation, and **they alone say when a
change is done.** They are not a rubber stamp: assume they will independently
check the work.

**The driver** (an Opus-class model, long-lived) orients, asks the blocking
questions, authors the plan, gets it approved, commits it, delegates the
implementation, independently verifies what comes back, drives the browser, and
presents to the human. It keeps the thread of the work across the whole task —
which is exactly what a fresh agent cannot do.

**Apply agents** (Sonnet-class, one per change, cold start) implement one
already-approved plan and report. They never decide design, never commit, never
archive. Their tool output stays out of the driver's context; only their report
comes back.

## The loop

### 1. Orient before anything else

Read the plan of record — the human will usually name it — then confirm the
world matches it:

```bash
git -C <repo-a> status --short && git -C <repo-a> log --oneline -3
git -C <repo-b> status --short && git -C <repo-b> log --oneline -3
ls <repo-a>/openspec/changes/ <repo-b>/openspec/changes/
```

Say what you found, in a sentence or two, before proposing anything. If the doc
and the tree disagree, **that disagreement is a finding, not a tiebreak to
resolve silently.** The same goes for a plan that contradicts an older spec: the
older spec does not automatically win, and neither does the plan. Surface it.

### 2. Ask only the blocking questions

Use `AskUserQuestion`, and only for questions where different answers produce
materially different work — scope, externally observable behavior, an existing
requirement that would change meaning. Everything else: decide it, write the
assumption into the design doc, and move on.

Two per round is usually right. Recommend an option; do not present a survey.

Record the answers **in the plan of record**, not only in the change. A decision
that lives only inside a change directory disappears when the change is
archived, and the next reader re-litigates it. (This is a real failure mode in
this repo: a Non-Goal in an archived change hardened into a design position
nobody had ever chosen.)

### 3. Author the OpenSpec change — one per repo

Use the `propose-change` skill (or `new-change`/`continue-change` one artifact at
a time). It produces `proposal.md`, a delta spec per capability, `design.md`, and
`tasks.md`.

For two-repo work, that means **two changes** — see "Working across two repos"
below. Author the engine/producer side first; the consumer's design references
what the producer exports.

Then, in each repo:

```bash
openspec validate <change-name> --strict
```

Quality bar for the artifacts, learned the hard way:

- **Do not spec what this change will not deliver.** A scenario that depends on
  a guard landing in a *later* change is a lie that goes green later by accident.
- Write the delta against the spec **as it stands on disk** — re-read it, do not
  work from memory.
- `design.md` carries the decisions *and their alternatives*, because the apply
  agent reads it as instructions and must not re-decide them.
- `tasks.md` is what the apply agent works through, so each task must be
  verifiable and ordered by dependency. Put "present to the human, do not
  archive" in the final task explicitly.

### 4. Present the plan, and let the human approve it

Summarize what each change does, what you decided without asking and why, and
anything you deliberately cut. Then stop.

### 5. Commit the plan before any code is written

Once approved, commit the change directories (and any edit to the plan of
record) on their own:

```bash
git add openspec/changes/<change-name> docs/<plan-of-record>.md
git commit
```

Why this matters, concretely:

- The apply agent leaves a dirty tree. If the plan is not already committed,
  plan and implementation smear into one diff and neither can be reviewed or
  rolled back on its own.
- `git diff` during review then shows **exactly** what the apply agent did,
  with nothing of yours mixed in.
- If the implementation goes wrong, `git checkout -- .` returns you to an
  approved plan rather than to nothing.

Commit each repo separately, with its own message.

### 6. Delegate the implementation to a fresh apply agent

One agent per change, per repo, `model: sonnet`, no worktree when the repos are
symlinked to each other (a worktree breaks a relative `file:` dependency).

The prompt is the whole job. Template:

```
You are implementing an OpenSpec change in the <repo> repo at <abs path>
(branch <branch>). Work directly in that repo — no worktree.

Start by invoking the `apply-change` skill with the change name <name>, and
follow it. The planning artifacts are at <abs path>/openspec/changes/<name>/ —
read proposal.md, design.md, specs/**/spec.md, and tasks.md in full before
writing code. design.md holds decisions already made; implement them as written
rather than re-deciding them.

Scope: tasks <n>–<m> only. <what the driver keeps for itself, and why>

Context you will not get from the files alone:
- <the governing invariant of this codebase, stated as a rule they can apply>
- <what already landed elsewhere that they depend on, and where to read it>
- <what is deliberately NOT in scope yet, so they don't "helpfully" add it>
- Match the surrounding code's style, especially comment density. <file> is the
  model to follow.

Constraints:
- Never kill or restart the dev servers. <ports>. Don't start a second copy.
- Do NOT commit and do NOT archive.
- If a test only goes green because a guard was disabled or an assertion
  weakened, re-aim the test instead, and say so in your report.

When done, run <test command> and <typecheck command>, and report:
1. What you implemented, file by file.
2. Exact test/typecheck results, failures pasted verbatim.
3. Every test you changed and why — distinguishing "fixture needed updating"
   from "this asserted behavior that no longer exists".
4. Anything in the plan that turned out wrong, impossible, or ambiguous. Say it
   plainly rather than working around it silently.
```

The "governing invariant" line is the highest-value sentence in the prompt. A
cold agent will happily write a rule check in the wrong layer unless told, in one
sentence, what this codebase refuses to do.

### 7. Verify what comes back — do not take the report at face value

A completion report is a claim. Check it, cheaply:

```bash
git -C <repo> status --short && git -C <repo> diff --stat
```

- **Read the new code.** Not a skim: the parts the design named as decisions.
- **Re-run the tests yourself**, scoped to the package that changed if the full
  suite is slow.
- **Confirm the blast radius** matches the plan — nothing touched that the
  proposal's Impact section did not name.
- Report what *you* verified separately from what the agent claimed. If you
  found something small (a duplicated constant, a store read where a state read
  was expected), say it and say whether it blocks.

### 8. Verify in the browser — the driver does this

Tests going green and the thing working are different claims, and the second one
is what the human is going to check. So check it first.

**Rules that are not negotiable:**

- **Never kill or restart the dev servers.** The human keeps a server + client
  running for every app in the workspace. `tsx watch` and Vite pick up edits by
  themselves. If a restart is genuinely needed (a changed `.env`), **ask**.
- Don't start a second copy of anything already running — `lsof -i:<port>` first
  if unsure.
- Never squat the human's standard ports. Anything you start yourself goes on a
  port they don't use, and you stop what you start.

**Driving it:**

```bash
playwright-cli open http://localhost:5177   # client-dungeon; deck is 5175
playwright-cli snapshot
playwright-cli click <ref>  /  fill <ref> <text>  /  screenshot
```

The harnesses use cookie-session auth — ask the human for the password rather
than guessing. For track-web, which needs a real login, stand up a **disposable
second instance** rather than touching the dev database
(`track-web/docs/dev-second-instance.md`).

**What to actually do:** walk the path a human would, end to end, including the
refusals. "The button exists" is not verification; "the button is disabled with
the engine's reason, and stepping back re-enables it" is. Take a screenshot of
anything you will describe in the presentation.

> **Could this be delegated?** Yes, and it is a reasonable next step: a
> browser-verification agent with a scripted checklist, returning screenshots and
> a pass/fail per step, would keep a lot of `snapshot` output out of the driver's
> context. Two reasons it currently stays with the driver: judging *whether what
> the screen shows is right* needs the design context the driver has and a fresh
> agent doesn't, and a browser agent that misreads a refusal as a bug costs more
> to unpick than it saves. **Suggested split if you do delegate it:** the agent
> executes the click-path and returns raw observations and screenshots; the
> driver interprets them. Never let the verifying agent be the one that decides
> it passed.

### 9. Present, then wait

Give the human: what landed, what the tests say, what you checked in the browser,
what you did *not* check, and anything you found while reviewing. Then stop.

**Do not archive on your own judgement.** Archiving asserts the change is done
and checked, and that assertion is the human's to make. Equally, **do not start
the next change while a finished one sits unpresented.**

If a change is only partly verified, present it as partly verified and say what
is outstanding, rather than archiving any of it.

### 10. Once they confirm: sync, archive, commit

In dependency order — producer repo first:

```bash
openspec validate <change-name> --strict
openspec archive <change-name> -y      # folds the delta into openspec/specs/
```

Then commit the implementation (and the archived change) in each repo. Then, and
only then, start the next piece of work.

## Working across two repos

The dungeon work spans two repos with **separate OpenSpec roots**:

| | Path | Branch | Holds |
|---|---|---|---|
| harness | `/Volumes/Data/work/pi/harness` | `dungeon-harness-rebuild` | the bench (a host) |
| track-web | `/Volumes/Data/work/pi/track-web` | `dev` | `packages/dungeon-engine` (the rules) |

The harness consumes the engine over a relative `file:` path, which npm resolves
as a **symlink** — so an uncommitted engine edit is live in the harness
immediately. No `npm install`, no rebuild, and no worktree (a worktree would
break the relative path).

Consequences worth stating:

- **Two changes, one per repo.** They are separate OpenSpec roots; a change in
  one cannot carry a delta for the other's specs.
- **Neither repo's work is complete without the other's.** Say so in both
  proposals, and do not archive the producer before the consumer has been
  verified — the consumer is where you find out the API was wrong.
- **Engine first, host second**, in planning, in implementation, and in
  archiving.
- **Both trees clean, or explain why not**, at every handoff.
- The producer's change should note its consumer by name, and vice versa, so a
  cold reader of either finds the other.

### The same-spec pile-up rule

A delta is written against the main spec **as it stands**, and archiving is what
folds a delta in. So two unarchived changes that modify the same capability will
collide: `openspec archive` refuses the second with *"current spec contains
scenario(s) not present in the modified block"*, and reconciling by hand is
exactly the drift the format exists to prevent.

Changes touching *different* capabilities can sit safely. It is same-spec
pile-up that hurts. In practice: **finish, present, and archive a change before
authoring the next one against the same capability.**

## What stays with the driver

| Task | Who | Why |
|---|---|---|
| Orientation, git/OpenSpec state | Driver | It is three commands and it anchors everything after |
| Blocking questions to the human | Driver | Only the driver knows what is actually ambiguous |
| Authoring the plan | Driver | This is the expensive thinking |
| Committing the plan | Driver | Approval and commit are one moment |
| Implementation | **Apply agent** | Mechanical, bounded, and cheap when delegated |
| Reviewing the diff | Driver | The agent cannot review itself |
| Re-running tests | Driver | Cheap, and a report is a claim |
| Browser verification | Driver *(delegable — see §8)* | Judging correctness needs design context |
| Presenting | Driver | It is a conversation with the human |
| Archiving | Driver, **after the human says so** | The assertion is the human's |

## Failure modes this workflow is built against

- **Archiving on your own judgement.** The human may verify independently and
  find something; an archived change is the harder thing to revisit.
- **Green tests standing in for verification.** A guard disabled "for the bench"
  once let twenty-one ordering violations pass unnoticed for three days.
- **A deferral hardening into a design position.** "Not yet" written in a
  Non-Goal reads as "never" to the next agent. Decisions belong in the plan of
  record, with their reasons.
- **The apply agent redesigning.** Prevented by a `design.md` that states the
  decisions *and* the alternatives, and a prompt that says implement as written.
- **Context burned on tool output.** The reason implementation is delegated at
  all: the driver should end the task still holding the thread.
- **Working around an ambiguity silently.** Both driver and apply agent report
  what was ambiguous. A worked-around ambiguity surfaces later as a design flaw
  nobody chose.

## A worked example

The dungeon bench's setup path (2026-08-21) ran exactly this loop:

1. Human named the plan of record and asked what was next. Driver read it,
   checked both trees, reported: step 2, not started.
2. Driver found two questions the doc did not answer (are unit-definition tweaks
   and current-HP edits still allowed mid-round?) and asked both in one round.
   Answers went into the plan of record, not just the change.
3. Driver authored `dungeon-bench-setup-surface` (track-web: the engine's
   bench-only setup API) and `dungeon-bench-setup-adoption` (harness: the bench
   adopts it, drops its own rule checks). Both validated `--strict`.
4. Driver presented; human approved; driver committed both plans, one commit per
   repo.
5. A Sonnet agent applied the engine change. Driver re-read the new module,
   re-ran the engine suite (213 passing, 34 new), confirmed the diff touched only
   the engine package, and reported two small observations that did not block.
6. A second Sonnet agent applied the harness change, scoped to code and tests —
   browser verification deliberately withheld from it.
7. Driver verifies in the browser, presents, waits, and archives only on the
   human's word.
