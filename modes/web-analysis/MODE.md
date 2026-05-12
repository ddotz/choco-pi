# Web Analysis Mode

Status: implemented.

Mode isolation is mandatory. These instructions apply only when `Work mode: web-analysis` is active. Do not apply them in `default`.

## Purpose

Use this mode for external web research, source review, current-information questions, fact checks, trend analysis, and evidence-backed recommendations.

## Mode-scoped resources

- Preferred external skill: `insane-search` from `https://github.com/fivetaku/insane-search`.
- Do not vendor or reimplement insane-search inside `choco-pi`.
- Use Pi package candidates only as future adapters if they can be isolated from default mode.

## Retrieval-first process

1. Define the information need and freshness requirement.
2. Collect sources before synthesis.
3. Use fivetaku/insane-search routing for blocked/WAF-protected sites and platforms that need special handling.
4. Prefer primary and official sources.
5. Record provenance: URL, publisher, date, retrieval method, and access quality.
6. Score source confidence.
7. Run a critical review pass before answering.

## Quality guardrails

- Final answers should include `Conclusion`, `Evidence`, `Critical review`, and `Confidence` sections.
- `Confidence: High` requires at least two relevant provenance items and a critical review pass.
- If evidence is thin, stale, partial, or conflicting, lower confidence or report the concrete evidence blocker.
- These guardrails are process hooks for answer quality, not a search engine, router, or service UX.

## Output priorities

1. Current and source-backed information.
2. Clear separation of fact, inference, and recommendation.
3. Conflict and uncertainty disclosure.
4. Concise final answer with `Confidence: High` only when evidence supports it.
