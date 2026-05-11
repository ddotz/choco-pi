# Adoption Analysis Mode Critic

Date: 2026-05-11
Scope: `modes/adoption-analysis/MODE.md`, `extensions/ddotz-autopilot/adoption-analysis-policy.ts`, `extensions/ddotz-autopilot/adoption-analysis-quality.ts`, `extensions/ddotz-autopilot/adoption-depth.ts`, `extensions/ddotz-autopilot/source-registry.ts`, `tests/adoption-analysis-mode.test.ts`, `tests/adoption-analysis-quality.test.ts`, `tests/source-registry*.test.ts`.

## Implementation snapshot

- The mode is implemented as a mode-scoped prompt overlay plus a message-end quality guard.
- It preserves default adoption capability while adding a strict output contract: decision, adoption depth, fit review, risk review, scope, tracking decision, confidence.
- Adoption depth is represented as a fixed ladder: `idea-only`, `prompt-policy`, `test-only`, `small-local-code`, `partial-port`, `dependency`, `fork-or-vendor`.
- `source_registry` stores tracked sources and optional adoption review metadata, and weekly checks GitHub sources via `git ls-remote`.

## What currently works

- Prompt isolation is tested: default does not include adoption-analysis overlay or strict adoption-depth contract.
- Quality guard catches missing decision/depth/fit/risk/scope/tracking/confidence sections.
- Source registry can record adopted/watched/rejected status, adoption depth, adopted/rejected items, reviewed refs, scope rationale, and changed-source state.
- The guard now supports repeated identical failure suppression while still allowing a later distinct failed repair attempt to queue another repair.

## Critics

### A1 — Quality guard validates section presence, not adoption evidence

Severity: High

The guard can pass an answer that says “license/security/source freshness reviewed” without any actual license, security, or freshness evidence. It checks for required section labels and keywords, not whether a source was fetched, a license was read, or dependency health was inspected.

Recommended minimal fix: do not build a full package auditor. Add a small evidence expectation for dependency/fork/vendor decisions: if adoption depth is `dependency` or `fork-or-vendor`, require explicit license and repository/package URL/provenance in the answer or lower confidence. Keep shallow depths lightweight.

### A2 — `watch` decisions are forced through adoption depth

Severity: Medium

The required contract always demands `Adoption depth`, even when the correct decision is `watch`. For a source that is relevant but not ready, forcing a depth can produce fake precision. A watch decision may not yet know whether future adoption would be idea-only, dependency, or rejected.

Recommended minimal fix: allow `Adoption depth: not-applicable-yet` only when `Decision: watch`, or require “prospective depth” wording. This avoids fake adoption-depth claims while preserving the mode’s structure.

### A3 — Tracking decision is not tied to `source_registry` action

Severity: Medium

The final answer can state “Tracking decision: track” without actually calling `source_registry`. Conversely, a source can be registered without the final answer documenting the tracking decision. The mode relies on model discipline to align the two.

Recommended minimal fix: when a source is actually adopted/watched/rejected via tool call, include the source id in final output. If the answer says track/watch/adopt but no tool call occurred, report it as a pending action or blocker. Use dogfood/tool-call signals before building a hard guard.

### A4 — Default/package reuse and adoption-analysis overlap is still conceptually subtle

Severity: Medium

Default mode has baseline package reuse and external adoption capability. Adoption-analysis adds a stricter review format. The policy states this clearly, but model behavior can still drift: it may apply adoption-analysis strictness to routine default work or treat adoption-analysis as mandatory before every package check.

Recommended minimal fix: add a short decision rule to mode docs: use adoption-analysis only when the primary user task is “whether/how much to adopt,” not for every package lookup or dependency installation.

### A5 — Source registry update checks are GitHub-centric

Severity: Low

`checkSource()` can only automatically inspect GitHub refs. Non-GitHub URLs return “requires model-led analysis.” This is acceptable for v1, but adoption-analysis can overstate autonomous freshness for non-GitHub sources.

Recommended minimal fix: final answers should distinguish `git ls-remote checked` vs `model-led/non-GitHub review required`. Do not add arbitrary scrapers unless a repeated source type justifies it.

### A6 — Security/license boundaries are under-specified

Severity: Medium

The mode tells the agent to review license/security/dependency health, but does not define minimum evidence. For dependencies, the safe path differs from idea-only or prompt-policy adoption. Without minimum evidence, the agent may claim High confidence too easily.

Recommended minimal fix: define tiny minimums by adoption depth:

- `idea-only`, `prompt-policy`, `test-only`: source URL + relevance + no vendored code.
- `small-local-code`, `partial-port`: license compatibility or no copied code statement.
- `dependency`, `fork-or-vendor`: license, package/repo freshness, maintenance signal, and runtime conflict review.

## Guardrail escape risks

- Keyword-stuffed risk reviews can pass without source evidence.
- A final answer can claim tracking happened without `source_registry` state change.
- `watch` can be forced into fake adoption-depth selection.
- Default auto-inference from `repo`, `github`, `source` may activate adoption-analysis for simple repo inspection, not adoption decisions.

## Purpose-fit risks

- The mode’s goal is adoption decision quality, not external research in general. If used for every repo URL, it can slow routine codebase/reference inspection.
- If the source registry becomes the only durable tracking layer, non-GitHub sources may look less fresh than they are.

## Minimal improvement candidates

1. Add special handling for `Decision: watch` adoption depth.
2. Add minimum evidence expectations by adoption depth, especially for dependency/fork/vendor.
3. Connect final tracking decision wording to `source_registry` tool outcomes when available.
4. Refine auto-inference so `github` or `repo` alone does not always mean adoption-analysis.
5. Add tests for watch-without-final-depth and dependency-without-license-evidence.

## Deep research triggers

Proceed to deep research if several adoption cases reach `dependency` or `fork-or-vendor`. Useful topics:

- Minimal license/security review checklists for coding-agent package adoption.
- Source registry schemas that preserve evidence without storing excessive raw content.
- How to represent “watch” without premature adoption-depth commitment.
