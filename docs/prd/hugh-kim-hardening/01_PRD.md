# 01_PRD — choco-pi Hardening from Hugh Kim Harness Review

## Executive summary

choco-pi already contains the right primitives for autonomous work: Working Spec, structural completion gate, source registry, dogfood capture, mode isolation, and verification policy. The next improvement should harden those primitives against the most damaging agent failure mode: reporting completion after silently shrinking requirements, deleting features, or lowering verification standards.

The MVP adds two Pi-native guardrails:

1. **Requirement Lock**: converts accepted MUST requirements into explicit lock items that must be verified, deferred through Spec Delta, or blocked at `structural_gate`.
2. **Feature Deletion Detector**: detects suspicious feature/test removal or hidden rendering in diffs and requires an accepted Spec Delta before completion.

The broader roadmap adds Source Harvester 2.0, Memory/Dogfood Loop, and Project Profile, but those remain downstream until P0 completion integrity is stable.

## One-sentence thesis

Completion in choco-pi should mean the accepted requirements survived execution and passed observable verification, not merely that the agent found a smaller task it could finish.

## Problem statement

LLM agents often fail by changing the effective task rather than solving the hard part. The common pattern is:

1. User gives a requirement.
2. Agent starts implementation or research.
3. Errors, context pressure, or verification friction appear.
4. Agent silently narrows the task, deletes hard behavior, hides UI, removes tests, or reports weaker evidence.
5. Final answer claims completion because the shrunken task passes.

choco-pi's current `spec_gate` and `structural_gate` make completion more disciplined, but they do not yet create a concrete, machine-checkable lock between accepted requirements and final completion. They also do not inspect diffs for suspicious feature removal. This leaves a gap between "the agent wrote a spec" and "the final work still satisfies that spec."

## Why now

The Hugh Kim review converged on a consistent design principle: soft instructions decay, hard gates change execution conditions. choco-pi already has the runtime architecture for this principle. The missing product slice is a gate that specifically protects requirement continuity and feature preservation.

## Provenance summary

| Source | Relevant finding | Confidence | Use in PRD |
| --- | --- | --- | --- |
| `hugh-kim.space/service-completion-problem.html` | Identifies requirement shrinkage, feature deletion, and verification lowering as core LLM completion failures. Proposes Requirement Lock and Feature Deletion Detector. | Medium | Motivates P0 problem and solution shape. |
| `hugh-kim.space/keynote-aws-level.html` | Frames completion as an evidence contract, not a natural-language claim. | Medium | Supports completion gate framing. |
| `hugh-kim.space/trend-harvester-analysis.html` | Shows scoring, keep/discard, rollback, and no-overwrite guards for external source adoption. | Medium | Informs P1 Source Harvester. |
| Local `README_ko.md` and `extensions/choco-autopilot/*` | Confirms existing choco-pi gates, source registry, dogfood, memory, mode isolation. | High | Prevents duplicate framework work. |
| GitHub API metadata for Hugh repos | Confirms reviewed repos are generally MIT-licensed but Claude Code-oriented. | High for metadata | Allows idea-level reuse; blocks blind code port. |
| `pi.dev/packages` and npm registry metadata | Confirms Pi-native adjacent packages such as `pi-hermes-memory`, `pi-crew`, `@plannotator/pi-extension`. | High for existence | Requires build-vs-buy review before later phases. |

## Target users and job statements

### Primary user: choco-pi owner/operator

- **JOB-1**: When I ask choco-pi to complete a non-trivial task, I need assurance that it did not silently shrink the requirements.
- **JOB-2**: When implementation changes remove behavior, tests, or UI, I need the agent to surface that as an explicit scope decision.
- **JOB-3**: When external ideas look useful, I need choco-pi to adopt only the parts that fit Pi-native runtime and safety boundaries.

### Secondary user: future maintainer

- **JOB-4**: When debugging a blocked completion, I need a clear list of unresolved lock items and suspicious changes.
- **JOB-5**: When extending the system, I need boundaries that avoid turning choco-pi into a copied multi-agent mega-harness.

### System user: the agent itself

- **JOB-6**: Before final completion, I need deterministic signals that tell me whether requirements remain unresolved, intentionally deferred, or verified.

## Goals

| ID | Goal | Priority |
| --- | --- | --- |
| G-001 | Preserve accepted MUST requirements from `spec_gate` through final `structural_gate`. | P0 |
| G-002 | Detect suspicious feature/test deletion or hidden rendering before completion. | P0 |
| G-003 | Require explicit Spec Delta handling for intentional scope reduction. | P0 |
| G-004 | Extend source tracking into scored keep/discard adoption review. | P1 |
| G-005 | Convert repeated dogfood misses into safe patch proposals with provenance. | P1 |
| G-006 | Add project profile extraction after P0 gates are stable. | P2 |

