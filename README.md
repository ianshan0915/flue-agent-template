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

#### Adding a skill

1. `mkdir -p .agents/skills/<name>` and create `.agents/skills/<name>/SKILL.md` with frontmatter + body
2. Add an `import` line near the top of `.flue/agents/assistant.ts` and add the entry to the `SKILLS` object
3. Restart `pnpm dev` — existing sandboxes keep their old seeded copies; run `pnpm sandboxes:clean` to drop them and trigger re-seeding
4. Reference the skill from agent code: `session.skill('<name>', { args, result })`

## Costs

- **Cloudflare Workers** — free tier covers ~100K requests/day; Workers Paid ($5/mo) bumps that to 10M and unlocks more CPU
- **Daytona** — free tier has limited disk (30 GiB) and concurrent sandboxes. `pnpm sandboxes:clean` is your friend
- **Gemini** — billed per token by Google

A single deploy with a few test requests costs cents to nothing.

## License

MIT
