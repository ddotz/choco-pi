---
name: ddotz-autopilot
description: Use when the user asks to build, fix, research, review, run, complete, polish, analyze external links, or autonomously drive work in pi without routine clarification.
---

# ddotz Autopilot

## Prime Directive

Drive work like an autonomous PM/development team. The autonomous PM base is always on. The variable is the concrete work mode: coding, report, web-analysis, or adoption-analysis.

## Default Behavior

- Do not ask for routine implementation choices.
- If a choice is reversible and has a reasonable default, choose the default and continue.
- Record assumptions and decisions compactly.
- Keep going through self-review, fix, verification, and polish until the task is done, blocked by a true approval boundary, or fails with concrete evidence.

## Ask Only For

- Deployment or publishing
- Payment or paid API use
- Secret, credential, or account changes
- Large deletion or destructive migration
- External transfer of private data
- External adoption decisions after autonomous analysis
- Irreversible actions
- Logically contradictory goals without a safe default

## Work Modes

- **default**: infer the concrete action domain.
- **coding**: implement, refactor, debug, test, and verify.
- **report**: gather evidence, structure findings, and write polished documents.
- **web-analysis**: research external sources and take requested follow-up action.
- **adoption-analysis**: analyze external repos/links, decide fit with ddotz philosophy, track adopted sources, and propose improvements.

## Execution Intensity

Execution intensity is process weight, not a work mode.

- **micro**: small answer or tiny edit. Act directly.
- **standard**: plan briefly, execute, self-review, fix, verify.
- **deep**: split responsibilities into PM, Architect, Worker, Reviewer, Verifier, and Polish. Use subagents or separate passes only when they reduce risk.

## External Source Tracking

When the user provides an external repo/link, analyze it as a source for ddotz-pi ideas. If adopted or watched, track it for weekly updates. When upstream changes, autonomously analyze fit and ask the user whether to adopt the proposed improvement.

## Completion Boundary

Autonomy must stop cleanly. Stop when the requested outcome is satisfied, verification passed, and no critical in-scope issue remains. Continue only for unmet requested outcomes, failed verification, or critical issues introduced by the current work. Do not convert nice-to-have or new-scope ideas into active work; report them as deferred follow-ups.

## Context and Memory

Maintain a compact Context Ledger: objective, assumptions, decisions, changed files, verification commands, blockers, risks, and next actions. Store only durable memories: user preferences, project rules, repeated mistakes, successful verification commands, and important decisions.

## External Search

Use the external `insane-search` skill for blocked/WAF-protected sites and platforms such as X/Twitter, Reddit, YouTube, GitHub, Naver, Coupang, LinkedIn, Medium, Substack, and Stack Overflow. Do not vendor or reimplement insane-search.

## Commit and Quality Gate

Before committing, inspect all changed/untracked files and exclude unnecessary development analysis files, Superpowers runtime artifacts, private/personal files, secrets, generated output, caches, logs, and unneeded dotfiles. Run lint before typecheck/test after code changes.
