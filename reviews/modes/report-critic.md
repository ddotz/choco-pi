# Report Mode Critic

Date: 2026-05-11
Scope: `modes/report/MODE.md`, `extensions/choco-autopilot/report-policy.ts`, `extensions/choco-autopilot/mode-resource-policy.ts`, `tests/report-mode.test.ts`.

## Implementation snapshot

- Report mode is implemented as a mode-scoped prompt overlay and resource policy.
- It requires evidence ledgers, confidence double-check/triple-check rules, section-first drafting, cross-section and whole-report review, numeric consistency, Kami-derived layout constraints, and im-not-ai-derived Korean polishing.
- Tests verify prompt isolation, presence of report guidance, mode-scoped resources, section-first/cross-section/whole-report pass instructions, and numeric consistency wording.
- There is no report-specific message-end quality guard yet.

## What currently works

- Default mode does not receive report-specific overlay content such as `Report evidence ledger`, `Section-only pass`, `Kami-derived layout`, or `im-not-ai-derived polishing`.
- Report prompt includes strong evidence discipline and clear assembly order.
- The mode avoids vendoring Kami and explicitly avoids the commercial-license risk of Kami’s Chinese font as Korean default.
- Resource policy keeps report-specific skills (`insane-search`, `kami`) isolated from default.

## Critics

### R1 — Report mode has no runtime output guard

Severity: High

Unlike web-analysis, adoption-analysis, and coding, report mode has no message-end quality guard. A final report can omit the executive summary, evidence notes, critical review, or Confidence section and still pass runtime. The prompt is detailed, but prompt-only enforcement is weaker for long reports where context pressure is highest.

Recommended minimal fix: add a lightweight report quality evaluator that triggers only on report-like completion answers. Required checks should be minimal: executive summary, evidence notes/ledger, critical review/open risks, and confidence. Do not attempt to validate every claim semantically.

### R2 — Evidence ledger is required but not stored or auditable

Severity: High

The mode asks the agent to build a report evidence ledger before synthesis, but there is no tool or file convention for where that ledger lives. In chat-only outputs, the ledger may be summarized away, making later review hard. For generated report artifacts, there is no durable evidence sidecar.

Recommended minimal fix: define a simple optional convention: for file-based reports, write `<report>.evidence.md` or an appendix section; for chat-only reports, include compact evidence notes. Avoid creating a database or report service.

### R3 — The policy is powerful but heavy for simple writing tasks

Severity: Medium

Auto-inference maps `보고서|문서|글|카드뉴스|요약문|리포트|white paper|report` to report mode. That can over-apply report discipline to simple copy edits, README changes, or short summaries. This may conflict with default’s “choose the smallest useful process” philosophy.

Recommended minimal fix: refine inference so `report` mode auto-applies when the user asks for evidence-backed report/document production, not every `문서` or `글` occurrence. Short docs/editing tasks should remain default or coding depending on file edits.

### R4 — Double-check/triple-check rules are not operationalized

Severity: Medium

The prompt says Medium evidence requires independent double-check and Low evidence requires triple-check. The runtime does not track source families or check counts. This can lead to performative claims like “double-checked” without actual evidence.

Recommended minimal fix: require the evidence notes to mark source family count for High-confidence key claims. Do not build a citation graph unless report dogfood shows repeated citation failures.

### R5 — Rewrite-rate limits are not measurable

Severity: Low

The im-not-ai-derived policy says warn above 30% rewrite rate and stop/rollback above 50%. The runtime has no diff baseline for freeform text unless editing a file. This is a good instruction but can be misleading in chat-only report generation.

Recommended minimal fix: scope rewrite-rate rules to file-editing/polish tasks where before/after text is available. For new report drafts, use a simpler “preserve source facts and numbers” rule.

### R6 — Kami layout guidance may bleed into non-artifact answers

Severity: Low

Report mode includes layout constraints such as warm parchment, ink-blue accent, serif-led hierarchy. These are useful for generated document artifacts, but irrelevant for plain chat reports. The policy states “final artifacts,” but the assistant may still discuss layout unnecessarily.

Recommended minimal fix: add “apply layout only when producing an artifact or design spec; omit layout discussion for plain chat reports.”

## Guardrail escape risks

- A report-like answer can omit evidence ledger and critical review because no message-end guard exists.
- “Double-checked” and “triple-checked” can be claimed without source family evidence.
- Formula-bound numbers can be guessed if the model does not maintain a calculation basis.

## Purpose-fit risks

- Report mode can become too procedural for short writing tasks, causing overengineering.
- The mode aims at C-level decision reports; applying it to general docs or card-news content may produce unnatural structure.
- Layout/polish guidance can distract from evidence quality if applied too early.

## Minimal improvement candidates

1. Add a small report quality guard for report completions.
2. Define a simple evidence-notes convention for file-based and chat-only reports.
3. Refine report auto-inference away from generic `문서`/`글` unless evidence-backed report production is requested.
4. Scope rewrite-rate and Kami layout rules to artifact-producing contexts.
5. Add tests for report guard bypass/status answer behavior if a guard is implemented.

## Deep research triggers

Proceed to deep research if report outputs repeatedly fail evidence or citation integrity. Useful topics:

- Lightweight evidence-led report templates that avoid full citation-management systems.
- Minimal numeric consistency checks for agent-generated reports.
- Practical Korean executive-report structure that preserves critical review without becoming verbose.
