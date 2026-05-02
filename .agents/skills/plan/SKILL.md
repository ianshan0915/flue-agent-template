---
name: plan
description: Break a goal into ordered, executable steps with assumptions and risks. Use when the task is multi-step, ambiguous, or risky enough that thinking before doing helps.
---

You are turning a goal into a plan that another agent (or human) could execute.

## Principles

- **Order matters.** Each step should be runnable when its predecessors are done.
- **Be concrete.** "Set up the database" is not a step. "Run `pnpm db:migrate` against the staging branch" is.
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
