import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export const REPORT_RESEARCH_GATE_TOOL_NAME = "report_research_gate";

export type ReportResearchRetrievalMethod = "web" | "insane-search" | "direct-url" | "github" | "archive" | "manual";
export type ReportResearchAccessQuality = "full-text" | "partial" | "metadata" | "blocked" | "inferred";
export type ReportResearchRelevance = "high" | "medium" | "low";
export type ReportResearchConfidence = "high" | "medium" | "low";
export type ReportResearchSourceType = "primary" | "official" | "data" | "expert" | "secondary" | "community" | "unknown";

export interface ReportResearchGateInput {
  objective: string;
  audience?: string;
  decisionContext?: string;
  userMaterials: Array<{
    label: string;
    reference: string;
    usedClaims: string[];
  }>;
  externalSources: Array<{
    url: string;
    title?: string;
    publisher?: string;
    author?: string;
    publishedAt?: string;
    updatedAt?: string;
    retrievedAt: string;
    retrievalMethod: ReportResearchRetrievalMethod;
    accessQuality: ReportResearchAccessQuality;
    relevance: ReportResearchRelevance;
    confidence: ReportResearchConfidence;
    sourceType: ReportResearchSourceType;
    usedClaims: string[];
  }>;
  conflicts: string[];
  evidenceGaps: string[];
  sourceConfidenceReview: string;
  noExternalResearchReason?: string;
}

export interface ReportResearchGateResult {
  ok: boolean;
  externalResearchRequired: boolean;
  externalResearchSkipped: boolean;
  sourceCount: number;
  highConfidenceSourceCount: number;
  mediumConfidenceSourceCount: number;
  lowConfidenceSourceCount: number;
  blockers: string[];
  warnings: string[];
  evidenceSummary: string;
}

const ReportResearchGateInputSchema = Type.Object({
  objective: Type.String(),
  audience: Type.Optional(Type.String()),
  decisionContext: Type.Optional(Type.String()),
  userMaterials: Type.Array(Type.Object({
    label: Type.String(),
    reference: Type.String(),
    usedClaims: Type.Array(Type.String()),
  })),
  externalSources: Type.Array(Type.Object({
    url: Type.String(),
    title: Type.Optional(Type.String()),
    publisher: Type.Optional(Type.String()),
    author: Type.Optional(Type.String()),
    publishedAt: Type.Optional(Type.String()),
    updatedAt: Type.Optional(Type.String()),
    retrievedAt: Type.String(),
    retrievalMethod: Type.Union([
      Type.Literal("web"),
      Type.Literal("insane-search"),
      Type.Literal("direct-url"),
      Type.Literal("github"),
      Type.Literal("archive"),
      Type.Literal("manual"),
    ]),
    accessQuality: Type.Union([
      Type.Literal("full-text"),
      Type.Literal("partial"),
      Type.Literal("metadata"),
      Type.Literal("blocked"),
      Type.Literal("inferred"),
    ]),
    relevance: Type.Union([Type.Literal("high"), Type.Literal("medium"), Type.Literal("low")]),
    confidence: Type.Union([Type.Literal("high"), Type.Literal("medium"), Type.Literal("low")]),
    sourceType: Type.Union([
      Type.Literal("primary"),
      Type.Literal("official"),
      Type.Literal("data"),
      Type.Literal("expert"),
      Type.Literal("secondary"),
      Type.Literal("community"),
      Type.Literal("unknown"),
    ]),
    usedClaims: Type.Array(Type.String()),
  })),
  conflicts: Type.Array(Type.String()),
  evidenceGaps: Type.Array(Type.String()),
  sourceConfidenceReview: Type.String(),
  noExternalResearchReason: Type.Optional(Type.String()),
});

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function countByConfidence(input: ReportResearchGateInput, confidence: ReportResearchConfidence): number {
  return Array.isArray(input.externalSources)
    ? input.externalSources.filter((source) => source.confidence === confidence).length
    : 0;
}

function validateSourceShape(input: ReportResearchGateInput, blockers: string[], warnings: string[]): void {
  if (!Array.isArray(input.externalSources)) {
    blockers.push("externalSources field is required and must be an array.");
    return;
  }

  input.externalSources.forEach((source, index) => {
    const label = `externalSources[${index}]`;
    if (!nonEmpty(source.url)) blockers.push(`${label}.url is required.`);
    if (!nonEmpty(source.retrievedAt)) blockers.push(`${label}.retrievedAt is required.`);
    if (!Array.isArray(source.usedClaims) || source.usedClaims.length === 0) blockers.push(`${label}.usedClaims must include at least one used claim.`);
    if (source.accessQuality === "blocked" || source.accessQuality === "inferred") warnings.push(`${label} has weak access quality: ${source.accessQuality}.`);
    if (source.relevance === "low") warnings.push(`${label} has low relevance.`);
    if (source.sourceType === "unknown") warnings.push(`${label} sourceType is unknown.`);
  });
}

