# Report Mode

Status: implemented.

Mode isolation: this overlay applies only while work mode is `report`. Do not apply these report-writing contracts in `default`.

Purpose:

- Produce evidence-backed professional reports from user materials plus external research.
- Keep the output suitable for C-level readers: concise, decision-oriented, low-adjective, and data-first.
- Use Kami-derived document layout constraints and im-not-ai-derived Korean polishing rules as report-mode policy only.

## Source and evidence discipline

- Build a report evidence ledger before synthesis.
- For every material claim, record source or user-material reference, publisher/owner, date when available, retrieval method, access quality, confidence, and claim type: fact, inference, recommendation, or open risk.
- No unsupported assumptions or unchecked citations. Do not invent citations, statistics, quotes, dates, source titles, or market facts.
- Prefer user-provided materials, official/primary sources, filings, docs, releases, and direct data over summaries.
- If sources conflict, disclose the conflict and prefer the better-supported source instead of averaging claims.

## Confidence gating

- High-confidence evidence may be used after provenance review and conflict check.
- Medium-confidence evidence requires at least one independent double-check before use.
- Low-confidence evidence generally requires triple-check before use; otherwise mark it as a gap or open risk.
- Multiple sources sharing the same upstream report count as one evidence family.
- If evidence remains thin, stale, partial, or inaccessible, lower confidence or state the concrete evidence blocker.

## Report assembly order

- Partition the report into parts and sections before drafting; each part must have a purpose, evidence need, and expected conclusion.
- Section-only pass: draft each section, then review and improve each section in isolation before checking other sections. Tighten claim support, local logic, section-level wording, and numbers inside that section first.
- Cross-section pass: after section-only quality is stable, cross-check consistency, logical structure, sentence flow, and numeric consistency across sections. Resolve duplicated claims, contradictory assumptions, timeline mismatches, and term drift before whole-report polish.
- Whole-report pass: review the complete report once more through critique, checking executive summary alignment, conclusion support, narrative flow, evidence gaps, and reader decision value.
- Formula-bound numbers must be calculated from the stated formula, not estimated. If a formula is available, show or retain the calculation basis in the ledger/notes and block completion when inputs are missing instead of guessing.

## Report gardening process

1. Define objective, audience, decision context, scope, output format, and user-provided materials.
2. Collect sources before synthesis; use the external insane-search playbook for blocked, WAF-protected, Korean platform, GitHub, YouTube, Reddit, X/Twitter, Naver, Medium, Substack, Stack Overflow, Coupang, and LinkedIn sources.
3. Fill the report evidence ledger.
4. Partition the report into parts and sections, then run the section-only pass before cross-section and whole-report review.
5. Run logic review: claim → evidence → inference → implication.
6. Check conflicts, stale data, missing base rates, single-source dependence, incentives, unsupported causal jumps, and strict numeric consistency.
7. Draft the report in C-level Korean style.
8. Apply Kami-derived layout constraints.
9. Apply im-not-ai-derived polishing while preserving meaning.
10. Final QA: evidence ledger, paragraph length, citation integrity, critical review, formula-based calculations, and confidence boundary.

## Writing style

- Use professional Korean report style by default.
- Keep each natural paragraph under 300 Korean characters unless preserving a direct quote or legal/technical excerpt requires otherwise.
- Separate facts, analysis, recommendations, and open risks.
- Prefer precise numbers and sourced facts over adjectives.
- Avoid generic openings, hype, filler, and claims that merely restate headings.

## Kami-derived layout policy

- Use a warm parchment surface, ink-blue single accent, restrained serif-led hierarchy, compact executive summary, clear section breaks, evidence notes, and appendix/reference separation.
- Treat Kami as a design constraint source, not a dependency that must be vendored wholesale.
- Do not use Kami's Chinese Tsanger font as the Korean default because of commercial licensing risk; use Korean-safe system or project-approved fonts.

## im-not-ai-derived polishing policy

- Polish only after evidence and logic are stable.
- Preserve meaning, numbers, proper nouns, direct quotes, source names, and legal/technical excerpts.
- Prefer span-grounded local edits over broad rewrites.
- Maintain the professional report register; do not turn reports into essays, marketing copy, or casual blog posts.
- Warn when rewrite rate exceeds 30%; stop and rollback if it exceeds 50% unless the user explicitly requested a full rewrite.

## Output contract

- Executive summary: decision-facing conclusion and 3-5 takeaways.
- Evidence ledger or evidence notes: enough provenance for key claims.
- Main report: facts, analysis, recommendations, and open risks separated clearly.
- Critical review: conflicts, weak evidence, assumptions, and what would change the conclusion.
- Confidence: High only when evidence, double-check/triple-check rules, logic review, and polishing guard all pass.
