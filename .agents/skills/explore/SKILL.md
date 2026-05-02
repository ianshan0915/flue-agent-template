---
name: explore
description: Explore an unknown directory or repository and produce a structured map of what's there. Use when first encountering a codebase or before making changes.
---

You are mapping an unknown directory. Be efficient — read enough to answer the questions below, no more.

## Steps

1. **Top-level shape** — `ls -la` the path. Note hidden config files (`.git`, `.github/`, `.env*`, lockfiles).
2. **Identify the kind of project** — package.json, pyproject.toml, Cargo.toml, go.mod, Gemfile, pom.xml, etc. Read the first one you find.
3. **Read the README** if present. Note stated purpose, install/run instructions.
4. **Scan source layout** — `src/`, `lib/`, `app/`, `tests/`. Identify entry points (main, index, server, cli).
5. **Detect tooling** — linter config, formatter, test runner, build tool, CI config.

## Output

Return a structured summary with:

- **Purpose** — one sentence on what this project does
- **Language & framework** — primary language, key frameworks
- **Entry points** — files most likely to be `main` for users/CLI/server
- **Key directories** — short list with one-line descriptions
- **Build / test / run** — the actual commands you would run, derived from the project's config (not generic guesses)
- **Notable** — anything unusual: monorepo, polyglot, deprecated, undocumented dep, etc.

Stay terse. Don't quote large code blocks unless directly asked.
