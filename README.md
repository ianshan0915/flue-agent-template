# flue-agent-template

A starting template for a [Flue](https://github.com/withastro/flue) agent that runs on **Cloudflare Workers** with a **Daytona** Linux sandbox.

```
Browser / curl  ──HTTPS──▶  Cloudflare Worker  ──┬──▶  Daytona sandbox  (real Linux, bash, files)
                                                  └──▶  Google Gemini    (LLM)
```

The Worker is the HTTP entry, holds session state in a Durable Object, and orchestrates calls to Gemini. The actual `bash` / `read` / `write` operations the agent performs run in a per-workspace Daytona sandbox.

## What's in the box

```
.flue/agents/
  assistant.ts       Agent handler (HTTP entry, Gemini orchestration, sandbox lifecycle)
.flue/lib/
  skills.ts          Skill content as TypeScript strings (single source of truth)
AGENTS.md            Top-level instructions baked into the system prompt
wrangler.jsonc       Cloudflare Worker config (Flue auto-injects per-agent DOs)
dev-ui.html          Minimal browser UI for manual testing (streams events live)
dev-ui.mjs           Local proxy + static server for the UI
scripts/sandboxes.mjs   List / delete Daytona sandboxes
```

## Prerequisites

- Node 22+
- pnpm (or npm/yarn — pnpm preferred)
- A **Cloudflare** account (free tier OK with this setup — no Containers, no SQLite-DO costs)
- A **Daytona** account ([app.daytona.io](https://app.daytona.io), free tier OK)
- A **Gemini API key** ([aistudio.google.com](https://aistudio.google.com))

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
pnpm deploy                                    # builds and pushes
pnpm exec wrangler secret put GEMINI_API_KEY   # paste the value
pnpm exec wrangler secret put DAYTONA_API_KEY  # paste the value
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

Skills are reusable instructions for common tasks. They're authored as Markdown with frontmatter and live in `.flue/agents/skills.ts` as TypeScript strings (single source of truth).

The agent's `seedSkills()` writes them into the sandbox at `/home/daytona/.agents/skills/<name>/SKILL.md` on first creation (Flue's runtime discovers them there automatically). Skills live at `.flue/lib/skills.ts` rather than `.flue/agents/` because Flue treats every `.ts` file under `agents/` as an agent.

Three skills ship with the template:

| Skill | Purpose |
|---|---|
| `explore` | Map an unknown directory or repository |
| `summarize` | Distill content (file/url/text) into structured summaries |
| `plan` | Break a task into ordered steps with risks and assumptions |

The agent invokes a skill via `session.skill('<name>', { args, result })`. See [Flue's docs](https://github.com/withastro/flue) for the full API.

#### Adding a skill

1. Open `.flue/lib/skills.ts`
2. Add a new entry: `mySkill: \`---\nname: mySkill\ndescription: ...\n---\n\nInstructions...\``
3. Restart `pnpm dev` (existing sandboxes keep their old seeded copies — delete them with `pnpm sandboxes:clean` to re-seed)
4. Reference it from agent code: `session.skill('mySkill', { ... })`

## Costs

- **Cloudflare Workers** — free tier covers ~100K requests/day; Workers Paid ($5/mo) bumps that to 10M and unlocks more CPU
- **Daytona** — free tier has limited disk (30 GiB) and concurrent sandboxes. `pnpm sandboxes:clean` is your friend
- **Gemini** — billed per token by Google

A single deploy with a few test requests costs cents to nothing.

## License

MIT
