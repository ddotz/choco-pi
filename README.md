# ddotz-pi

Personal autonomous PM/development-team layer for the pi coding agent.

## Purpose

`ddotz-pi` makes Pi default to an autonomous PM base philosophy: plan only as much as needed, act without routine clarification, self-review, fix, verify, and report evidence.

The autonomous PM base is always on. What changes by use case is the **work mode**: coding, report writing, web analysis, or external adoption analysis.

This repo is not a fork of roach-pi or oh-my-pi. It keeps Pi as the runtime and borrows useful ideas while preserving a personal operating policy.

## Install locally

```bash
pi install /Users/hyuns/code/ddotz-pi
```

Or add to `~/.pi/agent/settings.json` packages:

```json
{
  "packages": ["/Users/hyuns/code/ddotz-pi"]
}
```

## Commands

- `/ddotz-mode [default|coding|report|web-analysis|adoption-analysis|status]` — show or set the domain work mode. Default is `default`.
- `/ddotz-intensity [micro|standard|deep|status]` — show or set execution intensity. This is process weight, not a work mode.
- `/ddotz-source [list|add|adopt|reject|due|changed|check]` — track external repos/links for adoption analysis and weekly update checks.
- `/ddotz-memory [list|save <text>]` — list/save durable memories.
- `/ddotz-ledger [reset]` — show/reset compact workspace Context Ledger.

## Work modes

- `default`: infer the concrete action domain from the user request.
- `coding`: implement, refactor, debug, test, and verify code changes.
- `report`: gather evidence, structure findings, and write polished documents.
- `web-analysis`: research external sources and take requested follow-up action.
- `adoption-analysis`: analyze external repos/links, decide fit with ddotz philosophy, track adopted sources, and propose improvements.

## Execution intensity

- `micro`: direct small action.
- `standard`: brief plan, execute, self-review, fix, verify.
- `deep`: role split across PM, Architect, Worker, Reviewer, Verifier, and Polish.

## Policy

Default allowed:

- Code changes
- File edits
- Tests
- Local package/tool installs
- Refactoring
- Self-review/fix/verify loops

Ask first:

- Deployment or publishing
- Payment or paid API use
- Secrets, credentials, or account changes
- Large deletion/destructive migration
- External transfer of private data
- External adoption decisions after autonomous analysis
- Irreversible actions
- Contradictory goals without safe defaults

## External source tracking

When the user provides an external link or repo, ddotz-pi tracks it as a source. Adopted/watched sources are checked weekly. If upstream changed, the agent should autonomously analyze whether the update fits the ddotz-pi development philosophy, then ask whether to adopt the proposed improvement.

## External search

`insane-search` remains an external dependency. ddotz-pi policy tells the agent to use it for blocked/WAF-protected access and supported platforms instead of vendoring or reimplementing it.

## Completion boundary

Autonomy must stop cleanly. Stop when the requested outcome is satisfied, verification passed, and no critical in-scope issue remains. Continue only for unmet requested outcomes, failed verification, or critical issues introduced by the current work. Optional and new-scope ideas are reported as deferred follow-ups, not silently added to the active task.

## Commit hygiene and quality gates

Before committing:

- Inspect `git status --short --untracked-files=all`.
- Exclude unnecessary development analysis files, Superpowers runtime artifacts, private/personal files, secrets, generated output, caches, logs, and unneeded dotfiles.
- Include intentional config dotfiles only when they are part of the project contract.
- Run lint before typecheck/test.

Default check:

```bash
pnpm run check
```

Expanded quality gate:

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
```

## Development

```bash
pnpm install
pnpm run check
```
