# flue-agent-template

A starter template for a [Flue](https://github.com/withastro/flue) agent that runs on **Cloudflare Workers** with a per-user **Daytona** Linux sandbox and **Google Gemini** as the model. None of the three is locked in — see [Customizing](#customizing) for how to swap each piece.

```
Browser / curl  ──HTTPS──▶  Cloudflare Worker  ──┬──▶  Daytona sandbox  (real Linux, bash, files)
                                                  └──▶  Google Gemini    (LLM)
```

The Worker is the HTTP entry, holds session state in a Durable Object, and orchestrates calls to the model. The actual `bash` / `read` / `write` operations the agent performs run in a per-workspace Daytona sandbox.

## Why this stack?

A flue agent has three pluggable pieces. The template picks one of each so you can be running in 10 minutes and swap from there:

| Piece | Default here | What it gives you | When to swap |
|---|---|---|---|
| **Runtime** | Cloudflare Workers | Free tier, no cold-start, global edge, Durable Objects for session state, no Docker needed | You need long-running CPU/RAM (>30s, >128MB) — use Node + `flue dev --target node` instead |
| **Sandbox** | Daytona (cloud) | Real Linux per workspace, files persist, auto-stops when idle, runs anywhere flue runs | Local-only dev → `'local'`. Already on Cloudflare? CF Containers also works (paid). Stateless agent? `'empty'` |
| **Model** | `google/gemini-3.1-pro-preview` | Generous free tier, strong tool-use, long context | Any of OpenAI, Anthropic, Groq, OpenRouter, Mistral, xAI, Cerebras, Vertex, Bedrock, … (see below) |

Pick the default if you're just kicking the tires; swap pieces as you learn what your agent actually needs.

## What's in the box

```
.flue/agents/
  assistant.ts       Agent handler (HTTP entry, model orchestration, sandbox lifecycle)
.flue/types.d.ts     `*.md` text-import type declaration for Wrangler's text rule
.agents/skills/      Markdown skill files — Flue's canonical skill location
  explore/SKILL.md
  summarize/SKILL.md
  plan/SKILL.md
AGENTS.md            Top-level instructions baked into the system prompt
wrangler.jsonc       Cloudflare Worker config (Flue auto-injects per-agent DOs)
dev-ui.html          Minimal browser UI for manual testing (streams events live)
dev-ui.mjs           Local proxy + static server for the UI
scripts/sandboxes.mjs   List / delete Daytona sandboxes
```

## Prerequisites

- **Node 22+**
- **pnpm** (or npm/yarn — pnpm preferred)
- A **Cloudflare** account — free tier is enough; this template avoids paid features (no Containers, no SQLite-backed-DO costs)
- A **Daytona** account — [app.daytona.io](https://app.daytona.io), free tier OK
- A **Gemini API key** — [aistudio.google.com](https://aistudio.google.com) — free tier is generous (swap providers if you prefer)

## Setup

```bash
git clone https://github.com/<you>/flue-agent-template
cd flue-agent-template
pnpm install
cp .dev.vars.example .dev.vars
# edit .dev.vars and fill in both keys
```

`.dev.vars`:
```
GEMINI_API_KEY=...
DAYTONA_API_KEY=...
```

> Don't wrap values in quotes — `wrangler secret put` ships the quotes verbatim, which the provider then rejects.

## Run locally

```bash
pnpm dev          # workerd locally + .dev.vars; runs on http://localhost:3583
# in another terminal:
pnpm ui           # browser UI on http://localhost:8080
```

Open `http://localhost:8080` and chat. The Worker runs locally on `workerd`; the sandbox runs remotely on Daytona; Gemini is reached directly from the Worker.

## Deploy

```bash
pnpm exec wrangler login                       # one-time, browser OAuth
pnpm run deploy                                # builds and pushes
pnpm exec wrangler secret put GEMINI_API_KEY   # paste the value (no quotes)
pnpm exec wrangler secret put DAYTONA_API_KEY  # paste the value (no quotes)
```

Your Worker is live at `https://<your-worker>.<your-subdomain>.workers.dev`.

Test:
```bash
curl -N -X POST https://<your-worker>.<sub>.workers.dev/agents/assistant/test-1 \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{"message":"Run uname -a","threadId":"c-1"}'
```

Or point the dev-ui at production:
```bash
FLUE_URL=https://<your-worker>.<sub>.workers.dev pnpm ui
```

## How it works

### URL → workspace → conversation

```
POST /agents/assistant/<workspace-id>
Body: { "message": "...", "threadId": "..." }
```

| Layer | Keyed by | Persists |
|---|---|---|
| **Workspace** (Daytona sandbox) | `workspace-id` (URL path) | Files, processes, system state |
| **Conversation** (DO storage) | `threadId` (request body) | Message history |

- Same `workspace-id` + same `threadId` → continue conversation, files preserved
- Same `workspace-id` + new `threadId` → fresh chat, files preserved
- New `workspace-id` → fresh sandbox + fresh chat

The dev-ui exposes both as buttons: **New conversation** (same workspace) vs **Start fresh** (new workspace).

### Sandbox lifecycle

- **First request** to a workspace → creates Daytona sandbox tagged `flue-agent-id=<workspace-id>`, seeds skills
- **Subsequent requests** → looks up by label, reuses, files persist
- **15 min idle** → Daytona auto-stops (no compute charge while stopped)
- **1 hr after stop** → auto-archives (cheaper disk)
- **Next request after archive** → starts/un-archives on demand
- **Cleanup**: `pnpm sandboxes:list` / `pnpm sandboxes:clean`

### Skills

Skills are reusable instructions for common tasks, authored as Markdown with frontmatter at the canonical Flue path: `.agents/skills/<name>/SKILL.md`.

On Cloudflare + Daytona we can't mount the local filesystem into the sandbox (the way `sandbox: 'local'` does on Node), so the skill content has to ride along with the Worker. The flow:

1. **Authoring** — edit Markdown in `.agents/skills/<name>/SKILL.md`
2. **Bundling** — Wrangler's `Text` rule (in `wrangler.jsonc`) makes `.md` files importable as strings; the agent imports them at the top of `assistant.ts`
3. **Seeding** — `seedSkills()` writes the strings to `/home/daytona/.agents/skills/<name>/SKILL.md` on first sandbox creation
4. **Discovery** — Flue's runtime scans the sandbox cwd and includes the skills in the agent's system prompt

Three skills ship with the template:

| Skill | Purpose |
|---|---|
| `explore` | Map an unknown directory or repository |
| `summarize` | Distill content (file/url/text) into structured summaries |
| `plan` | Break a task into ordered steps with risks and assumptions |

The agent invokes a skill via `session.skill('<name>', { args, result })`. See [Flue's docs](https://github.com/withastro/flue) for the full API.

## Customizing

Three knobs that almost everyone ends up turning. All three live in `.flue/agents/assistant.ts`.

### Swap the model / provider

The `model` field in `init({ ... })` is `'<provider>/<model-id>'`. Pick any provider [`@mariozechner/pi-ai`](https://www.npmjs.com/package/@mariozechner/pi-ai) supports — flue uses it as the model registry, so any provider it knows works without extra wiring.

```ts
// .flue/agents/assistant.ts
const agent = await init({
  sandbox: daytona(sandbox),
  model: 'anthropic/claude-sonnet-4-20250514',  // ← change here
});
```

Then provide the matching env var (locally in `.dev.vars`, in production via `wrangler secret put`):

| Provider | `model:` prefix | Env var |
|---|---|---|
| Google Gemini | `google/...` | `GEMINI_API_KEY` |
| OpenAI | `openai/...` | `OPENAI_API_KEY` |
| Anthropic | `anthropic/...` | `ANTHROPIC_API_KEY` |
| OpenRouter | `openrouter/...` | `OPENROUTER_API_KEY` |
| Groq | `groq/...` | `GROQ_API_KEY` |
| xAI | `xai/...` | `XAI_API_KEY` |
| Cerebras | `cerebras/...` | `CEREBRAS_API_KEY` |
| Mistral | `mistral/...` | `MISTRAL_API_KEY` |
| Vercel AI Gateway | `vercel-ai-gateway/...` | `AI_GATEWAY_API_KEY` |
| Google Vertex | `google-vertex/...` | `GOOGLE_CLOUD_API_KEY` (or ADC) |
| Amazon Bedrock | `amazon-bedrock/...` | AWS credentials (multiple paths) |
| HuggingFace | `huggingface/...` | `HF_TOKEN` |

If you change provider, also update the `process.env.<NAME> = env.<NAME>` line at the top of the agent (it copies the secret from the Worker `env` into Node's `process.env` so the underlying client picks it up).

### Swap the sandbox

`sandbox` accepts:

- **`'empty'`** — in-memory, no host access. Stateless agent (no file I/O).
- **`'local'`** — mounts `process.cwd()` at `/workspace`. Node target only. Great for local dev.
- **`SandboxFactory`** — a connector. `daytona(sandbox)` from `@flue/connectors/daytona` is what's wired up. Other connectors will land here as the ecosystem grows.
- **`BashFactory`** — bring your own [`just-bash`](https://www.npmjs.com/package/just-bash) implementation.

```ts
// drop the daytona dance entirely
const agent = await init({ sandbox: 'local', model: 'google/gemini-3.1-pro-preview' });
```

If you swap to `'local'` or `'empty'`, you can also delete `getOrCreateSandbox`, `seedSkills`, and the Daytona import in `assistant.ts`. With `'local'`, skills work straight off your filesystem at `.agents/skills/` — no seeding step needed.

### Swap the runtime (Cloudflare → Node)

Two changes:

1. `package.json` scripts — replace `--target cloudflare` with `--target node`
2. Drop `wrangler.jsonc`, `.dev.vars`, the DO bits — Node just reads `process.env`

The agent code itself is portable; flue's build target is what changes. See `flue dev --help` for full target options.

### Adjust the agent's behavior

Three places to edit, in order of how often you'll touch them:

- **`AGENTS.md`** — the system prompt. Persona, tone, what tools to prefer. This is read at runtime by flue's discovery, not bundled at build time.
- **`.flue/agents/assistant.ts`** — the orchestration code. Add MCP servers, custom tools, response shape changes, multi-turn logic.
- **`.agents/skills/<name>/SKILL.md`** — reusable task playbooks. See below.

### Add a skill

1. `mkdir -p .agents/skills/<name>` and create `.agents/skills/<name>/SKILL.md` with frontmatter + body
2. Add an `import` line near the top of `.flue/agents/assistant.ts` and add the entry to the `SKILLS` object
3. Restart `pnpm dev` — existing sandboxes keep their old seeded copies; run `pnpm sandboxes:clean` to drop them and trigger re-seeding
4. Reference the skill from agent code: `session.skill('<name>', { args, result })`

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `API key not valid` from Gemini after deploy | `.dev.vars` value was wrapped in `"..."` and the quotes got uploaded as part of the secret | Re-upload without quotes: `echo -n 'sk-...' \| pnpm exec wrangler secret put GEMINI_API_KEY` |
| `Found both a user configuration file at "wrangler.jsonc" and a deploy configuration file at "../.wrangler/deploy/config.json"` | Running `wrangler deploy` from inside `dist/` clashes with the deploy redirector flue's build writes | Run `wrangler deploy` from the project root (the included `pnpm run deploy` already does this) |
| `Total disk limit exceeded` from Daytona | Old sandboxes accumulated | `pnpm sandboxes:clean` to drop them all, or `pnpm sandboxes:clean <agent-id>` for one |
| New skill content not picked up | Existing sandbox already has the old seeded copy (and the seed marker) | `pnpm sandboxes:clean <workspace-id>` then send another request |
| `No API key for provider: <x>` at runtime | Provider env var isn't being copied from the Worker's `env` to `process.env` | Add `if (env.X_API_KEY) process.env.X_API_KEY = env.X_API_KEY;` near the top of `assistant.ts` |
| Worker logs show nothing on error | Error happened before the request reached the agent handler | `pnpm exec wrangler tail <worker-name> --format pretty` and re-issue the request |

## Costs

- **Cloudflare Workers** — free tier covers ~100K requests/day; Workers Paid ($5/mo) bumps that to 10M and unlocks more CPU
- **Daytona** — free tier has limited disk (30 GiB) and concurrent sandboxes. `pnpm sandboxes:clean` is your friend
- **Model provider** — billed per token. Gemini's free tier is generous; rate-limit and cost vary across providers

A single deploy with a few test requests costs cents to nothing.

## License

MIT
