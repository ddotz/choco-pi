---
name: kami
description: Use when producing report artifacts, executive-report layouts, markdown-to-PDF/DOCX handoff, or design specs that need Kami-derived visual constraints.
---

# Kami Report Layout

## Core Rule

Use Kami as a layout constraint source, not as a vendored template. Apply it only after evidence, logic, numbers, and section order are stable.

## When to Apply

- Use for file-based report artifacts, report design specs, HTML/PDF/DOCX handoff, and final visual QA.
- For chat-only status answers, do not force visual styling; keep headings, evidence notes, and critical review concise.
- If the original Kami package/template is unavailable, say the fallback is local Kami-derived constraints when layout fidelity matters.

## Layout Tokens

| Area | Constraint |
|---|---|
| Surface | warm parchment background; avoid pure white unless target format requires it |
| Accent | one ink-blue accent for rules, section numbers, and callouts |
| Type | restrained serif-led hierarchy with Korean-safe system/project fonts |
| Summary | compact executive summary before the body |
| Structure | clear section breaks, evidence notes, and appendix/reference separation |

Korean-safe font examples: `Noto Serif CJK KR`, `Nanum Myeongjo`, `AppleMyungjo`, `Apple SD Gothic Neo`, and project-approved equivalents. Do not use Kami's Chinese Tsanger font as the Korean default.

## Artifact Workflow

1. Write a stable MD source first.
2. Keep evidence in an appendix or `<report>.evidence.md` evidence sidecar for file-based reports.
3. Convert to requested output only when the user asked for an artifact.
4. Run artifact QA: file exists, non-empty size, opens/converts successfully when tooling is available, title/summary/section breaks/references are visible, and no source facts changed.
5. In Telegram contexts, attach the generated file instead of only naming the local path.

## Avoid

- Do not vendor upstream Kami templates wholesale.
- Do not let styling outrank evidence quality, numeric consistency, or citation integrity.
- Do not claim exact Kami template compliance unless the actual template was loaded and checked.
