# choco-pi Hardening PRD

## Document map

This PRD turns the Hugh Kim harness review into an implementation-ready choco-pi roadmap. It focuses on hardening existing choco-pi loops rather than importing another harness wholesale.

| File | Purpose |
| --- | --- |
| [`01_PRD.md`](01_PRD.md) | Product requirements, goals, non-goals, functional and non-functional requirements, success metrics, risks. |
| [`02_SYSTEM_MODEL.md`](02_SYSTEM_MODEL.md) | Domain model, state machines, trust boundaries, data retention, interfaces, failure modes. |
| [`03_DELIVERY_PLAN.md`](03_DELIVERY_PLAN.md) | Phases, MVP cutline, validation strategy, sequencing, rollback criteria. |
| [`04_AGENT_SPEC.md`](04_AGENT_SPEC.md) | AI implementation guardrails, required verification, approval boundaries, `spec_gate` handoff. |

## Thesis

choco-pi should not clone Hugh Kim's full Claude/Codex harness. It should adopt the strongest pattern: convert repeated soft failures into Pi-native, evidence-backed runtime gates. The first product slice is P0 hardening for requirement drift and silent feature deletion.

## Assumption ledger

| Assumption | Source | Confidence | Impact |
| --- | --- | --- | --- |
| choco-pi already has `spec_gate`, `structural_gate`, source tracking, memory, dogfood, and parallel/worktree orchestration. | Local README and extension source. | High | New work should extend existing loops, not replace them. |
| The largest current gap is not "more agents" but preventing requirement shrinkage and feature deletion from being reported as completion. | Hugh `service-completion-problem` plus local source search. | Medium | P0 prioritizes Requirement Lock and Feature Deletion Detector. |
| Hugh GitHub repos reviewed for this PRD are generally MIT-licensed, but many are Claude Code-specific. | GitHub API metadata. | High for license metadata, Medium for portability. | Ideas are portable; direct code adoption needs review. |
| Pi-native packages exist for adjacent memory/team/review capabilities. | `pi.dev/packages` and npm registry metadata. | High for existence, Medium for fit. | Build-vs-buy review is mandatory before new memory/team/review implementation. |
| The user wants a detailed PRD, not immediate implementation. | Latest Telegram prompt. | High | This document set stops at implementation-ready requirements. |

## Decision record index

| ID | Decision | Status | Reversal trigger |
| --- | --- | --- | --- |
| ADR-001 | Build P0 as choco-pi-native gate hardening, not a cloned Hugh harness. | Accepted | A Pi package provides equivalent P0 gates with lower maintenance cost. |
| ADR-002 | Gate completion first; do not hard-block every edit/write in P0. | Accepted | Runtime API exposes reliable pre-write diff blocking with low false-positive rate. |
| ADR-003 | Treat external sources as scored adoption candidates, not auto-applied patches. | Accepted | Source review, sandboxing, and rollback are fully implemented and verified. |
| ADR-004 | Evaluate `pi-hermes-memory` before expanding choco-pi memory into a graph system. | Accepted | Security/runtime review finds it incompatible or unsafe. |

## Critical blockers

No blocker prevents implementation planning for P0. The following block later phases:

1. External package adoption requires source, license, security, and runtime-conflict review.
2. Automatic source patch application is out of scope until rollback and sandbox validation are implemented.
3. Claude/Codex hook behavior must be redesigned for Pi extension APIs; direct porting is prohibited.

## Dynamic SDD handoff

Use this block to start implementation planning for the P0 MVP:

```json
{
  "objective": "Implement choco-pi P0 hardening for Requirement Lock and Feature Deletion Detector so completion cannot pass when MUST requirements are unresolved or features are silently removed without an accepted Spec Delta.",
  "scope": [
    "Persist requirement locks derived from Working Spec scope and acceptance criteria",
    "Expose lock status in structural_gate and /sessions-style diagnostics",
    "Detect suspicious feature/test deletion and hidden-rendering diffs from git/worktree changes",
    "Require accepted Spec Delta or explicit deferred boundary before completion",
    "Add unit tests and integration tests for pass/fail/false-positive cases"
  ],
  "acceptanceCriteria": [
    "structural_gate blocks readyToComplete=true when unresolved MUST lock items remain",
    "feature deletion detector flags removed exported functions/components/tests, new implementation placeholder markers, and new hidden rendering patterns",
    "accepted Spec Delta can intentionally defer or remove a requirement without false failure",
    "documentation explains lock lifecycle, failure messages, and escape hatches",
    "pnpm run version:check && pnpm run lint && pnpm run typecheck && pnpm run test passes"
  ],
  "testStrategy": [
    "RED tests for unresolved MUST lock completion",
    "RED tests for suspicious deletion without Spec Delta",
    "GREEN tests for intentional deletion with accepted Spec Delta",
    "Regression tests for micro-coding and report-only turns"
  ],
  "risks": [
    "False positives may block legitimate refactors",
    "Diff parsing may miss non-git or generated-file changes",
    "Structural gate messages must stay concise for Telegram and TUI"
  ]
}
```

## Next execution prompt

```text
Implement the P0 MVP from docs/prd/hugh-kim-hardening: Requirement Lock + Feature Deletion Detector. Start from spec_gate using the README handoff block, write RED tests first, implement the smallest Pi-native changes, then run the full choco-pi quality gate.
```
