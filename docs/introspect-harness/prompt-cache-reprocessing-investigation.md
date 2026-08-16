# Prompt-Cache Reprocessing in Recorded Introspect Sessions

**Status: open investigation, not resolved.** This is not a design doc for a
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
