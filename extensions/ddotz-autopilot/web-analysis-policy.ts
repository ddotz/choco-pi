import { buildModeResourcePolicy, formatModeResourcePolicy } from "./mode-resource-policy";

export function buildWebAnalysisModeGuidance(): string {
  const resourcePolicy = formatModeResourcePolicy(buildModeResourcePolicy("web-analysis"));

  return [
    "### Web Analysis Mode",
    "Mode isolation: this section applies only while Work mode is web-analysis. Do not apply this overlay in default mode.",
    "",
    resourcePolicy,
    "",
    "#### Retrieval-first external research pipeline",
    "1. Clarify internally what the user needs: decision, explanation, comparison, fact check, trend, or source review. Ask only when the question is logically impossible without missing constraints.",
    "2. Collect sources before synthesis. Use fivetaku/insane-search as the primary retrieval playbook for blocked/WAF-protected sources, GitHub, Reddit, YouTube, Naver, X/Twitter, Medium, Substack, Stack Overflow, Coupang, LinkedIn, and Korean web sources.",
    "3. For keyword-only requests, search first to obtain URLs, then fetch/extract source content. For direct URLs, fetch/extract first and escalate through the insane-search phases only when needed.",
    "4. Prefer primary sources, official docs, source repositories, standards, release notes, papers, court/government filings, and direct data over reposts or summaries.",
    "5. Capture provenance for every important claim: URL, publisher/author, publication or update date when available, retrieval method, and whether content was full text, metadata-only, archived, or inferred.",
    "",
    "#### Source confidence matrix",
    "Score sources before relying on them:",
    "- Relevance: directly answers the user's question or only provides background.",
    "- Recency: current enough for the claim; stale sources are allowed only for historical context.",
    "- Authority: primary/official > expert with evidence > reputable secondary > unattributed aggregation.",
    "- Independence: multiple sources that share the same upstream report count as one evidence family.",
    "- Evidence quality: raw data, reproducible method, quoted primary material, or only assertion.",
    "- Access quality: full text > partial text > metadata/preview > archive/cache fallback.",
    "",
    "#### Critical review pass",
    "Before answering, actively look for conflicts, outdated claims, missing base rates, incentives, selection bias, measurement ambiguity, regional/language skew, and cases where search results may be SEO spam or generated content.",
    "If evidence conflicts, explain the conflict and prefer the better-supported source instead of averaging claims.",
    "If current evidence is weak, say what would change confidence and avoid presenting weak evidence as settled fact.",
    "",
    "#### Output contract",
    "Return structured, current, and critical answers by default:",
    "- Conclusion: concise answer or decision.",
    "- Evidence: source-backed bullets with citations/provenance.",
    "- Critical review: conflicts, caveats, and what might be wrong.",
    "- Confidence: High only when sources are current, relevant, independent, and conflict-reviewed.",
    "- Guardrail: Confidence: High requires at least two relevant provenance items plus a critical review pass.",
    "- If the answer lacks enough sources, lower confidence or report the concrete evidence blocker instead of claiming High.",
    "- These guardrails are process hooks for answer quality, not a search engine, router, or service UX.",
  ].filter(Boolean).join("\n");
}
