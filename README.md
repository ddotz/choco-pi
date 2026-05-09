# ddotz-pi

Personal autonomous PM/development-team layer for the pi coding agent.

## Purpose

`ddotz-pi` makes Pi default to an autonomous PM base philosophy: act without routine clarification, self-review, fix, verify, and report evidence.

The autonomous PM base is always on. **Only `default` work mode is currently implemented.** Specialized modes (`coding`, `report`, `web-analysis`, `adoption-analysis`) are planned and should be implemented/switched only after an explicit user request.

Selected roach-pi utilities are absorbed under this package through the `ddotz-pi-utilities` dependency alias, so Pi settings only need the local `ddotz-pi` package.

## Runtime target

This work customizes the current Pi environment itself (`~/.pi/agent`). `~/code/ddotz-pi` is the reproducible/distributable package for that personal environment. Apply live environment changes when needed, then mirror durable behavior into this repo.

## Commands

- `/mode [status|list|set <mode>|add <id> <description>|remove <id>]` — manage work modes. Current implemented mode is `default` only.
- `/intensity [micro|standard|deep|status]` — show or set execution intensity. This is process weight, not a work mode.
- `/source [list|add|adopt|reject|due|changed|check]` — track adopted or explicitly tracked external sources.
- `/memory [list|save <text>]` — list/save durable memories.
- `/ledger [reset]` — show/reset compact workspace Context Ledger.

## Mode folder structure

```text
modes/
  _base/MODE.md                # shared autonomous PM philosophy
  default/MODE.md              # only implemented mode
  coding/MODE.md               # planned coding overlay
  report/MODE.md               # planned report-writing overlay
  web-analysis/MODE.md         # planned web research overlay
  adoption-analysis/MODE.md    # planned source adoption overlay
```

Custom modes use the same shape: `modes/<mode-id>/MODE.md`. Runtime-created custom modes are stored under `~/.pi/agent/ddotz-pi/modes/<mode-id>/MODE.md` and registered by `/mode add`.

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
- Use confidence labels `High`, `Medium`, `Low`; in terminal/UI contexts render them as white-text badges on green/yellow/red backgrounds.

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
- Run version sync before lint/typecheck/test.
- If package/dependency/lockfile/plugin version information changes, update all corresponding version-bearing areas in the same commit.
- Keep `package.json` version and `extensions/ddotz-autopilot/version.ts` synchronized.
- Dependency metadata changes must also update `pnpm-lock.yaml`.

```bash
pnpm run check
```
