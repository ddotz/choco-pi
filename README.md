# ddotz-pi

Personal autonomous PM/development-team layer for the pi coding agent.

## Purpose

`ddotz-pi` makes Pi default to an autonomous PM base philosophy: act without routine clarification, self-review, fix, verify, and report evidence.

The autonomous PM base is always on. **Only `default` work mode is currently implemented.** Specialized modes (`coding`, `report`, `web-analysis`, `adoption-analysis`) are planned and should be implemented/switched only after an explicit user request.

This repo is not a fork of roach-pi or oh-my-pi. It keeps Pi as the runtime and borrows useful ideas while preserving a personal operating policy.

## Commands

- `/ddotz-mode [default|status]` — show or set the domain work mode. Current implemented mode is `default` only.
- `/ddotz-intensity [micro|standard|deep|status]` — show or set execution intensity. This is process weight, not a work mode.
- `/ddotz-source [list|add|adopt|reject|due|changed|check]` — track adopted or explicitly tracked external sources.
- `/ddotz-memory [list|save <text>]` — list/save durable memories.
- `/ddotz-ledger [reset]` — show/reset compact workspace Context Ledger.

## Planned work modes

- `coding`: implement, refactor, debug, test, and verify code changes.
- `report`: gather evidence, structure findings, and write polished documents.
- `web-analysis`: research external sources and take requested follow-up action.
- `adoption-analysis`: analyze external repos/links, decide fit with ddotz philosophy, track adopted sources, and propose improvements.

These are not active yet. If a future task needs one, ddotz-pi should ask whether to implement/switch that mode.

## Execution intensity

- `micro`: direct small action.
- `standard`: brief plan, execute, self-review, fix, verify.
- `deep`: role split across PM, Architect, Worker, Reviewer, Verifier, and Polish.

## External source tracking

Do **not** track links for simple analysis. Track only when:

- the source was actually reflected into ddotz-pi, or
- the user explicitly asks to track it.

Tracked/adopted sources are checked weekly. If upstream changed, the agent analyzes fit and asks whether to adopt the proposed improvement.

## Reporting style

- Keep final reports concise and sectioned.
- Default sections: Result, Verification, Notes.
- Maximum 4 short bullets per section unless detail is requested.
- Keep code creation/modification/deletion details folded by default using `<details><summary>작업 상세</summary>...</details>` only when useful.
- Use confidence labels `High`, `Medium`, `Low`; render color when possible.

## Approval boundaries

Ask first only for deployment, payment, secrets/accounts, large deletion/destructive migration, external private-data transfer, external adoption decisions, irreversible actions, or contradictory goals without safe defaults.

## External search

`insane-search` remains an external dependency. ddotz-pi references it for blocked/WAF-protected access and supported platforms instead of vendoring or reimplementing it.

## Completion boundary

Stop when the requested outcome is satisfied, verification passed, and no critical in-scope issue remains. Optional and new-scope ideas are deferred follow-ups, not silently added to the active task.

## Commit hygiene and quality gates

Before committing:

- Inspect `git status --short --untracked-files=all`.
- Exclude unnecessary development analysis files, Superpowers runtime artifacts, private/personal files, secrets, generated output, caches, logs, and unneeded dotfiles.
- Include intentional config dotfiles only when they are part of the project contract.
- Run lint before typecheck/test.

```bash
pnpm run check
```
