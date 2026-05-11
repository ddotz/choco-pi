# Default/Base Mode Critic

Date: 2026-05-11
Scope: `modes/_base/MODE.md`, `modes/default/MODE.md`, `extensions/ddotz-autopilot/mode.ts`, `extensions/ddotz-autopilot/session-scope.ts`, `extensions/ddotz-autopilot/policy.ts`, `extensions/ddotz-autopilot/index.ts`, `tests/auto-mode-overlay.test.ts`, `tests/work-mode-registry.test.ts`.

## Implementation snapshot

- `_base` carries the shared invariants: Korean response style, hard approval boundaries, mode isolation, loop governance, structural gate, active-todo preservation, hybrid parallel strategy, verification, and confidence boundary.
- `default` is the root all-purpose generalist mode and may apply implemented specialized modes as temporary session-scoped overlays.
- `mode.ts` marks all built-in modes implemented: `default`, `web-analysis`, `adoption-analysis`, `report`, `coding`; no planned built-in modes remain.
- `inferPlannedWorkMode()` chooses an effective overlay from simple prompt regexes; `resolveEffectiveWorkMode()` applies the inferred overlay only when persistent/session mode is `default`.
- `before_agent_start` stores `effectiveWorkMode` per session and injects the matching prompt overlay. `message_end` runs web/coding/adoption quality guards against the effective mode.

## What currently works

- Persistent mode remains unchanged when default auto-applies an overlay; `tests/auto-mode-overlay.test.ts` verifies web/report/coding inferred overlays while `/mode status` still reports `default`.
- Built-in mode registry status and instruction file paths are covered by `tests/work-mode-registry.test.ts`.
- Base guardrails are centralized in `policy.ts`; specialized overlays are appended only through `buildModeOverlayGuidance(effectiveWorkMode)`.
- The newly added hybrid parallel policy is reflected in `_base`, prompt, skill, README, and `parallel_work_plan` output.

## Critics

### C1 — Auto-overlay inference is too broad for internal analysis

Severity: High

`inferPlannedWorkMode()` maps the Korean word `분석` directly to `web-analysis`. That is safe for external research, but unsafe for internal codebase analysis. A prompt like “모드 구현 분석해” can activate web-analysis even when the task is purely local repository review. This creates two risks:

1. The agent may apply retrieval-first external research behavior to local code review, wasting effort or misprioritizing sources over repository evidence.
2. The web-analysis message-end quality guard can demand `Conclusion/Evidence/Critical review/Confidence` web sections for a local codebase answer if the final answer looks like a web-analysis response.

Recommended minimal fix: split inference into `external-web-analysis` signals and local analysis signals. Require URL, web/search/source freshness terms, or explicit external/current information intent before auto-applying `web-analysis`. Keep generic `분석` in `default` unless paired with external terms.

### C2 — “Work mode: effective” can blur persistent vs temporary mode

Severity: Medium

The injected prompt includes both `Persistent work mode: default` and `Work mode: <effective>`. This is understandable to the model, but it can still cause the assistant to claim “web-analysis mode is active” when the persistent `/mode` remains `default`. The current prompt says the overlay is temporary, but the short `Work mode:` line may dominate.

Recommended minimal fix: rename the effective line to `Effective overlay:` or add a single strong sentence: “Do not tell the user the persistent mode changed.” Avoid adding a larger mode-state model.

### C3 — Default mode delegates to strict overlays but does not expose why to the user

Severity: Medium

When default auto-applies an overlay, the user sees behavior changes but may not see the routing reason. This is acceptable for routine work, but can be confusing when a task is misclassified. There is session runtime state with `suggestedWorkMode` and `automaticMode`, but no concise user-facing diagnostic unless debugging.

Recommended minimal fix: keep the default silent for normal work, but add a terse internal or `/mode status` extension display showing `default -> effective` and the inference reason. Avoid asking the user for routine routing approval.

### C4 — Base policy is strong, but some enforcement is prompt-only

Severity: Medium

Structural gate and todo preservation have runtime enforcement. Mode isolation is partly tested through prompt absence/presence, but several important base rules remain prompt-only: package reuse checks for new Pi capabilities, technical debt cleanup, and some approval-boundary subtleties. This is not necessarily wrong; over-enforcing every policy would become a harness rewrite.

Recommended minimal fix: do not add broad enforcement. Add only high-signal tests/guards for repeated failures observed in dogfood data.

### C5 — Documentation drift remains a recurring risk

Severity: Medium

`README.md`, `skills/ddotz-autopilot/SKILL.md`, `prompts/autopilot.md`, mode files, and runtime policy all encode similar concepts. Recent commits added README version sync and todo preservation, but drift risk remains because mode semantics are duplicated in several places.

Recommended minimal fix: keep source of truth in TypeScript policy modules and mode files; add narrow tests for README status/version only, not full doc mirroring. Do not introduce a doc generation pipeline unless drift becomes frequent.

## Guardrail escape risks

- Misclassified local tasks can escape the intended default-root philosophy by activating web/report/coding overlays too eagerly.
- A final answer can still claim specialized-mode behavior without actually using mode-specific tools; only some output contracts are guarded.
- Custom modes are registered as planned files, but there is no implementation path from custom `MODE.md` to runtime activation. This is safe, but users may expect custom modes to run.

## Purpose-fit risks

- Default’s goal is “one managed project across domains.” Over-aggressive auto overlays can narrow that generalist behavior too early.
- Deep/default mode PM behavior depends on instruction following and structural tools; if tools are skipped, fail-closed repair helps, but only after an attempted final answer.

## Minimal improvement candidates

1. Refine `inferPlannedWorkMode()` to avoid mapping generic `분석` to `web-analysis` without external/current-info context.
2. Add tests for local analysis prompts staying in `default`.
3. Clarify prompt wording around temporary effective overlays vs persistent work mode.
4. Add `/mode status` detail for effective overlay/reason if UI support is cheap.

## Deep research triggers

Proceed to deeper research only if dogfood data shows repeated misrouting or repair loops. Useful research topics:

- Lightweight intent classification for local-vs-external analysis without adding an LLM router.
- Minimal UX patterns for temporary mode overlays in coding agents.
- Guardrail design for prompt-only policies that should not become a full workflow engine.
