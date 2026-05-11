# Mode Critic Review Index

Date: 2026-05-11
Purpose: consolidated entry point for the per-mode critic files requested before a deep-research and improvement loop. This is analysis output only; it intentionally does not implement fixes.

## Files

- [`default-base-critic.md`](./default-base-critic.md) — base/default invariants, auto-overlay routing, mode isolation, structural gates, and documentation drift.
- [`web-analysis-critic.md`](./web-analysis-critic.md) — retrieval-first web research policy, provenance guard, critical review guard, and source-quality escape routes.
- [`adoption-analysis-critic.md`](./adoption-analysis-critic.md) — adoption-depth contract, source registry alignment, watch/adopt decisions, and license/security evidence risks.
- [`report-critic.md`](./report-critic.md) — report evidence ledger, section-first assembly, Kami/im-not-ai-derived policy, and missing report quality guard.
- [`coding-critic.md`](./coding-critic.md) — TDD-first coding policy, verification evidence guard, RED/GREEN reporting, and UI/browser QA evidence risk.

## Cross-mode top risks

1. **Auto-overlay misrouting** — generic terms such as `분석`, `문서`, `repo`, or `github` can activate specialized modes when the user may intend local/default work.
2. **Output-shape guards are not evidence guarantees** — web/adoption/coding guards mostly validate final-answer sections and keywords, not the underlying tool/event evidence.
3. **Report mode is prompt-only** — report has strong policy text but no message-end quality guard, so evidence ledger and critical-review omissions can escape.
4. **Evidence claims need minimum thresholds** — web provenance, adoption license/security review, report double-checks, and coding verification can be claimed too lightly.
5. **Docs/policy duplication remains a drift vector** — mode files, policy modules, README, prompt, and skill files repeat related constraints.

## Recommended improvement order

1. **Default/base inference tightening**
   - Keep generic local analysis in `default` unless external/current web intent is explicit.
   - Add tests for local mode-implementation analysis staying in default.

2. **Coding verification hardening**
   - Remove bare `확인` as sufficient verification.
   - Require command/observable evidence or an explicit blocker.

3. **Report completion guard**
   - Add a small report-like answer detector and check for executive summary, evidence notes, critical review/open risks, and confidence.

4. **Web provenance hardening**
   - Add Korean section aliases.
   - Detect paragraph-style web research completions.
   - Add a simple distinct-host/source-family heuristic for High confidence.

5. **Adoption decision evidence thresholds**
   - Treat `watch` as not requiring a committed adoption depth, or mark it as prospective.
   - Require minimum license/security/freshness evidence for dependency/fork/vendor choices.

## Deep research candidates

Deep research is warranted if the goal is an improvement loop rather than immediate patching. Focus areas:

- Intent classification for local vs external analysis without adding a full router.
- Minimal event/tool evidence signals for verification, retrieval, and adoption reviews.
- Lightweight report evidence-led templates and output guards.
- Evidence thresholds by adoption depth.
- Dogfood metrics to decide which prompt-only policies deserve runtime enforcement.

## Non-goals for the next loop

- Do not build a full search engine, citation database, package auditor, or workflow orchestrator.
- Do not vendor `insane-search`, Kami, or external subagent packages just to enforce these critics.
- Do not make every prompt policy a hard runtime gate; prioritize repeated, high-impact failures.
- Do not change mode semantics before confirming the intended behavior with focused tests.
