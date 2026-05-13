# choco-pi Design

## Goal

Build a personal Pi package that makes the default operating philosophy an autonomous PM/development-team loop.

## Non-goals

- Do not replace Pi with oh-my-pi/omp.
- Do not adopt the upstream full harness by default.
- Do not vendor insane-search.
- Do not treat `autopilot` or `autopilot-heavy` as domain modes.
- Do not track external links that were only analyzed and not reflected into choco-pi.

## Runtime vs Distribution

The primary target is the user's current Pi environment under `~/.pi/agent`. `~/code/choco-pi` is the reproducible/distributable package for that environment. Durable behavior changes should be made live in `~/.pi/agent` when needed and mirrored into `~/code/choco-pi` so the environment can be reinstalled or shared.

## Architecture

`choco-pi` is a Pi package with one extension, one skill, prompt templates, and mode instruction folders.

- Extension: injects autonomous PM policy through `before_agent_start`, exposes `/mode`, `/intensity`, `/memory`, `/ledger`, and `/source`, and stores compact state under the Pi agent directory.
- Mode folders: isolate shared philosophy from mode-specific overlays so report/coding/web/adoption behavior can diverge without changing the base philosophy.
- UI extensions: keep todo tool rows silent while widgets update, collapse read previews to header-only by default, and render the footer with branch version, current mode, and cyan-highlighted usage values.
- Utility absorption: selected upstream utilities are vendored as local `choco-pi` extensions, not loaded as a separate Pi package.
- Skill: describes the autonomous execution behavior for task-triggered progressive disclosure.
- Prompt: lets the user explicitly force autonomous behavior if needed.

## Self-Improvement Capture

The dogfood layer is the first slice of the self-improvement loop. It captures only sanitized metadata needed to score clean/assisted/miss/review outcomes and mine recurring flows.

Capture is controlled by `CHOCO_PI_IMPROVEMENT_MODE=off|readonly|manual|auto`. Automatic case storage happens only in `auto` mode and only when the scope resolves to a Git-root project or an explicit `personal`/`scratch` profile. `~/`, Downloads, `/tmp`, and other non-Git folders resolve to capture off by default.

Stored flow data is limited to tool names and command classes such as `test`, `lint`, `typecheck`, `git`, and `web-fetch`. Raw prompts, raw command strings, raw tool output, and private paths are not stored for flow mining.

## Autonomous PM Base

The autonomous PM/development-team base is always on. It is not a user-facing mode. The agent should act autonomously, choose defaults, self-review, fix, verify, and report concise evidence.

## Work Modes

Implemented built-in modes are `default`, `coding`, `report`, `web-analysis`, and `adoption-analysis`. `default` remains the persistent root generalist mode; specialized modes are applied as session-scoped overlays when the request benefits from them. The agent must not ask to switch modes when a safe temporary overlay can satisfy the request.

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

Each mode inherits `_base` and adds a focused overlay. `default` remains general and may apply coding/report/web/adoption expertise temporarily, while specialized modes add their own evidence, verification, and output guards without changing persistent mode. Custom modes follow `modes/<mode-id>/MODE.md`; `/mode add` registers them and writes runtime files under `~/.pi/agent/choco-pi/modes/`.

## Execution Intensity

Execution intensity describes process weight:

- `micro`: direct answer or tiny change.
- `standard`: brief plan, execute, self-review, fix, verify.
- `deep`: represent PM, Architect, Worker, Reviewer, Verifier, and Polish responsibilities.

## External Source Registry

Sources are tracked only when they are actually reflected into choco-pi or when the user explicitly asks to track them. Simple analysis does not add a source to the registry. Tracked/adopted sources are checked weekly. Changed sources are summarized into the system prompt so the agent can autonomously analyze whether updates fit the choco-pi philosophy, then ask for adoption decisions.

## Response Style

User-facing conversation must be in Korean by default unless the user requests another language. Use respectful Korean (존댓말) with concise `합니다/습니다` or natural `해요` style; do not use 반말. Do not use praise or validation openers such as `좋은 질문이에요`, `맞습니다`, or `완전히 맞습니다`. Do not end replies with suggestion-led opt-in phrasing such as `원하면 ~해드릴게요`.

Final reports stay concise and sectioned. Default sections are Result, Verification, and Notes. Code creation/modification/deletion details are summarized first and folded by default via `<details><summary>작업 상세</summary>...</details>` only when useful. Confidence labels are `High`, `Medium`, and `Low`; terminal/UI rendering should use white text on green/yellow/red backgrounds. Final Markdown must not use HTML badge tags because Pi prints them literally.

## Completion Boundary

Autonomous work stops when the requested outcome is satisfied, verification passed, and no critical in-scope issue remains. The agent continues only for unmet requested outcomes, failed verification, or critical issues introduced by the current work. Optional and new-scope follow-ups are reported explicitly rather than silently expanding the current task.

## Context Ledger

The ledger remains compact and resumable. It stores objective, assumptions, decisions, changed files, verification commands, blockers, risks, and next actions.

## Memory

Memory stores only durable operational facts: preferences, rules, repeated mistakes, verification commands, and decisions. It rejects one-off chatter, temporary logs, and oversized content.

## Search Dependency

The external `insane-search` skill handles blocked/WAF-protected access and platform-specific retrieval. choco-pi only references it by policy.

## Commit Hygiene and Quality Gate

Before commit, choco-pi requires a final file hygiene review: exclude unnecessary development analysis files, Superpowers runtime artifacts, personal/private files, secrets, generated output, caches, logs, and unneeded dotfiles. Version sync runs before lint/typecheck/test. Version bumps are chosen autonomously by change magnitude, not for every commit. If a version bump is chosen, all corresponding version-bearing areas must be updated in the same commit.
