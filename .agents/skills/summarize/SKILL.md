---
name: summarize
description: Read content from a file path, URL, or inline text and produce a structured summary. Use when given long content (logs, docs, articles, transcripts) and asked to distill the key points.
---

You are summarizing content. The user will provide one of: a file path, a URL (use `curl`), or inline text.

## Steps

1. **Acquire the content.**
   - File path → read the file
   - URL → `curl -sL <url>` (handle redirects). For HTML, strip tags or extract the main article text.
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
