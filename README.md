# flue-agent-template

A starter template for a [Flue](https://github.com/withastro/flue) agent that runs on **Cloudflare Workers** with a per-user **Daytona** Linux sandbox and **Google Gemini** as the model. None of the three is locked in — see [Customizing](#customizing) for how to swap each piece.

```
Browser / curl  ──HTTPS──▶  Cloudflare Worker  ──┬──▶  Daytona sandbox  (real Linux, bash, files)
                                                  └──▶  Google Gemini    (LLM)
```

The Worker is the HTTP entry, holds session state in a Durable Object, and orchestrates calls to the model. The actual `bash` / `read` / `write` operations the agent performs run in a per-workspace Daytona sandbox.

## ⚡ Built on [Flue](https://github.com/withastro/flue)

This template is the fastest way to go from zero to a production-ready **Flue agent** — running on the edge, talking to an LLM, and executing real bash commands in a sandboxed environment.

[Flue](https://github.com/withastro/flue) is the open-source framework that lets you define agents as composable skills, run them anywhere (Cloudflare Workers, Node, or beyond), and swap out models, sandboxes, and runtimes without rewriting your agent logic. This repo wires up the full stack for you: just clone, add your keys, and deploy.

**What makes this Flue integration shine:**

- **Portable agent code** — the same `assistant.ts` runs locally or on Cloudflare
- **Skill-driven architecture** — teach your agent new behaviors by writing Markdown, not code
- **Hot-swappable backends** — switch from Gemini to Claude, Daytona to local, or Cloudflare to Node in one line
- **Type-safe throughout** — full TypeScript support with Flue's SDK types

Want to learn more about Flue? Check out the [main repo](https://github.com/withastro/flue) and the [Flue docs](https://github.com/withastro/flue).

## Why this stack?

A flue agent has three pluggable pieces. The template picks one of each so you can be running in 10 minutes and swap from there:

| Piece | Default here | What it gives you | When to swap |
|---|---|---|---|
| **Runtime** | Cloudflare Workers | Free tier, no cold-start, global edge, Durable Objects for session state, no Docker needed | You need long-running CPU/RAM (>30s, >128MB) — use Node + `flue dev --target node` instead |
| **Sandbox** | Daytona (cloud) | Real Linux per workspace, files persist, auto-stops when idle, runs anywhere flue runs | Local-only dev → `'local'`. Already on Cloudflare? CF Containers also works (paid). Stateless agent? `'empty'` |
| **Model** | `google/gemini-3.1-pro-preview` | Generous free tier, strong tool-use, long context | Any of OpenAI, Anthropic, Groq, OpenRouter, Mistral, xAI, Cerebras, Vertex, Bedrock, … (see below) |

Pick the default if you're just kicking the tires; swap pieces as you learn what your agent actually needs.

## What's in the box

**Required for the agent to run:**

```
.flue/agents/
  assistant.ts       Agent handler — HTTP entry, model orchestration, sandbox lifecycle
.flue/types.d.ts     TypeScript ambient declaration so `import x from './foo.md'` type-checks
.agents/skills/      Markdown skill files at Flue's canonical skill location
  explore/SKILL.md
  summarize/SKILL.md
  plan/SKILL.md
AGENTS.md            Top-level instructions baked into the system prompt
wrangler.jsonc       Cloudflare Worker config (Flue auto-injects per-agent DOs)
```

**Optional dev-time tooling — delete freely if you don't want it:**

```
dev-ui/
  index.html         Minimal in-browser chat UI for manual testing (streams events live)
  server.mjs         Tiny Node static-server + `/api/*` proxy to the local Worker
scripts/
  sandboxes.mjs      `pnpm sandboxes:list` / `pnpm sandboxes:clean` — Daytona quota housekeeping
```

The agent doesn't depend on either folder. They exist so you can iterate without leaving the terminal:

- **`dev-ui/`** — a single HTML page + Node proxy. The page sends `/api/...` requests; the proxy forwards them to your local Worker on `:3583` (or whatever `FLUE_URL` points at). The proxy hop is just to dodge CORS — `workerd` doesn't add the headers a cross-origin browser fetch would need. In production you'd hit the Worker URL directly from your real frontend, so this whole folder becomes unnecessary. To remove: `rm -rf dev-ui/` and drop the `ui` script from `package.json`.
- **`scripts/sandboxes.mjs`** — admin script for Daytona. Lists or deletes sandboxes by `flue-agent-id` label. Daytona's free tier caps disk at 30 GiB, and during dev you'll create lots of throwaway sandboxes; this is the convenient way to drop them. Reads `DAYTONA_API_KEY` from your shell env (source `.dev.vars` or export it). To remove: `rm -rf scripts/` and drop the `sandboxes:*` scripts from `package.json`.
- **`.flue/types.d.ts`** — one-line ambient module declaration that tells TypeScript `*.md` imports return `string`. Wrangler's `Text` rule (in `wrangler.jsonc`) handles the actual bundling; this file just keeps `tsc` and your editor from complaining. Required if you use TypeScript; safe to delete if you migrate `assistant.ts` to plain JS.

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

Flue auto-discovers skills from the *sandbox's* filesystem at `<cwd>/.agents/skills/<name>/SKILL.md` ([source](https://github.com/withastro/flue/blob/main/packages/sdk/src/context.ts) — `discoverLocalSkills`). On Node with `sandbox: 'local'`, the local fs is mounted into the sandbox, so authoring `.md` files in the repo Just Works. On Cloudflare + Daytona, the Worker, the repo, and the sandbox are three different machines with no shared filesystem — so the skills have to land on the sandbox fs *somehow* before discovery runs. This template uses the simplest such path:

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

#### Graduating to a baked Daytona image

The bundling-and-seeding flow above is right for a starter template — one repo, one deploy command, skills version with the agent. But it's not the only way. If your skills outgrow it, swap to a custom Daytona [image / snapshot](https://www.daytona.io/docs):

```ts
// build the snapshot once, outside the Worker (laptop or CI):
const image = Image.debianSlim('3.12').addLocalDir('.agents/skills', '/home/daytona/.agents/skills');
await client.snapshot.create({ name: 'flue-skills:v1', image });

// agent code becomes:
const sandbox = await client.create({ snapshot: 'flue-skills:v1', labels: { ... } });
const agent  = await init({ sandbox: daytona(sandbox), model: '...' });
// no `import x from './foo.md'`, no SKILLS const, no seedSkills, no types.d.ts, no Wrangler Text rule
```

The agent shrinks. The complexity moves to a snapshot-build pipeline outside the Worker (the SDK's `addLocalDir` / `fromDockerfile` need a real local fs, which the Worker doesn't have).

When it's worth the trade:

- Skills include heavy tools, language runtimes, or system packages — those don't belong as Worker-bundled strings
- A single skill set is shared across many agents — one snapshot, many Workers
- Skill changes are rare relative to agent code changes

When it's not:

- Skills change with the agent code in the same PR — keeping them in the Worker bundle means one deploy per change instead of two artifacts in lockstep
- You want `git clone && pnpm run deploy` to be the whole onboarding story
- You may switch sandbox providers later — the Worker-bundle pattern ports to any provider with an upload API; the snapshot pattern is Daytona-specific

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
