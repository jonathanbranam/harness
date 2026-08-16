# pi Model Setup

How to configure the `pi` coding agent's model/auth layer so a harness
server in this repo (`deck-harness-server`, `introspect-harness-server`)
actually has a working model to talk to — including the specific
configuration a harness needs for tools that return **image** content
(e.g. deck-harness's `slide_view` tool, or the built-in `read` tool reading
an image file) to actually reach the model instead of being silently
downgraded to a text placeholder.

This is **user/machine-level config**, not project config — it lives under
`~/.pi/agent/` on whatever box runs the harness server, not in this repo,
and is shared across every harness that box runs (they all resolve the same
`ModelRuntime` config, per-process).

## Where config lives

- `~/.pi/agent/auth.json` — credentials (API keys / OAuth tokens), resolved
  the normal `pi` way. See CLAUDE.md's "Model auth" section and the
  installed `@earendil-works/pi-coding-agent` package's `docs/sdk.md`
  ("API Keys and OAuth" section).
- `~/.pi/agent/models.json` — custom provider/model definitions, merged
  over pi's built-in provider catalogs. This is where you add a provider
  pi doesn't already know about (e.g. a direct DeepInfra, Together, or
  self-hosted OpenAI-compatible endpoint).
- Both paths move if `PI_CODING_AGENT_DIR` is set in the environment the
  harness server runs under (`getAgentDir()` in pi's `config.js`) — check
  that variable first if a config edit doesn't seem to apply and you're not
  sure which `~/.pi/agent/` the process is actually reading.

Full schema reference for `models.json` entries: the installed
`@earendil-works/pi-coding-agent` package's `docs/custom-provider.md`
("Config Reference" / "Model Definition Reference" sections).

## Adding a custom provider — example

```json
{
  "providers": {
    "deepinfra": {
      "baseUrl": "https://api.deepinfra.com/v1/openai",
      "api": "openai-completions",
      "apiKey": "$DEEPINFRA_TOKEN",
      "models": [
        {
          "id": "moonshotai/Kimi-K2.7-Code",
          "name": "Kimi K2.7 Code (DeepInfra)",
          "reasoning": true,
          "input": ["text", "image"],
          "contextWindow": 262144,
          "maxTokens": 16384,
          "cost": { "input": 0.74, "output": 3.50, "cacheRead": 0.15, "cacheWrite": 0 }
        }
      ]
    }
  }
}
```

`apiKey` uses pi's normal config-value syntax: `$ENV_VAR` / `${ENV_VAR}`
interpolates an environment variable, `!command` runs a command for the
whole value.

## Vision support: `input` must include `"image"` explicitly

Any tool result with `{ type: "image", ... }` content — deck-harness's
`slide_view`, or the built-in `read` tool on an image file — only reaches
the model if the *resolved* model declares image input support. pi checks
this before building the provider request; if the model doesn't declare
`"image"` support, the image content is replaced with the literal text
`(tool image omitted: model does not support images)` before the request
is sent. This is never an error and never a silent drop with nothing — it's
always that specific placeholder, so it's a reliable signal of exactly this
misconfiguration.

For a `models.json` custom-provider model entry, **`input` defaults to
`["text"]` when omitted** — pi does not probe the provider to detect vision
support, it only trusts what you declare. So:

- If you leave `input` off, the model is always treated as text-only, even
  if the underlying model is genuinely multimodal.
- Declaring `"input": ["text", "image"]` only tells pi to *pass images
  through* — it doesn't grant vision capability. Confirm the actual
  model/provider supports multimodal input first (check the provider's own
  model docs), or you trade one clear failure mode (the placeholder text)
  for a worse one (a live API error, or the provider silently ignoring the
  image).

## Restart gotcha: `models.json` edits need a full process restart

Each harness server creates exactly **one** `ModelRuntime` for its whole
process lifetime (a module-level singleton in `session-store.ts`), and it
reads `models.json` exactly once, at that moment. Two things commonly make
an edit appear not to take effect:

1. **`tsx watch` doesn't see it.** Dev mode (`npm run dev`) only watches
   files inside the harness server's own `src/**`. `~/.pi/agent/models.json`
   lives entirely outside the repo, so editing it never triggers tsx's
   auto-restart — the already-running process just keeps using the config
   it started with.
2. **Reloading the browser isn't enough.** A page reload reconnects the
   WebSocket to the *same* long-running backend process; it doesn't touch
   the backend's `ModelRuntime` at all.

To pick up a `models.json` change you must fully stop and relaunch the
harness server process (`Ctrl+C` then `npm run dev` / `npm run start` — not
just a browser refresh). If you're not sure whether a stale process is
still running, compare its start time against the config file's mtime:

```bash
# find the harness server process
ps aux | grep 'tsx watch src/index.ts' | grep -v grep

# compare against the config edit time
stat -f "%Sm" ~/.pi/agent/models.json   # macOS
```

If the process predates the edit, kill it and start a fresh one.

## Checklist for a working vision-capable model

1. The model is genuinely multimodal at the provider level (check the
   provider's own docs — don't take a model name like "...-Code" as proof
   either way).
2. Its `models.json` entry declares `"input": ["text", "image"]`.
3. The harness server process was fully restarted *after* that edit.
4. Retest (e.g. `slide_view` in deck-harness) and confirm the response no
   longer contains `(tool image omitted: model does not support images)`.

## References

- Installed `@earendil-works/pi-coding-agent` package's
  `docs/custom-provider.md` — full provider/model config schema.
- Installed package's `docs/sdk.md` — "API Keys and OAuth" section.
- This repo's `CLAUDE.md` — "Model auth" section.
