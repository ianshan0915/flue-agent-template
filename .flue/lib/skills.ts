/**
 * Skills shipped with this agent.
 *
 * Each entry is the full Markdown content of a SKILL.md file (frontmatter
 * + body). The agent's `seedSkills()` helper writes them into the sandbox
 * at `<sandbox-cwd>/.agents/skills/<name>/SKILL.md` on first creation, where
 * Flue's runtime then discovers them.
 *
 * To add a new skill: add a key + Markdown string here. To edit a skill:
 * edit the string. The next sandbox will pick it up; existing sandboxes
 * keep their previously seeded copy until you delete & recreate them.
 */
export const SKILLS: Record<string, string> = {
	explore: `---
name: explore
description: Explore an unknown directory or repository and produce a structured map of what's there. Use when first encountering a codebase or before making changes.
---

You are mapping an unknown directory. Be efficient — read enough to answer the questions below, no more.

## Steps

1. **Top-level shape** — \`ls -la\` the path. Note hidden config files (\`.git\`, \`.github/\`, \`.env*\`, lockfiles).
2. **Identify the kind of project** — package.json, pyproject.toml, Cargo.toml, go.mod, Gemfile, pom.xml, etc. Read the first one you find.
3. **Read the README** if present. Note stated purpose, install/run instructions.
4. **Scan source layout** — \`src/\`, \`lib/\`, \`app/\`, \`tests/\`. Identify entry points (main, index, server, cli).
5. **Detect tooling** — linter config, formatter, test runner, build tool, CI config.

## Output

Return a structured summary with:

- **Purpose** — one sentence on what this project does
- **Language & framework** — primary language, key frameworks
- **Entry points** — files most likely to be \`main\` for users/CLI/server
- **Key directories** — short list with one-line descriptions
- **Build / test / run** — the actual commands you would run, derived from the project's config (not generic guesses)
- **Notable** — anything unusual: monorepo, polyglot, deprecated, undocumented dep, etc.

Stay terse. Don't quote large code blocks unless directly asked.
`,

	summarize: `---
name: summarize
description: Read content from a file path, URL, or inline text and produce a structured summary. Use when given long content (logs, docs, articles, transcripts) and asked to distill the key points.
---

You are summarizing content. The user will provide one of: a file path, a URL (use \`curl\`), or inline text.

## Steps

1. **Acquire the content.**
   - File path → read the file
   - URL → \`curl -sL <url>\` (handle redirects). For HTML, strip tags or extract the main article text.
   - Inline → use as-is.
2. **Read for structure first.** Identify the top-level sections, the thesis, and any explicit conclusions.
3. **Extract key claims, decisions, or actions** — not paraphrased prose. Prefer "what changes" or "what to do" over "what was discussed."

## Output

Return:

- **TL;DR** — one or two sentences
- **Key points** — 3–7 bullets, each a complete claim or fact (not a topic)
- **Action items** (if applicable) — concrete, with owners or deadlines if mentioned
- **Open questions** (if applicable) — things the source doesn't resolve

If the source is paywalled, blocked, or unparseable, say so plainly and stop. Don't fabricate.
`,

	plan: `---
name: plan
description: Break a goal into ordered, executable steps with assumptions and risks. Use when the task is multi-step, ambiguous, or risky enough that thinking before doing helps.
---

You are turning a goal into a plan that another agent (or human) could execute.

## Principles

- **Order matters.** Each step should be runnable when its predecessors are done.
- **Be concrete.** "Set up the database" is not a step. "Run \`pnpm db:migrate\` against the staging branch" is.
- **Surface assumptions.** State what you're assuming about the environment, access, or prior state. If an assumption is wrong, the plan likely is too.
- **Identify risks.** What could go wrong? Where do you need to verify before continuing?
- **Stop at "good enough."** Don't expand to 30 steps if 6 is sufficient.

## Output

Return:

- **Goal** — restate the goal in one sentence to confirm understanding
- **Assumptions** — bulleted list, max 5
- **Steps** — numbered, each with: action, expected outcome, verification
- **Risks** — what could fail and how to detect it
- **Out of scope** — what you're explicitly NOT doing (helps prevent scope creep later)

If the goal is too vague to plan against, say what you'd need to know and stop. Don't speculate the user's intent into existence.
`,
};
