# ddotz-pi Design

## Goal

Build a personal Pi package that makes the default operating philosophy an autonomous PM/development-team loop.

## Non-goals

- Do not replace Pi with oh-my-pi/omp.
- Do not adopt roach-pi full harness by default.
- Do not vendor insane-search.
- Do not treat `autopilot` or `autopilot-heavy` as domain modes.

## Architecture

`ddotz-pi` is a Pi package with one extension, one skill, and one prompt template.

- Extension: injects autonomous PM policy through `before_agent_start`, exposes work-mode/intensity/memory/ledger/source commands, and stores compact state under the Pi agent directory.
- Skill: describes the autonomous execution behavior for task-triggered progressive disclosure.
- Prompt: lets the user explicitly force autonomous behavior if needed.

## Autonomous PM Base

The autonomous PM/development-team base is always on. It is not a user-facing mode. The agent should act autonomously, choose defaults, self-review, fix, verify, and report evidence.

## Work Modes

Work modes describe the concrete action domain:

- `default`: infer the action domain from the user request.
- `coding`: code implementation, debugging, refactoring, tests, and verification.
- `report`: report/document creation with evidence and polished structure.
- `web-analysis`: external research followed by the requested action.
- `adoption-analysis`: external repo/link analysis for ddotz-pi adoption and improvement ideas.

## Execution Intensity

Execution intensity describes process weight:

- `micro`: direct answer or tiny change.
- `standard`: brief plan, execute, self-review, fix, verify.
- `deep`: represent PM, Architect, Worker, Reviewer, Verifier, and Polish responsibilities.

## External Source Registry

Analyzed external repos/links are tracked as sources. Sources can be `candidate`, `watching`, `adopted`, or `rejected`. Adopted/watched sources are checked weekly. Changed sources are summarized into the system prompt so the agent can autonomously analyze whether updates fit the ddotz-pi philosophy, then ask for adoption decisions.

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
