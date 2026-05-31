# 04_AGENT_SPEC — AI Execution Rules for choco-pi Hardening

## Purpose

This file tells an implementation agent how to execute the PRD safely inside choco-pi. It is intentionally stricter than the product PRD because the work changes completion gates and can easily create false confidence or false blocks.

## Implementation posture

- Use TDD for code changes.
- Keep P0 narrow: Requirement Lock and Feature Deletion Detector only.
- Prefer small pure helpers with unit tests before runtime integration.
- Preserve mode isolation and existing choco-pi protocol semantics.
- Do not import Hugh's Claude/Codex hook code directly.
- Do not adopt external Pi packages during P0.

## Required implementation sequence

1. Start `spec_gate` from the README handoff block.
2. Write RED tests for Requirement Lock failures.
3. Implement lock derivation and structural gate blocking.
4. Write RED tests for deletion detector failures.
5. Implement deterministic diff detector and Spec Delta reconciliation.
6. Add docs and concise diagnostics.
7. Run full quality gate.
8. Use `structural_gate` before completion.

## Guardrails

### Scope guardrails

- Do not implement Source Harvester 2.0 in the P0 branch.
- Do not implement Memory/Dogfood proposal loop in the P0 branch.
- Do not add Project Profile in the P0 branch.
- Do not create a new work mode for this feature.
- Do not add a user-facing command unless tests show diagnostics are otherwise unusable.

### Data guardrails

- Do not persist raw prompts.
- Do not persist raw command output.
- Do not persist absolute private paths when a relative path or hash is enough.
- Do not persist secrets or environment values.
- Do not store full diffs by default; store pattern ids and summaries.

### Runtime guardrails

- Do not break micro-coding completion that intentionally has no `spec_gate`.
- Do not make report-only turns require code-diff analysis unless files changed.
- Do not override approval-boundary behavior.
- Do not bypass existing autonomy protocol required-tool tracking.
- Do not perform destructive git operations.

### External source guardrails

- Do not vendor or fork external packages in P0.
- Do not auto-apply external source patches.
- Do not treat Hugh performance numbers as verified product metrics.
- Do not use external package code without license/security/runtime review.

## Required tests

### Requirement Lock tests

- Creates lock items from acceptance criteria.
- Marks lock items verified only with evidence.
- Blocks structural completion when MUST item is unresolved.
- Allows completion when Spec Delta explicitly defers/removes the item.
- Does not leak lock state across sessions.
- Does not affect micro-coding protocol.

### Feature Deletion Detector tests

- Flags removed exported function.
- Flags removed component or tool registration.
- Flags removed test case.
- Flags added implementation placeholder.
- Flags hidden rendering pattern.
- Allows intentional deletion with accepted Spec Delta.
- Ignores low-risk docs-only churn unless it removes acceptance/gate content.

### Integration tests

- `spec_gate start` → lock derivation → `structural_gate` block.
- `spec_gate delta` → requirement deferred → `structural_gate` pass when otherwise verified.
- File diff with suspicious deletion → `structural_gate` block.
- Existing report-research and parallel-work protocol tests remain green.

## Required verification commands

Run in repo root:

```bash
pnpm run version:check
pnpm run lint
pnpm run typecheck
pnpm run test
```

For final verification:

```bash
pnpm run check
```

If any command fails, report RED/root cause/fix/GREEN and continue until resolved or blocked by a real boundary.

## Approval boundaries

Stop and report a blocker before:

- publishing a package,
- installing or adopting an external package into runtime,
- changing secrets, accounts, or paid API configuration,
- deleting branches/worktrees or running destructive cleanup,
- transferring private dogfood/memory data externally,
- auto-applying source-harvester patches.

Normal local code edits, tests, commits, and git push are not deployment.

## Architectural constraints

### Requirement Lock

- Implement as an extension of dynamic SDD state or choco-pi state, not as a separate project file users must edit.
- Stable ids must be deterministic for testability.
- Lock priority must be conservative: acceptance criteria are MUST; vague scope entries can be SHOULD.
- Lock updates must flow through Spec Delta, not direct mutation to fit tests.

### Feature Deletion Detector

- Implement detector as a pure function first.
- Keep pattern rules named and testable.
- Severity must be explicit.
- Detector output must be reconciled with accepted Spec Deltas before blocking.
- Large diffs should produce a review-required summary, not prompt flooding.

### Structural Gate

- Keep `structural_gate` the final authority.
- `readyToComplete=true` must fail closed when P0 blockers exist.
- Failure text should include only concise ids and next action.
- Medium confidence is not a completion state.

## Suggested file ownership for implementation

| Area | Files |
| --- | --- |
| Requirement lock model | `extensions/choco-autopilot/dynamic-sdd.ts` or new `requirement-lock.ts` |
| Structural integration | `extensions/choco-autopilot/structural-gate.ts` |
| Detector | new `extensions/choco-autopilot/feature-deletion-detector.ts` |
| Diagnostics | `session-dashboard.ts`, tests only if needed |
| Tests | `tests/dynamic-sdd.test.ts`, `tests/structural-gate.test.ts`, new detector tests |
| Docs | `README_ko.md`, `README.md`, or focused doc update if runtime behavior changes |

## Spec Delta policy during implementation

If implementation reveals a needed change:

- **In-scope**: detector needs a helper file, lock model needs a separate module, diagnostics need a short formatter.
- **Deferred**: project profile, source harvester scoring, memory graph integration, UI dashboards.
- **New loop**: adopting `pi-hermes-memory`, adding `/requirements`, adding auto-apply source patches.
- **Approval boundary**: installing packages, publishing, destructive migration, private-data transfer.

## Implementation prompt

```text
Implement P0 choco-pi hardening from docs/prd/hugh-kim-hardening. Start with spec_gate using the README handoff block. Use TDD. First add RED tests proving unresolved MUST requirements and suspicious feature deletion can currently pass. Then implement Requirement Lock and Feature Deletion Detector as Pi-native structural_gate hardening. Do not implement P1/P2 features. Run pnpm run check and structural_gate before completion.
```

## Completion report requirements

Final implementation report must include:

- Result summary.
- RED evidence.
- Root cause.
- Fix.
- GREEN evidence.
- Changed files.
- Deferred follow-ups.
- Confidence: High only after full verification passes.