## Non-goals

- Do not clone Hugh Kim's full 13-agent/50+ skill harness.
- Do not vendor external packages without source/security/runtime review.
- Do not automatically apply external source patches in P0.
- Do not block every edit operation; P0 blocks false completion, not exploratory editing.
- Do not store raw prompts, private paths, secrets, or raw tool output in new state.
- Do not require this PRD for micro-coding turns that do not use `spec_gate`.
- Do not make Telegram UI wide or table-heavy in runtime error messages.

## Scope boundaries

### In scope for MVP

- Requirement lock model derived from Working Spec scope and acceptance criteria.
- Lock item lifecycle: active, verified, deferred, removed-by-delta, blocked.
- Structural gate integration that prevents `readyToComplete=true` when active MUST items remain unresolved.
- Diff-based suspicious deletion detector for common TypeScript/Markdown/UI patterns.
- Spec Delta integration for intentional requirement removal or deferral.
- Tests and docs for pass, fail, intentional delta, and false-positive cases.

### Deferred

- Automated external trend harvesting.
- Automatic code patch application from external sources.
- Full memory graph or ontology engine.
- Full project-profile scaffolding for arbitrary repos.
- Browser/UI screenshot verification automation.

## Functional requirements

### FR-001 — Requirement Lock creation

When `spec_gate start` records a Working Spec for a non-trivial coding or behavior task, choco-pi must derive a requirement lock from:

- objective,
- scope entries,
- acceptance criteria,
- in-scope Spec Deltas that add requirements.

Each lock item must have:

- stable id,
- source type: objective, scope, acceptance, delta,
- text,
- priority: MUST by default for acceptance criteria and explicit MUST wording; SHOULD for softer scope entries,
- status,
- evidence references,
- delta reference when modified.

### FR-002 — Requirement status updates

choco-pi must allow lock items to move only through explicit transitions:

- `active` → `verified` when verification evidence is recorded,
- `active` → `deferred` only through Spec Delta with handling `deferred`, `new-loop`, `new-steering`, or `approval-boundary`,
- `active` → `removed-by-delta` only through accepted Spec Delta that explicitly removes or narrows the item,
- any unresolved MUST item → `blocked` at completion review.

### FR-003 — Structural gate enforcement

`structural_gate` must reject `readyToComplete=true` when:

- any MUST lock item is active without verification or accepted delta handling,
- any suspicious feature deletion exists without accepted Spec Delta,
- verification evidence only proves a weaker standard than the lock item requires.

The block message must include:

- concise failing item ids,
- reason,
- next safe action,
- no raw private data.

### FR-004 — Feature Deletion Detector

Before completion, choco-pi must inspect relevant diffs and flag suspicious changes including:

- removed exported functions/classes/components/tools/commands,
- removed tests or test cases near touched behavior,
- added implementation placeholder markers, including common to-do/fix-me/stub/not-implemented wording or equivalent Korean placeholders,
- new hidden rendering patterns such as `display: none`, `visibility: hidden`, `hidden`, `aria-hidden`, or `{false && ...}` near feature components,
- removed command/tool registrations,
- removed acceptance checks or quality gates.

### FR-005 — Intentional deletion path

The detector must not block intentional refactors when there is an explicit accepted Spec Delta that:

- names the affected requirement or feature,
- explains why deletion/removal is in scope,
- records handling as in-scope, deferred, new-loop, new-steering, or approval-boundary,
- updates acceptance criteria when necessary.

### FR-006 — Diagnostics surface

The blocked state must be visible in concise diagnostics:

- `structural_gate` failure details,
- `/sessions` or equivalent session dashboard summary,
- optional `spec_gate list` output extension.

### FR-007 — Source Harvester 2.0 review model

For P1, `source_registry` should support scored source review fields:

- choco-pi fit,
- Pi-native compatibility,
- hard-gate potential,
- evidence quality,
- maintenance cost,
- security/license risk,
- adoption depth,
- keep/discard decision,
- rollback or reversal trigger.

P1 must not auto-apply external code until sandbox, test, and rollback controls exist.

### FR-008 — Memory/Dogfood Loop proposal model

For P1, dogfood weekly patterns should produce patch proposals, not automatic mutations. Each proposal must include:

- repeated pattern evidence,
- affected policy/tool/module,
- proposed guard/test/doc change,
- privacy classification,
- verification plan,
- acceptance and rollback criteria.

### FR-009 — Build-vs-buy review

Before implementing memory/team/review features already represented in Pi package catalog, choco-pi must review relevant Pi-native packages, including at least:

- `pi-hermes-memory` for memory/search/consolidation,
- `pi-crew` for team/worktree orchestration,
- `@plannotator/pi-extension` for plan/code review UX.

### FR-010 — Project Profile extraction

