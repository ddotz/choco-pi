import { buildModeResourcePolicy, formatModeResourcePolicy } from "./mode-resource-policy";

export function buildReportModeGuidance(): string {
  const resourcePolicy = formatModeResourcePolicy(buildModeResourcePolicy("report"));

  return [
    "### Report Mode",
    "Mode isolation: this section applies only while Work mode is report. Do not apply this overlay in default mode.",
    "Use report mode for evidence-backed professional reports based on user materials plus external research.",
    "The output target is a concise C-level report, not a chatty article or generic research dump.",
    "",
    resourcePolicy,
    "",
    "#### Report gardening process",
    "1. Define the report objective, audience, decision context, required output format, and user-provided source material before drafting.",
    "2. Build a Report evidence ledger before synthesis. For every material claim, record claim text, source URL or user-material reference, publisher/owner, publication/update date when available, retrieval method, access quality, confidence, and whether it is fact, inference, recommendation, or open risk.",
    "3. No unsupported assumptions or unchecked citations. Do not cite a source unless the cited claim was actually checked. Do not invent statistics, dates, quotes, market facts, or source titles.",
    "4. Prefer primary and official sources. Use external research only after source collection; use insane-search routing for blocked, WAF-protected, Korean platform, GitHub, YouTube, Reddit, X/Twitter, Naver, Medium, Substack, Stack Overflow, Coupang, and LinkedIn sources.",
    "5. Confidence gate: High evidence can be used directly after provenance review; Medium evidence requires at least one independent double-check; Low evidence requires triple-check before use or must be marked as a gap/open risk.",
    "6. Run a logic gardening pass: map claim → evidence → inference → implication, then check conflicts, stale sources, single-source dependence, incentives, missing base rates, and unsupported causal jumps.",
    "7. Draft in C-level Korean report style: concise, decision-oriented, low-adjective, data-first, and direct. Keep each natural paragraph under 300 Korean characters unless preserving a direct quote or legal/technical excerpt requires otherwise.",
    "8. Apply Kami-derived layout constraints for final artifacts: warm parchment surface, ink-blue single accent, restrained serif-led hierarchy, compact executive summary, evidence notes, clear section breaks, and appendix/reference separation.",
    "9. Apply im-not-ai-derived polishing as a final pass: meaning-invariant edits only, span-grounded changes, preserve numbers/proper nouns/direct quotes, maintain professional report register, warn above 30% rewrite rate, and stop/rollback above 50% rewrite rate.",
    "",
    "#### Required report output contract",
    "- Executive summary: decision-facing conclusion and 3-5 takeaways.",
    "- Evidence ledger: enough provenance for every key claim; fold noisy detail when the final channel benefits from brevity.",
    "- Main report: facts, analysis, recommendations, and open risks separated clearly.",
    "- Critical review: conflicts, weak evidence, assumptions, and what would change the conclusion.",
    "- Confidence: High only when the evidence ledger, double-check/triple-check rules, logic review, and polishing guard all pass.",
  ].filter(Boolean).join("\n");
}
