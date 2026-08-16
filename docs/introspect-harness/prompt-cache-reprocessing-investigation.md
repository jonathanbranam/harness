# Prompt-Cache Reprocessing in Recorded Introspect Sessions

**Status: root cause identified and confirmed live — `PI_CACHE_RETENTION=long`
substantially fixes it.** A second pass through this investigation
(2026-08-16) traced the leading hypothesis all the way into
`@earendil-works/pi-ai`'s actual request-building code, identified
`PI_CACHE_RETENTION=long` as the one lever actually wired up to affect this
in the current SDK, and a live re-recording with that env var set confirms a
large, measurable improvement. See "Second-pass findings" and "Live test
results" near the bottom for the full story; the rest of this document is
the original spike write-up, left intact.

---

This is not a design doc for a
change — it's the write-up requested to pause and hand off a finding made
while building mockups for `openspec/changes/redesign-introspect-ui`
(`mockups/apparatus-mockup-linear-stack.html` and
`mockups/apparatus-mockup-grid.html`). That change's design.md links back
here from its Open Questions section and is blocked on whatever this spike
concludes.

## What we observed

Recording `0e6da094-3c45-4916-9297-b5270a1e36f0` under
`introspect-harness-server/data/recordings/` is a real 7-prompt, 58-turn
session (create → continue → fast-forward → apply → sync/archive an OpenSpec
change), run against the `moonshotai/Kimi-K2.7-Code` model served through
DeepInfra. Its final `context_usage` reading is 46,606 / 262,144 tokens
(17.8%).

Summed across all 58 `message_end` events, `usage.input` totals roughly
128,000–143,000 tokens (recomputed slightly differently across a couple of
extraction passes while building the mockups, but consistently ~3x the
session's real final size). That gap is the puzzle: `usage.input` is
supposed to be "tokens this call had to process fresh, not served from
cache" — if it were purely new content, the running total couldn't exceed
the final context size. It does, by a lot.

Plotting `usage.input` / `usage.cacheRead` per turn shows the spikes are not
evenly distributed — they cluster immediately after each `agent_start`
event (i.e., each new top-level user prompt). Within a single `agent_start`
run (a multi-turn tool-calling loop answering one prompt), `cacheRead`
climbs turn over turn as expected — but the *next* `agent_start` after that
starts with a large `input` spike and a `cacheRead` that's lower than where
the previous run left off. Concretely, from the raw recording:

```
--- agent_start #3 ---
  input=  1210 output=  157 cacheRead=  5504 ...
  ...
  input=  1007 output=  456 cacheRead=  7840 ...   (end of run #3, cacheRead=7840)
--- agent_start #4 ---
  input=  3920 output=  234 cacheRead=  6688 ...   (start of run #4, cacheRead drops to 6688)
```

Same pattern repeats at every `agent_start` boundary through all 7 prompts.
Within a run, caching works and grows. Across the boundary, a chunk of the
same conversation gets reprocessed as if new.

`usage.reasoning` was `0` on every single message in this session (a
separate, already-resolved finding — see the parent change's design.md — the
model *did* produce substantial `thinking_delta` text, 18,853 characters of
it, just not accounted for in `usage.reasoning`). Not directly related to
the caching question, but recorded here since it came from the same
extraction pass and is a similar "the usage field doesn't tell the whole
story" shape of problem.

## Why this matters (beyond the Apparatus mockup)

Two separate consequences, one about the UI and one about real cost/latency:

1. **Apparatus design**: a pill/cell labeled "new input" that's actually
   ~80% stale-conversation reprocessing is misleading — it looks like the
   model is being fed a firehose of fresh information every turn, when
   mostly it's re-paying for things already said. Whether to split this
   into two visible categories is exactly what's paused in the parent
   change.
2. **Real cost/latency**: if this pattern is real and not a recording
   artifact, every new prompt in a multi-turn session on this
   model/provider pairing is paying full input-token price (DeepInfra:
   $0.74/M vs. $0.15/M for `cacheRead`, per `~/.pi/agent/models.json`) to
   reprocess a large fraction of the conversation history it already paid
   to process once. That's a real, non-trivial cost and latency tax, not
   just a visualization nit — worth knowing about independent of anything
   this harness's UI does with it.

## How `introspect-harness-server` uses `AgentSession` (one theory ruled out)

The first thing worth checking was whether the harness itself was
inadvertently causing this — e.g. by creating a fresh `AgentSession` per
prompt (which would obviously break any cache continuity).

It doesn't. `session-store.ts`'s `getOrCreateSession` creates exactly **one**
`AgentSession` per browser session (keyed by the auth token) via
`createAgentSession(...)`, caches it in the module-level `sessions` Map, and
`websocket.ts` calls `hs.session.prompt(msg.text, ...)` on that same,
long-lived session object for every subsequent prompt in the conversation.
That's the standard, correct multi-turn usage pattern — this is not a case
of recreating the session and losing continuity that way.

## A second theory, checked against the SDK's own docs, and mostly ruled out

`introspection-bridge.ts` has this handler, with a comment claiming resource
(and by implication, skill) discovery happens fresh before every turn:

```ts
pi.on('resources_discover', (event) => {
  // Resources are discovered before each agent start; the foundation
  // payload is refreshed by before_agent_start with the loaded skills.
  return { skillPaths: [] }
})
```

If true, that would be a plausible cache-buster: if the set or ordering of
skills injected into the system prompt could differ turn to turn, the
system prompt's text would differ, and prefix-based prompt caches (which
most providers use — a cache hit requires an exact prefix match) would miss
for the *entire* request from that point on, not just the new content.