export function runReportResearchGate(input: ReportResearchGateInput): ReportResearchGateResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!nonEmpty(input.objective)) blockers.push("objective is required.");
  if (!Array.isArray(input.userMaterials)) blockers.push("userMaterials field is required and must be an array.");
  if (!Array.isArray(input.conflicts)) blockers.push("conflicts field is required and must be an array, even when empty.");
  if (!Array.isArray(input.evidenceGaps)) blockers.push("evidenceGaps field is required and must be an array, even when empty.");

  validateSourceShape(input, blockers, warnings);

  const externalResearchSkipped = nonEmpty(input.noExternalResearchReason);
  const externalResearchRequired = !externalResearchSkipped;
  const sourceCount = Array.isArray(input.externalSources) ? input.externalSources.length : 0;
  const highConfidenceSourceCount = countByConfidence(input, "high");
  const mediumConfidenceSourceCount = countByConfidence(input, "medium");
  const lowConfidenceSourceCount = countByConfidence(input, "low");

  if (externalResearchRequired) {
    if (sourceCount < 2) blockers.push("at least 2 external sources are required unless noExternalResearchReason is provided.");
    if (!nonEmpty(input.sourceConfidenceReview)) blockers.push("sourceConfidenceReview is required when external research is performed.");
    if (sourceCount > 0 && highConfidenceSourceCount + mediumConfidenceSourceCount === 0) {
      blockers.push("all external sources are low confidence; add stronger sources or mark the evidence gap instead.");
    }
  } else {
    warnings.push("external research skipped by explicit user boundary or active scope decision; broad/current-fact High confidence should not be used.");
  }

  const ok = blockers.length === 0;
  const evidenceSummary = externalResearchSkipped
    ? `external research skipped: ${input.noExternalResearchReason}`
    : `${sourceCount} external sources recorded (${highConfidenceSourceCount} high, ${mediumConfidenceSourceCount} medium, ${lowConfidenceSourceCount} low); conflicts: ${Array.isArray(input.conflicts) ? input.conflicts.length : "missing"}; evidence gaps: ${Array.isArray(input.evidenceGaps) ? input.evidenceGaps.length : "missing"}`;

  return {
    ok,
    externalResearchRequired,
    externalResearchSkipped,
    sourceCount,
    highConfidenceSourceCount,
    mediumConfidenceSourceCount,
    lowConfidenceSourceCount,
    blockers,
    warnings,
    evidenceSummary,
  };
}

export function formatReportResearchGateResult(result: ReportResearchGateResult): string {
  const lines = [`report_research_gate: ${result.ok ? "passed" : "blocked"}`];
  lines.push(`externalResearchRequired: ${result.externalResearchRequired ? "yes" : "no"}`);
  lines.push(`externalResearchSkipped: ${result.externalResearchSkipped ? "yes" : "no"}`);
  lines.push(`sourceCount: ${result.sourceCount}`);
  lines.push(`sourceConfidence: high=${result.highConfidenceSourceCount}, medium=${result.mediumConfidenceSourceCount}, low=${result.lowConfidenceSourceCount}`);
  lines.push(`evidenceSummary: ${result.evidenceSummary}`);
  if (result.warnings.length > 0) lines.push("warnings:", ...result.warnings.map((warning) => `- ${warning}`));
  if (result.blockers.length > 0) lines.push("blockers:", ...result.blockers.map((blocker) => `- ${blocker}`));
  return lines.join("\n");
}

export function registerReportResearchGateTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: REPORT_RESEARCH_GATE_TOOL_NAME,
    label: "Report research gate",
    description: "Record report evidence ledger, external source provenance, source confidence review, conflicts, and evidence gaps before report synthesis.",
    promptSnippet: "report_research_gate: record report evidence ledger and source confidence before evidence-led report completion.",
    promptGuidelines: [
      "Use report_research_gate after web-analysis source collection and before final report synthesis.",
      "When the user explicitly forbids external research, call report_research_gate with noExternalResearchReason and the user-material evidence boundary.",
      "Do not claim Confidence: High for no-external-research reports or reports without 2+ relevant provenance items and source confidence review.",
    ],
    parameters: ReportResearchGateInputSchema,
    async execute(_toolCallId, params) {
      const result = runReportResearchGate(params as ReportResearchGateInput);
      return {
        content: [{ type: "text", text: formatReportResearchGateResult(result) }],
        details: { result },
      };
    },
  });
}