For P2, choco-pi should support a project profile that records:

- package manager and scripts,
- build/test/typecheck/lint commands,
- source/test layout,
- architectural patterns,
- naming conventions,
- verification expectations,
- mode-specific guidance.

The profile must preserve existing project instructions and never overwrite user files without explicit intent.

## Non-functional requirements

### Reliability

- Requirement lock enforcement must be deterministic for the same Working Spec and diff.
- False positives must be explainable and bypassable only through Spec Delta, not silent ignore.
- Existing micro-coding, report-only, and approval-boundary flows must not regress.

### Security and privacy

- No raw prompts, secrets, private paths, or raw tool output are stored in new persistent lock state.
- Diff snippets stored for diagnostics must be minimized or hashed when possible.
- External source review must reject unknown license or high-risk code adoption by default.

### Performance

- Completion-time diff analysis should target changed files only.
- Large diffs should degrade gracefully: summarize risk and require review rather than reading entire content into prompt.
- Runtime prompt injection should remain concise.

### Observability

- Gate failures must include machine-readable reason codes for tests.
- Human-facing failure text must be short enough for Telegram and TUI.
- Weekly dogfood reports should distinguish clean, assisted, miss, and review outcomes.

### Accessibility and UX

- Telegram-visible summaries should avoid wide tables.
- Error messages should state the blocked requirement and next action in plain language.
- Diagnostic commands should provide detail on demand rather than flooding final replies.

## Success metrics

| Metric | Target | Phase |
| --- | --- | --- |
| Structural gate blocks unresolved MUST lock in tests | 100% of seeded RED cases | P0 |
| Intentional Spec Delta deletion passes | 100% of valid delta cases | P0 |
| Suspicious deletion detector catches seeded patterns | At least exported symbol, test removal, hidden render, placeholder cases | P0 |
| Regression rate for existing structural/protocol tests | 0 failures | P0 |
| Source review records include scoring fields | 100% for new adoption-analysis entries | P1 |
| Dogfood proposals include evidence and verification plan | 100% for generated proposals | P1 |

## Acceptance signals

P0 is accepted when:

1. RED tests prove current behavior can complete with unresolved MUST requirements or suspicious deletion.
2. GREEN implementation blocks those completions.
3. Accepted Spec Delta cases pass without false failure.
4. Existing `pnpm run check` passes.
5. README or docs explain how to recover from a block.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| False positives on legitimate refactors | Agent gets stuck or over-asks | Require Spec Delta path, not user clarification by default. |
| Diff parser misses dynamic behavior deletion | False confidence | Start with deterministic patterns and add dogfood proposals for misses. |
| Lock state becomes another noisy ceremony | Lower adoption | Auto-derive from `spec_gate`; no separate user workflow. |
| External packages duplicate choco-pi capabilities | Maintenance burden | Build-vs-buy review before P1/P2 implementation. |
| Claude/Codex hook assumptions leak into Pi | Runtime mismatch | Implement only through Pi extension APIs and tests. |

## Open questions

No critical question blocks P0. Non-critical assumptions are captured in `README.md` and can be revised through Spec Delta during implementation planning.

## Decision records

### ADR-001 — Pi-native hardening over full harness clone

- **Decision**: Implement only the requirement-continuity and deletion-detection patterns inside choco-pi.
- **Context**: Hugh's harness has broad agent/plugin/hook architecture, but choco-pi already has its own Pi-native runtime.
- **Alternatives**: Clone Hugh structure; adopt manager-orchestrator; do nothing.
- **Rationale**: The highest-value gap is completion integrity, not agent count.
- **Consequences**: Less surface area; fewer imported dependencies; more custom Pi integration work.
- **Reversal trigger**: A maintained Pi package provides equivalent gates with better tests and lower integration cost.

### ADR-002 — Completion gate first, write-time block later

- **Decision**: P0 blocks final completion, not every edit.
- **Context**: Editing often includes temporary deletion during refactor.
- **Alternatives**: Hard-block all suspicious edits; only warn in final report.
- **Rationale**: Completion is the safety boundary that matters most and is already enforced by `structural_gate`.
- **Consequences**: Some suspicious edits can happen temporarily, but cannot be reported as complete without reconciliation.
- **Reversal trigger**: Pi exposes reliable pre-write diff blocking with low false positives.

### ADR-003 — Source review before source adoption

- **Decision**: Extend source_registry scoring before any auto-apply source harvesting.
- **Context**: pi.dev and GitHub show useful external packages, but security/runtime fit is unverified.
- **Alternatives**: Auto-apply low-risk ideas; ignore external sources.
- **Rationale**: choco-pi policy already requires cautious adoption tracking.
- **Consequences**: Slower adoption, safer maintenance.
- **Reversal trigger**: Source sandbox, rollback, and conflict checks are fully implemented.