But the SDK's own lifecycle documentation
(`node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`, "Lifecycle
Overview", ~line 275) shows `resources_discover` firing only at startup, on
`/new`/`/resume`, on `/fork`/`/clone`, or on an explicit reload — **not** on
every prompt. The per-prompt event is `before_agent_start`, which reads from
already-discovered resources (`event.systemPromptOptions.skills`) rather
than re-running discovery. So the code comment in
`introspection-bridge.ts` appears to be wrong (possibly describing an
earlier SDK version, or confusing `resources_discover` with
`before_agent_start`) — worth fixing the comment regardless, but it doesn't
fully explain the observed pattern by itself. It's not ruled out entirely,
though: `before_agent_start`'s system-prompt construction could still vary
turn to turn for reasons unrelated to `resources_discover` (e.g. workspace
state changes if `AGENTS.md` or discovered context files differ as the
agent edits files mid-session). That's still open — see avenue 3 below.

## Leading hypothesis: no pi-directed caching for this model, and no session affinity

This is the theory the evidence points at most strongly, and it doesn't
implicate the harness's code at all.

`moonshotai/Kimi-K2.7-Code` is a **custom model entry** in
`~/.pi/agent/models.json` (see `docs/pi-setup.md`), registered under
`"api": "openai-completions"` with no `compat` overrides:

```json
{
  "id": "moonshotai/Kimi-K2.7-Code",
  "name": "Kimi K2.7 Code (DeepInfra)",
  "reasoning": true,
  "input": ["text", "image"],
  "contextWindow": 262144,
  "maxTokens": 16384,
  "cost": { "input": 0.74, "output": 3.50, "cacheRead": 0.15, "cacheWrite": 0 }
}
```

pi-ai's `OpenAICompletionsCompat` type
(`node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/types.d.ts`,
~line 487) has a `cacheControlFormat?: "anthropic"` field: "Cache control
convention for prompt caching. 'anthropic' applies Anthropic-style
`cache_control` markers to the system prompt, last tool definition, and last
user, assistant, or tool-result text content." This model's entry doesn't
set it (there's no `compat` block at all), so **pi never sends any explicit
cache-control markers for this model.** Any caching that happens (the
nonzero `cacheRead` we do see within a run) is entirely automatic and
opportunistic on DeepInfra's serving side — pi is just passively reporting
whatever `cache_read_input_tokens`-equivalent DeepInfra's response includes,
not directing it.

The same `OpenAICompletionsCompat` type also has:

```ts
/** Whether to send session-affinity data from `options.sessionId`. Default: false. */
sendSessionAffinityHeaders?: boolean;
/** Session-affinity header format: `openai` sends `session_id`, `x-client-request-id`,
 *  and `x-session-affinity`; ... */
sessionAffinityFormat?: SessionAffinityFormat;
```

This is off by default and unset for this model. If DeepInfra's backend for
this model is a load-balanced pool of replicas (plausible for a
vLLM-style deployment) without sticky routing, then a prefix cache living in
one replica's memory is simply unavailable the moment a follow-up request
lands on a different replica — regardless of whether the prompt content
matches byte-for-byte. That would produce exactly the observed pattern:
caching works *within* a burst of rapid, likely-same-replica requests (a
single `agent_start`'s tool-calling loop), and resets whenever there's a
gap before the next `agent_start` (waiting on the user, or just enough
delay/load-balancer entropy for the next request to land elsewhere).

## Suggested investigation avenues, cheapest first

1. **Enable session affinity for this model and re-record the same
   workflow.** Add a `compat` block to the `moonshotai/Kimi-K2.7-Code` entry
   in `~/.pi/agent/models.json`:
   ```json
   "compat": { "sendSessionAffinityHeaders": true, "sessionAffinityFormat": "openai" }
   ```
   This is a config-only change, no code, cheap to try and revert. If the
   `input` spikes at `agent_start` boundaries disappear or shrink, that's a
   strong confirmation of the routing-affinity hypothesis and a real fix,
   not just a diagnosis.
2. **Check DeepInfra's own docs for this endpoint's prompt-caching
   behavior** — TTL, eviction policy, whether they document/require session
   affinity for cache reuse, and whether `moonshotai/Kimi-K2.7-Code`
   specifically supports it (some hosted models on DeepInfra may not).
3. **Confirm or rule out system-prompt drift directly**, rather than by
   inference from the SDK docs: log (or hash) the exact system prompt text
   pi sends on each `agent_start` within one session and diff them
   turn-to-turn. If they're byte-identical, that rules out prefix drift
   entirely, isolating the cause to routing/TTL. If they differ, find out
   what's changing (discovered context files? `AGENTS.md` mtime-driven
   content? something in `before_agent_start`'s chained system-prompt
   handling from `permission-gate.ts` or `introspection-bridge.ts`?).
4. **Control comparison against a provider with pi-directed caching.** Run
   the same multi-turn OpenSpec workflow against an Anthropic Claude model
   (which does get `cacheControlFormat: "anthropic"` and explicit
   `cache_control` markers from pi) through the same harness code path. If
   Claude shows stable cross-turn cache reuse and Kimi/DeepInfra doesn't,
   that isolates the difference to the provider/model side, not the
   harness's SDK usage — makes the case airtight either way.
5. **Fix or clarify the misleading comment** in
   `introspect-harness-server/src/pi-extensions/introspection-bridge.ts`'s
   `resources_discover` handler regardless of what the other avenues turn
   up — it currently asserts per-turn discovery that the SDK's documented
   lifecycle doesn't support, which could mislead the next person who reads
   it.

## What this doesn't block

This is scoped to the `redesign-introspect-ui` Apparatus category question
only. It doesn't block Apparatus's layout/resize work, stick-to-bottom
scroll, or the thinking-pill work already resolved in that change's
design.md — those don't depend on how the "input" bucket is subdivided.

---

## Second-pass findings (2026-08-16)

This pass worked avenue 3 (system-prompt drift) and avenue 2 (DeepInfra
docs) from the list above, then went further than avenue 1 by reading
`@earendil-works/pi-ai`'s actual compiled request-building code instead of
just its type declarations. Avenues 1 and 4 (re-record live with a changed
setting; a control run against an Anthropic model) are still open — see
"What's still open" below.

### Avenue 3 resolved: system-prompt drift is definitively ruled out

The recording captures the full resolved system prompt (plus `skills`,
`guides`, `sensors`) on every `foundation_update` event — one per
`agent_start`, emitted from `before_agent_start` in
`introspection-bridge.ts`. Hashing all 7 gives:

```
line   systemPrompt sha256[:12]   len     skills sha256[:12]   guides   sensors
2      a8d7d00ec4c0               18158   ec08d1abb1ad         (empty)  (empty)
133    a8d7d00ec4c0               18158   ec08d1abb1ad         (empty)  (empty)
426    a8d7d00ec4c0               18158   ec08d1abb1ad         (empty)  (empty)
1283   a8d7d00ec4c0               18158   ec08d1abb1ad         (empty)  (empty)
6300   a8d7d00ec4c0               18158   ec08d1abb1ad         (empty)  (empty)
6787   a8d7d00ec4c0               18158   ec08d1abb1ad         (empty)  (empty)
7394   a8d7d00ec4c0               18158   ec08d1abb1ad         (empty)  (empty)
```

Byte-identical across all 7 top-level prompts, no exceptions. The entire
"foundation" (system prompt + skills) that pi sends is a fixed, unchanging
prefix for this whole session. There is no prefix drift for a provider-side
cache to miss on. This closes avenue 3 entirely — the cause is not
in workspace/skill content changing turn to turn.

(The misleading `resources_discover` comment flagged in avenue 5 has been
fixed regardless, since it was wrong independent of this finding.)

### New evidence: the reset isn't just at `agent_start` boundaries

Re-extracting the full `input`/`cacheRead` sequence (not just the first/last
call of each run, as the original pass did) shows the cache resets
**within** a single `agent_start` burst too, not only between them — and it
does it in a very specific, repeating way. From `agent_start` run #4 (a
17-call tool-loop):

```
seq=10 input=3920 cacheRead= 6688
seq=11 input=  85 cacheRead=10816
seq=12 input=4972 cacheRead= 6688   <- back to exactly seq=10's cacheRead
seq=13 input=1110 cacheRead=11264   <- close to seq=11's cacheRead + growth
```

and again at the very next run boundary (#4 -> #5):

```
seq=26 input= 880 cacheRead=17344   (end of run #4)
seq=27 input=6068 cacheRead=10592   (start of run #5)
seq=28 input= 873 cacheRead=16640   <- jumps back near run #4's level
seq=29 input=8322 cacheRead=10592   <- exactly seq=27's cacheRead again
```

and once more crossing into run #7:

```
seq=39 input=10404 cacheRead=16672  (start of run #6)
...
seq=46 input= 9727 cacheRead=27104  (start of run #7)
seq=47 input= 5207 cacheRead=36864
...
seq=50 input=18002 cacheRead=27072  <- nearly identical to seq=46's cacheRead
```

The exact-value recurrences (`6688` twice, `10592` twice, `27072`/`27104`
essentially the same value twice, calls apart) are the tell: this isn't
noise or a monotonic "cache decays over time" curve. It looks like requests
are landing on a small, fixed-size pool of backend replicas in round-robin
or load-balanced fashion, each independently holding (and slowly growing)
its own prefix-cache watermark for this conversation, with **no session
affinity pinning consecutive calls — even calls milliseconds apart within
one tool-loop — to the same replica.**

Full run-by-run summary (`n` = assistant calls in the run):

| run | n  | first (input/cacheRead) | last (input/cacheRead) | sum(input) |
|-----|----|--------------------------|--------------------------|-----------:|
| 1   | 2  | 5528 / 0                 | 68 / 5536                | 5,596 |
| 2   | 2  | 5621 / 0                 | 140 / 5696                | 5,761 |
| 3   | 5  | 1210 / 5504               | 1007 / 7840               | 4,566 |
| 4   | 17 | 3920 / 6688               | 880 / 17344                | 18,641 |
| 5   | 12 | 6068 / 10592              | 962 / 24192                | 21,615 |
| 6   | 7  | 10404 / 16672             | 1233 / 35328               | 33,330 |
| 7   | 13 | 9727 / 27104              | 231 / 46432                | 38,672 |

Sum of `usage.input` across all 58 assistant calls: **128,181** tokens —
matching the original pass's "~128k–143k" estimate, against a final context
size of 46,606. Sum of `cacheRead` across the same calls: 1,232,064 (high
because `cacheRead` is cumulative-per-call, not a delta).

### Root cause, confirmed in code (not just types)

The original doc's leading hypothesis — no pi-directed caching, no session
affinity — is correct, but the code shows *why* more precisely than the
type declarations alone suggested. In
`pi-ai/dist/api/openai-completions.js`, `buildParams()`:

```js
prompt_cache_key: (model.baseUrl.includes("api.openai.com") && cacheRetention !== "none") ||
    (cacheRetention === "long" && compat.supportsLongCacheRetention)
    ? clampOpenAIPromptCacheKey(options?.sessionId)
    : undefined,
prompt_cache_retention: cacheRetention === "long" && compat.supportsLongCacheRetention ? "24h" : undefined,
```

and `cacheRetention` itself:

```js
function resolveCacheRetention(cacheRetention, env) {
    if (cacheRetention) return cacheRetention;
    if (getProviderEnvValue("PI_CACHE_RETENTION", env) === "long") return "long";
    return "short";
}
```

So for a DeepInfra-routed model (`baseUrl` is
`https://api.deepinfra.com/v1/openai`, not `api.openai.com`), **both
`prompt_cache_key` and `prompt_cache_retention` stay `undefined` unless
`cacheRetention` resolves to `"long"`** — which requires either an explicit
per-call `options.cacheRetention` (not exposed anywhere in
`@earendil-works/pi-coding-agent`'s public SDK — `PromptOptions` and
`createAgentSession()`'s options have no such field) or the environment
variable `PI_CACHE_RETENTION=long`, which isn't set anywhere in this repo
(checked `introspect-harness-server/.env*`, root `.env*`).

Separately, `createClient()` gates the session-affinity headers
(`session_id`, `x-client-request-id`, `x-session-affinity`) on
`sessionId && compat.sendSessionAffinityHeaders`. Grepping the entire
compiled `@earendil-works/pi-coding-agent` SDK (`agent-session.js`,
`model-runtime.js`, `index.js`) for anywhere that populates
`options.sessionId` on a model call turns up **nothing** — the only
`sessionId` in `agent-session.js` is the session's own id, used for
`.jsonl` file naming and a `cleanupSessionResources` call, never threaded
into a model request. So the original doc's avenue 1 as literally proposed
— adding `compat: { sendSessionAffinityHeaders: true, sessionAffinityFormat:
"openai" }` to the `moonshotai/Kimi-K2.7-Code` entry — **would not change
anything**: the header-emitting branch can never fire because `sessionId` is
always `undefined` at that call site in the current SDK version. This is a
correction to the original doc, not just an addition.

For completeness: `getCompat()`'s auto-detection (`detectCompat()`, used
since the harness's `models.json` entry sets no `compat` block at all) does
resolve `supportsLongCacheRetention: true` and `sendSessionAffinityHeaders:
false` for this DeepInfra/Kimi pairing — so *if* a session id were ever
threaded through, the retention lever would already be eligible; only the
affinity-header lever is structurally dead given the current SDK.

### DeepInfra's own docs (avenue 2)

From `docs.deepinfra.com/chat/prompt-caching`:

- Caching is automatic, no parameters required: a hit requires "the
  beginning of your prompt [to match] a cached prefix from a recent request
  **on the same model**." "Even a single character difference will
  invalidate the cache."
- `prompt_cache_key` is optional but recommended for multi-turn sessions —
  "Requests with the same key and model share a KV cache" — with a
  suggested session-scoped format like `"user123-chat456"`.
- Default retention: "Cache entries expire after a period of inactivity"
  (duration unspecified in the docs). A paid "Prompt cache retention" option
  extends this to an explicit 5 minutes or 1 hour.
- Caches are described as "per-model and per-account," not documented as
  per-replica — DeepInfra's docs say nothing about load balancing or replica
  routing either way, so the replica-pool theory remains an inference from
  the observed pattern, not something confirmed in writing.
- One open risk for the suggested fix below: pi sends `prompt_cache_retention:
  "24h"` when it sends the field at all, but DeepInfra's docs only document
  "5 minutes or 1 hour" as valid retention windows — whether DeepInfra
  accepts, clamps, or rejects `"24h"` is unverified.

### What's still open

1. **Avenue 1, revised**: the actionable cheap experiment is no longer
   "add `sendSessionAffinityHeaders`" (dead per above) but **set
   `PI_CACHE_RETENTION=long` in `introspect-harness-server`'s environment
   and re-record the same workflow.** This is a genuine live test of the
   "short default TTL is why the gap between prompts causes a full/partial
   miss" half of the hypothesis, independent of session affinity (since
   `prompt_cache_key` will still be `undefined` for DeepInfra either way —
   `options.sessionId` is never populated). Caveats: (a) this env var is
   global to the whole server process and affects every openai-completions
   model configured, not just Kimi; (b) requires a server restart to pick up
   (`tsx watch` won't hot-reload env changes — see CLAUDE.md) — ask before
   restarting, per this repo's "never kill dev servers" rule; (c) the "24h"
   vs. "5m/1h" mismatch above means it may simply no-op against DeepInfra.
2. **Testing the session-affinity/`prompt_cache_key` half of the hypothesis
   properly** requires the SDK itself to thread a stable `sessionId` into
   `GenerateOptions` for each model call — that's a gap in
   `@earendil-works/pi-coding-agent`/`pi-ai` upstream, not something this
   harness's extension code can supply (there's no hook in the documented
   extension surface for injecting per-call model options). Worth filing
   upstream if the `PI_CACHE_RETENTION=long` experiment above doesn't fully
   close the gap on its own.
3. **Avenue 4** (control run against an Anthropic model through the same
   harness code path) is unchanged from the original doc and still the
   cleanest way to make the "provider/model side, not harness SDK usage"
   case airtight — not attempted this pass.

## Live test results (2026-08-16, same day)

`PI_CACHE_RETENTION=long` was added to `introspect-harness-server/.env` and
a fresh 7-prompt session was recorded against the same
`moonshotai/Kimi-K2.7-Code` (DeepInfra) model:
`introspect-harness-server/data/recordings/17232253-18e0-4ba1-923c-66e68771edad/`.
This is not the identical script as the original recording (different
prompts, shorter overall — final context 33,547 tokens vs. 46,606), so
absolute totals aren't directly comparable, but the *shape* of the
reprocessing pattern is, and it changed dramatically:

**System prompt is still byte-identical across all 7 `agent_start`s**
(hash `ca74421af042`, confirming the fix didn't touch avenue 3 and drift is
still not a factor — it's just a shorter prompt this time, 7,528 chars vs.
18,158, presumably because the recorded workspace/skills state differed).

**Intra-run cache stability — the oscillation is gone.** The original
recording had `cacheRead` *decrease* from one call to the next, within the
same `agent_start` burst, 9 times out of 51 consecutive-call pairs (the
"bounces between two replicas mid-loop" pattern documented above). The new
recording has **zero** such drops across all 32 intra-run pairs — `cacheRead`
now climbs strictly monotonically within every run, all 7 of them.

**Cross-`agent_start`-boundary retention improved substantially, with one
outlier.** Retention = (cacheRead at first call of a run) / (cacheRead at
last call of the previous run):

| boundary | old retention | new retention |
|----------|---------------:|---------------:|
| run1→run2 | 0% | 93.8% |
| run2→run3 | 96.6% | 76.3% |
| run3→run4 | 85.3% | **26.6%** |
| run4→run5 | 61.1% | 91.2% |
| run5→run6 | 68.9% | 96.2% |
| run6→run7 | 76.7% | 99.9% |
| **mean** | **64.8%** | **80.7%** |

5 of 6 boundaries are now ≥76%, three of them >90% (vs. one out of six
before). One boundary (run3→run4) still took a large hit, comparable to the
old pattern's worst cases — so the reset isn't eliminated, just far less
frequent. Whether that one boundary corresponds to an unusually long gap, a
different tool-call shape, or genuine replica-pool variance wasn't isolated
this pass.

**Bottom-line cost/efficiency metric** — total `usage.input` summed across
all assistant calls, divided by the session's final context size (this is
the "how many times over did we pay to reprocess the conversation"
multiplier from the original doc's core observation):

- Old (no retention setting): 128,181 / 46,606 = **2.75×**
- New (`PI_CACHE_RETENTION=long`): 57,400 / 33,547 = **1.71×**

A real, substantial drop, though still well above the theoretical 1.0×
floor a fully-affine session would approach. The one bad boundary
(run3→run4) alone accounts for most of the remaining gap: if that boundary
had retained cache at the same rate as its neighbors (~24,672 instead of the
6,560 it actually got), the total would have been roughly 39,300 tokens —
a ratio of ~1.17×, i.e. most of the remaining overhead in this run is that
single outlier, not a systemic residual.

**Interpretation.** `prompt_cache_key` is still structurally inert for this
model (confirmed above: `options.sessionId` is never populated anywhere in
the compiled `@earendil-works/pi-coding-agent` SDK, so that half of
DeepInfra's documented caching mechanism was never engaged in this test
either). This result is attributable purely to `prompt_cache_retention:
"24h"` — meaning DeepInfra evidently accepts and honors that value (the
"24h vs. documented 5m/1h" risk flagged above did not manifest as a
silent no-op), and the dominant cause of the original pattern was the
**default cache TTL expiring during normal think-time gaps between
prompts**, not an unfixable "no sticky routing across an arbitrarily large
replica pool" ceiling. The residual (one bad boundary, ~80% average
retention rather than ~100%) is consistent with a small, finite pool of
replicas where retention now usually — but not always — outlasts the gap.

**Recommendation**: keep `PI_CACHE_RETENTION=long` set for this model going
forward — it's a clear net win and the downside risk (global to the server
process, affects all openai-completions-compat models) didn't cause any
observed regression in this test. The remaining ~20% average gap and the
one large-outlier boundary are good candidates for avenue 1's other half
(session-affinity / `prompt_cache_key`) *if* the SDK gains a way to thread
`sessionId` into model calls — worth a note upstream — but are no longer
blocking or urgent given the size of the improvement already achieved with
a one-line config change.
