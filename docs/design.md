# ddotz-pi Design

## Goal

Build a personal Pi package that makes the default operating philosophy an autonomous PM/development-team loop.

## Non-goals

- Do not replace Pi with oh-my-pi/omp.
- Do not adopt roach-pi full harness by default.
- Do not vendor insane-search.
- Do not treat `autopilot` or `autopilot-heavy` as domain modes.
- Do not track external links that were only analyzed and not reflected into ddotz-pi.

## Architecture

`ddotz-pi` is a Pi package with one extension, one skill, prompt templates, and mode instruction folders.

- Extension: injects autonomous PM policy through `before_agent_start`, exposes `/mode`, `/intensity`, `/memory`, `/ledger`, and `/source`, and stores compact state under the Pi agent directory.
- Mode folders: isolate shared philosophy from mode-specific overlays so report/coding/web/adoption behavior can diverge without changing the base philosophy.
- Utility absorption: selected roach-pi utilities are loaded through the `ddotz-pi-utilities` dependency alias, not as a top-level Pi package.
- Skill: describes the autonomous execution behavior for task-triggered progressive disclosure.
- Prompt: lets the user explicitly force autonomous behavior if needed.

## Autonomous PM Base

The autonomous PM/development-team base is always on. It is not a user-facing mode. The agent should act autonomously, choose defaults, self-review, fix, verify, and report concise evidence.

## Work Modes

Only `default` work mode is implemented. Planned modes are `coding`, `report`, `web-analysis`, and `adoption-analysis`. The agent must not claim planned modes are active. If the user explicitly asks to use one, ask whether to implement/switch it.

Folder layout:

```text
modes/
  _base/MODE.md
  default/MODE.md
  coding/MODE.md
  report/MODE.md
  web-analysis/MODE.md
  adoption-analysis/MODE.md
```

Each mode inherits `_base` and adds a focused overlay. For example, `default` remains general and may do coding, while `report` can later add evidence structure, source notes, and writing-specific output rules. Custom modes follow `modes/<mode-id>/MODE.md`; `/mode add` registers them and writes runtime files under `~/.pi/agent/ddotz-pi/modes/`.

## Execution Intensity

Execution intensity describes process weight:

- `micro`: direct answer or tiny change.
- `standard`: brief plan, execute, self-review, fix, verify.
- `deep`: represent PM, Architect, Worker, Reviewer, Verifier, and Polish responsibilities.

## External Source Registry

Sources are tracked only when they are actually reflected into ddotz-pi or when the user explicitly asks to track them. Simple analysis does not add a source to the registry. Tracked/adopted sources are checked weekly. Changed sources are summarized into the system prompt so the agent can autonomously analyze whether updates fit the ddotz-pi philosophy, then ask for adoption decisions.

## Response Style

Final reports stay concise and sectioned. Default sections are Result, Verification, and Notes. Code creation/modification/deletion details are summarized first and folded by default via `<details><summary>작업 상세</summary>...</details>` only when useful. Confidence labels are `High`, `Medium`, and `Low`; terminal/UI rendering should use white text on green/yellow/red backgrounds.

## Completion Boundary

Autonomous work stops when the requested outcome is satisfied, verification passed, and no critical in-scope issue remains. The agent continues only for unmet requested outcomes, failed verification, or critical issues introduced by the current work. Optional and new-scope follow-ups are reported explicitly rather than silently expanding the current task.

## Context Ledger

The ledger remains compact and resumable. It stores objective, assumptions, decisions, changed files, verification commands, blockers, risks, and next actions.

## Memory

Memory stores only durable operational facts: preferences, rules, repeated mistakes, verification commands, and decisions. It rejects one-off chatter, temporary logs, and oversized content.

## Search Dependency

The external `insane-search` skill handles blocked/WAF-protected access and platform-specific retrieval. ddotz-pi only references it by policy.

## Commit Hygiene and Quality Gate

Before commit, ddotz-pi requires a final file hygiene review: exclude unnecessary development analysis files, Superpowers runtime artifacts, personal/private files, secrets, generated output, caches, logs, and unneeded dotfiles. After code changes, lint is part of the default quality gate before typecheck/test.
