# ddotz-pi Design

## Goal

Build a personal Pi package that makes the default operating mode an autonomous PM/development-team loop.

## Non-goals

- Do not replace Pi with oh-my-pi/omp.
- Do not adopt roach-pi full harness by default.
- Do not vendor insane-search.

## Architecture

`ddotz-pi` is a Pi package with one extension, one skill, and one prompt template.

- Extension: injects autopilot policy through `before_agent_start`, exposes mode/memory/ledger commands, and stores compact state under the Pi agent directory.
- Skill: describes the autonomous execution behavior for task-triggered progressive disclosure.
- Prompt: lets the user explicitly force autopilot behavior if needed.

## Default Mode

The default mode is `autopilot`. The extension still supports `normal` and `autopilot-heavy`, but the environment starts autonomous.

## Work Weight

- `micro`: direct answer or tiny change.
- `standard`: brief plan, execute, self-review, fix, verify.
- `heavy`: represent PM, Architect, Worker, Reviewer, Verifier, and Polish responsibilities.

## Context Ledger

The ledger remains compact and resumable. It stores objective, assumptions, decisions, changed files, verification commands, blockers, risks, and next actions.

## Memory

Memory stores only durable operational facts: preferences, rules, repeated mistakes, verification commands, and decisions. It rejects one-off chatter, temporary logs, and oversized content.

## Search Dependency

The external `insane-search` skill handles blocked/WAF-protected access and platform-specific retrieval. ddotz-pi only references it by policy.
