# Web Analysis Mode Critic

Date: 2026-05-11
Scope: `modes/web-analysis/MODE.md`, `extensions/choco-autopilot/web-analysis-policy.ts`, `extensions/choco-autopilot/web-research-quality.ts`, `extensions/choco-autopilot/mode-resource-policy.ts`, `tests/web-analysis-mode.test.ts`, `tests/web-research-quality.test.ts`.

## Implementation snapshot

- The mode is implemented as a prompt overlay plus a message-end quality guard.
- Policy requires retrieval-first source collection, provenance, confidence scoring, and a critical review pass.
- Mode resources list `insane-search` as the external skill and explicitly reject vendoring or reimplementing it.
- Quality guard checks for evidence/provenance hints, critical review, Confidence section, and High confidence with at least two detected evidence items.
- Guard is mode-scoped and bypasses default mode.

## What currently works

- Prompt isolation is tested: default prompt does not include `### Web Analysis Mode` or the retrieval-first rubric.
- Guard catches obvious low-quality outputs such as `Conclusion: 최신입니다. Confidence: High` with no provenance.
- Guard avoids leaking internal repair text to the user; it replaces the visible answer with the shared repair-status message and queues a hidden follow-up.
- Repeated identical failed repair attempts are suppressed, while later distinct failed attempts can now queue another repair.

## Critics

### W1 — Retrieval-first is not runtime-enforced

Severity: High

The mode’s core purpose is retrieval-first web research, but the runtime guard validates only the final answer shape. It cannot know whether the agent actually retrieved sources before synthesis. An answer can include two URLs and plausible provenance text without any tool use. Conversely, a strong answer based on verified local source snippets may fail if provenance strings are not shaped as expected.

Recommended minimal fix: do not build a search engine. Instead, track whether at least one retrieval-capable tool call happened during a web-analysis turn, then use that as an optional quality signal in dogfood or a lightweight guard. Keep the current output guard as a second line, not the only signal.

### W2 — Answers without web-analysis section labels can bypass the guard

Severity: High

`appearsToBeWebResearchAnswer()` only triggers when `Conclusion`, `Evidence`, or `Critical review` sections are present. A low-quality web research answer written as ordinary Korean paragraphs can bypass the quality guard entirely. This bypass is intentional enough to avoid blocking plain status answers, but it creates an escape route for the exact mode purpose.

Recommended minimal fix: in `web-analysis`, also detect web-research completion claims such as “조사했습니다”, “최신”, “자료를 확인”, URLs, or source-backed recommendations. Keep a plain-status bypass for mode/status/git answers.

### W3 — Provenance detection is shallow

Severity: Medium

Evidence count uses unique URLs or lines containing tokens like `published`, `updated`, `retrieved`, `full text`, `metadata`, `doi`, or `access quality`. This encourages surface-form provenance, not actual source quality. It also does not validate independence; two URLs from the same source family can satisfy High confidence.

Recommended minimal fix: add a small evidence-family heuristic for same hostname and require two distinct hostnames for High confidence unless the answer explicitly says one source is primary and confidence is not High. Avoid adding a full citation parser.

### W4 — Critical review can be satisfied by generic caveat language

Severity: Medium

The guard accepts `Critical review` content or keywords like `caveat`, `conflict`, `불확실`. This can pass generic “caveat checked” text without a real contradiction or uncertainty analysis.

Recommended minimal fix: require the Critical review section to be non-empty and contain at least one concrete risk term plus a short clause. Do not attempt semantic grading unless dogfood shows repeated failures.

### W5 — Korean section labels are not first-class

Severity: Medium

The mode is Korean-default, but the quality guard primarily checks English labels (`Conclusion`, `Evidence`, `Critical review`, `Confidence`). It may push final answers toward English section headings even when Korean report style would be more natural.

Recommended minimal fix: support Korean aliases: `결론`, `근거`, `증거`, `비판적 검토`, `한계`, `신뢰도`. Keep English labels accepted for consistency.

### W6 — `insane-search` is a declared resource, not a guaranteed available capability

Severity: Low

The policy correctly says not to vendor insane-search. However, if the skill is unavailable or blocked, the mode has no runtime fallback beyond the agent’s ordinary tools. This is acceptable, but final answers should state evidence blockers rather than imply successful special retrieval.

Recommended minimal fix: add a small final-answer reminder: if special retrieval was needed but unavailable, report the access blocker and lower confidence.

## Guardrail escape risks

- Paragraph-style web answers can avoid the guard.
- Fake provenance-shaped lines can satisfy evidence count.
- Generic caveat text can satisfy critical review.
- Generic `분석` auto-inference from default can accidentally activate this mode for local code analysis.

## Purpose-fit risks

- The mode can produce better-looking research answers without actually improving retrieval behavior.
- It can over-index on current web evidence when the user wanted local-source analysis or historical context.
- The policy is strong enough for expert behavior, but the guard only checks a narrow output shell.

## Minimal improvement candidates

1. Broaden web-answer detection to paragraph-style completion claims while preserving status-answer bypass.
2. Add Korean section aliases.
3. Track retrieval-capable tool use as a weak signal for web-analysis turns.
4. Add hostname independence heuristic for High confidence.
5. Refine default auto-inference so generic `분석` does not trigger web-analysis alone.

## Deep research triggers

Proceed to deep research if enough dogfood cases show either fake provenance or web-analysis bypass. Useful topics:

- Minimal provenance heuristics that avoid citation-parser overengineering.
- Browser/search tool-call signals in Pi extension events.
- How research agents distinguish source collection, extraction, and synthesis without a full research database.
