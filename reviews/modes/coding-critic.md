# Coding Mode Critic

Date: 2026-05-11
Scope: `modes/coding/MODE.md`, `extensions/choco-autopilot/coding-policy.ts`, `extensions/choco-autopilot/coding-quality.ts`, `extensions/choco-autopilot/guard-repair-status.ts`, `tests/coding-mode.test.ts`, `tests/coding-quality.test.ts`.

## Implementation snapshot

- Coding mode is implemented as a mode-scoped prompt overlay plus a message-end quality guard.
- Prompt overlay emphasizes TDD-first implementation, systematic debugging, surgical diffs, simplicity, targeted then full verification, UI gstack evidence when relevant, and commit hygiene.
- Quality guard requires final coding completion answers to include Result, Verification, and Confidence. Bug/regression completions also need RED, Root cause, Fix, GREEN.
- Guard suppresses repeated identical repair follow-ups but now allows later distinct failed repair attempts to queue new hidden repairs.

## What currently works

- Prompt isolation is tested: default prompt does not include coding-specific overlay sections.
- Coding mode prompt includes TDD, systematic debugging, RED/GREEN, full quality gate, gstack QA, and coding quality guard wording.
- Guard catches obvious unverified completion claims such as “구현 완료했습니다. Confidence: High”.
- Guard does not block plain status answers while coding mode is active.
- Tests cover non-bug completion, bug-fix evidence chain, repeated repair suppression, and later failed repair requeue.

## Critics

### C1 — Verification detection accepts vague “확인” language

Severity: High

`hasVerification()` accepts broad tokens including `확인`, `실행`, `passed`, `test`, and `green` inside the Verification section. This can allow a final answer like `Verification: 확인했습니다` plus `Confidence: High` to pass, even without an actual command or observable evidence. The guard therefore enforces a report shape more than real verification.

Recommended minimal fix: require at least one concrete verification marker: command-like text (`pnpm`, `vitest`, `tsc`, `pytest`, `git diff --check`), explicit observable artifact (`screenshot`, `runtime smoke`, `manual QA with URL`), or a stated blocker with Confidence below High. Remove bare `확인` as a pass condition.

### C2 — TDD-first is not actually enforced

Severity: High

The prompt requires RED before implementation, but runtime cannot tell whether a failing test was run before code changes. The final answer may include RED/GREEN text after the fact. This is expected for a lightweight mode, but it means “TDD-first” is still mostly instruction discipline.

Recommended minimal fix: avoid heavy event-sourcing. Use dogfood signals: if a coding turn had production-file edits before any test command, mark it as a review case. Do not block all work on this until the signal is reliable.

### C3 — Bug-fix detection is heuristic and can miss common Korean phrasing

Severity: Medium

`appearsToBeBugFixCompletion()` checks terms like `버그`, `bug`, `regression`, `오류`, `에러`, `고쳤`, `Root cause`, `RED`, `GREEN`. It may miss “수정했습니다” when the context is clearly a defect, or “패치했습니다”/“문제 해결했습니다”. Conversely, it can over-trigger on a status report mentioning an error.

Recommended minimal fix: expand cautiously with Korean defect phrases only when paired with completion language. Keep the plain-status bypass to avoid false positives.

### C4 — UI/browser QA requirement is prompt-only

Severity: Medium

Coding policy says UI/browser-impacting changes require gstack QA evidence or a blocker. The quality guard does not know whether changed files are UI/browser-impacting, nor whether gstack ran. A UI change can pass with `pnpm test` only.

Recommended minimal fix: if changed files match common UI extensions or paths, surface a commit-review warning or dogfood review queue entry when no browser QA evidence appears. Avoid hard-failing non-UI projects.

### C5 — Full gate wording may overapply to tiny edits

Severity: Low

The mode says default code-change gate is `pnpm run version:check && pnpm run lint && pnpm run typecheck && pnpm run test`. That is good for choco-pi, but for trivial text-only edits or small docs changes it can be heavier than needed. The prompt says use judgment for trivial tasks, but the final guard does not distinguish.

Recommended minimal fix: keep full gate as default for runtime code changes. For docs-only changes, allow `git diff --check` plus targeted docs/read verification, but require the final answer to say why full gate was not relevant.

### C6 — Completion guard can be fooled by section labels

Severity: Medium

A final answer can include the required headings with low-quality content. For example, `Verification: pnpm test` without pass/fail or output could be accepted if token matching remains broad. This is acceptable for a lightweight guard, but the current regex should be tightened enough to reject the most obvious hollow claims.

Recommended minimal fix: require a pass/fail/result marker near command text. Keep the implementation small.

## Guardrail escape risks

- “Verification: 확인했습니다” can pass as verification if Confidence is present.
- RED/GREEN can be claimed after-the-fact without evidence of ordering.
- UI/browser-impacting changes can skip gstack evidence.
- Simple completion phrasing can avoid the guard if it lacks the detected coding-completion patterns.

## Purpose-fit risks

- Coding mode is designed to prevent unsupported assumptions and broad refactors. If auto-applied to simple file/status questions, it can overburden responses.
- Strict TDD language can conflict with investigation-only coding questions unless the agent distinguishes analysis from implementation.
- The mode may create performative RED/GREEN reporting if tests are not actually run.

## Minimal improvement candidates

1. Tighten verification regex to require concrete command/observable evidence, not bare `확인`.
2. Add a dogfood signal for production edits before test commands in coding mode.
3. Add UI-file heuristic warning when gstack/browser evidence is missing.
4. Expand bug-fix detection for Korean defect completion phrases cautiously.
5. Add tests for hollow Verification sections that should fail.

## Deep research triggers

Proceed to deep research if coding mode still reports false High confidence. Useful topics:

- Lightweight event-based TDD compliance signals without storing raw code or prompts.
- Verification evidence schemas for coding agents.
- UI-impact detection heuristics that are good enough without framework-specific config.
