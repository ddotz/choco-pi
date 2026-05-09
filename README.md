# ddotz-pi

Personal autonomous PM/development-team layer for the pi coding agent.

## Purpose

`ddotz-pi` makes Pi default to autonomous execution: plan only as much as needed, act without routine clarification, self-review, fix, verify, and report evidence.

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

- `/ddotz-mode [normal|autopilot|heavy|status]` — show or set mode. Default is `autopilot`.
- `/ddotz-memory [list|save <text>]` — list/save durable memories.
- `/ddotz-ledger [reset]` — show/reset compact workspace Context Ledger.

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
- Irreversible actions
- Contradictory goals without safe defaults

## External search

`insane-search` remains an external dependency. ddotz-pi policy tells the agent to use it for blocked/WAF-protected access and supported platforms instead of vendoring or reimplementing it.

## Development

```bash
pnpm install
pnpm run check
```
