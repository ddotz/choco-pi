import { buildModeResourcePolicy, formatModeResourcePolicy } from "./mode-resource-policy";

const REPORT_INTRO_LINES = [
  "Mode isolation: this section applies only while Work mode is report. Do not apply this overlay in default mode.",
  "Use report mode for evidence-backed professional reports based on user materials plus external research.",
  "The output target is a concise C-level report, not a chatty article or generic research dump.",
] as const;

const SECTION_FIRST_REPORT_ASSEMBLY = [
  "#### Section-first report assembly",
  "- Before writing body text, partition the report into parts and sections before drafting; each part must have a purpose, evidence need, and expected conclusion.",
  "- Section-only pass: draft each section, then review and improve each section in isolation before checking other sections. Tighten claim support, local logic, section-level wording, and numbers inside that section first.",
  "- Cross-section pass: after section-only quality is stable, cross-check consistency, logical structure, sentence flow, and numeric consistency across sections. Resolve duplicated claims, contradictory assumptions, timeline mismatches, and term drift before whole-report polish.",
  "- Whole-report pass: review the complete report once more through critique, checking executive summary alignment, conclusion support, narrative flow, evidence gaps, and reader decision value.",
  "- Formula-bound numbers must be calculated from the stated formula, not estimated. If a formula is available, show or retain the calculation basis in the ledger/notes and block completion when inputs are missing instead of guessing.",
] as const;

const REPORT_GARDENING_PROCESS = [
  "#### Report gardening process",
  "1. Define the report objective, audience, decision context, required output format, and user-provided source material before drafting.",
  "2. Build a Report evidence ledger before synthesis. For every material claim, record claim text, source URL or user-material reference, publisher/owner, publication/update date when available, retrieval method, access quality, confidence, and whether it is fact, inference, recommendation, or open risk.",
  "3. No unsupported assumptions or unchecked citations. Do not cite a source unless the cited claim was actually checked. Do not invent statistics, dates, quotes, market facts, or source titles.",
  "4. Prefer primary and official sources. Use external research only after source collection; use insane-search routing for blocked, WAF-protected, Korean platform, GitHub, YouTube, Reddit, X/Twitter, Naver, Medium, Substack, Stack Overflow, Coupang, and LinkedIn sources.",
  "5. Confidence gate: High evidence can be used directly after provenance review; Medium evidence requires at least one independent double-check; Low evidence requires triple-check before use or must be marked as a gap/open risk.",
  "6. Partition the report into parts and sections, then run section-only drafting and review in C-level Korean report style: concise, decision-oriented, low-adjective, data-first, and direct. Keep each natural paragraph under 300 Korean characters unless preserving a direct quote or legal/technical excerpt requires otherwise.",
  "7. Run a logic gardening pass inside each section: map claim → evidence → inference → implication, then check conflicts, stale sources, single-source dependence, incentives, missing base rates, unsupported causal jumps, and formula-bound calculations.",
  "8. Run the cross-section pass, then the whole-report pass, before final layout or polish. Numeric consistency is strict: reconcile tables, totals, percentages, dates, and formula outputs across sections.",
  "9. For artifact or design spec outputs, load/use the kami skill when available and apply Kami-derived layout constraints after evidence is stable. For plain chat/status answers, omit visual styling discussion.",
  "10. For generated report files, keep an MD source plus appendix or evidence sidecar, then run DOCX/PDF/HTML conversion only when requested and perform artifact QA before returning files.",
  "11. Apply im-not-ai-derived polishing as a final pass: meaning-invariant edits only, span-grounded changes, preserve numbers/proper nouns/direct quotes, maintain professional report register, warn above 30% rewrite rate, and stop/rollback above 50% rewrite rate.",
] as const;

const REQUIRED_REPORT_OUTPUT_CONTRACT = [
  "#### Required report output contract",
  "- Executive summary: decision-facing conclusion and 3-5 takeaways.",
  "- Evidence ledger: enough provenance for every key claim; fold noisy detail when the final channel benefits from brevity.",
  "- Main report: facts, analysis, recommendations, and open risks separated clearly.",
  "- Critical review: conflicts, weak evidence, assumptions, and what would change the conclusion.",
  "- File artifacts: when a report file is requested, preserve the MD source, keep evidence in an appendix or evidence sidecar, and report artifact QA evidence.",
  "- Confidence: High only when the evidence ledger, double-check/triple-check rules, logic review, and polishing guard all pass.",
] as const;

export function buildReportModeGuidance(): string {
  const resourcePolicy = formatModeResourcePolicy(buildModeResourcePolicy("report"));

  return [
    "### Report Mode",
    ...REPORT_INTRO_LINES,
    "",
    resourcePolicy,
    "",
    ...SECTION_FIRST_REPORT_ASSEMBLY,
    "",
    ...REPORT_GARDENING_PROCESS,
    "",
    ...REQUIRED_REPORT_OUTPUT_CONTRACT,
  ].filter(Boolean).join("\n");
}
