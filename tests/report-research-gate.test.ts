import { describe, expect, it } from "vitest";
import chocoAutopilot from "../extensions/choco-autopilot/index";
import { runReportResearchGate, type ReportResearchGateInput } from "../extensions/choco-autopilot/report-research-gate";
import { createPiExtensionFixture } from "./helpers/pi-extension-fixture";

const sourceA: ReportResearchGateInput["externalSources"][number] = {
  url: "https://example.com/primary",
  title: "Primary market data",
  publisher: "Example Authority",
  publishedAt: "2026-05-01",
  retrievedAt: "2026-05-19T00:00:00.000Z",
  retrievalMethod: "web",
  accessQuality: "full-text",
  relevance: "high",
  confidence: "high",
  sourceType: "official",
  usedClaims: ["The market is expanding."],
};

const sourceB: ReportResearchGateInput["externalSources"][number] = {
  url: "https://example.org/data",
  title: "Independent data table",
  publisher: "Example Data Lab",
  updatedAt: "2026-05-10",
  retrievedAt: "2026-05-19T00:00:00.000Z",
  retrievalMethod: "direct-url",
  accessQuality: "full-text",
  relevance: "high",
  confidence: "medium",
  sourceType: "data",
  usedClaims: ["Entrants face distribution constraints."],
};

function input(overrides: Partial<ReportResearchGateInput> = {}): ReportResearchGateInput {
  return {
    objective: "AI search market entry report",
    audience: "C-level",
    decisionContext: "Market entry decision",
    userMaterials: [
      {
        label: "User brief",
        reference: "prompt",
        usedClaims: ["User wants a market entry strategy report."],
      },
    ],
    externalSources: [sourceA, sourceB],
    conflicts: [],
    evidenceGaps: ["Vendor revenue split is not disclosed."],
    sourceConfidenceReview: "Two independent sources were reviewed for relevance, authority, access quality, and recency.",
    ...overrides,
  };
}

describe("report_research_gate", () => {
  it("registers report_research_gate as a Pi-native tool", () => {
    const { tools } = createPiExtensionFixture(chocoAutopilot);
    expect(tools.has("report_research_gate")).toBe(true);
  });

  it("passes when two external sources and a source confidence review are present", () => {
    const result = runReportResearchGate(input());

    expect(result.ok).toBe(true);
    expect(result.externalResearchRequired).toBe(true);
    expect(result.externalResearchSkipped).toBe(false);
    expect(result.sourceCount).toBe(2);
    expect(result.highConfidenceSourceCount).toBe(1);
    expect(result.mediumConfidenceSourceCount).toBe(1);
    expect(result.blockers).toEqual([]);
  });

  it("blocks when external research is required but no external sources are recorded", () => {
    const result = runReportResearchGate(input({ externalSources: [] }));

    expect(result.ok).toBe(false);
    expect(result.externalResearchRequired).toBe(true);
    expect(result.blockers.join("\n")).toContain("at least 2 external sources");
  });

  it("passes skipped external research only when a noExternalResearchReason is recorded", () => {
    const result = runReportResearchGate(input({ externalSources: [], noExternalResearchReason: "User explicitly requested attached materials only." }));

    expect(result.ok).toBe(true);
    expect(result.externalResearchRequired).toBe(false);
    expect(result.externalResearchSkipped).toBe(true);
    expect(result.sourceCount).toBe(0);
    expect(result.evidenceSummary).toContain("external research skipped");
  });

  it("blocks when every external source is low confidence", () => {
    const result = runReportResearchGate(input({
      externalSources: [
        { ...sourceA, confidence: "low", sourceType: "community" },
        { ...sourceB, confidence: "low", sourceType: "unknown" },
      ],
    }));

    expect(result.ok).toBe(false);
    expect(result.lowConfidenceSourceCount).toBe(2);
    expect(result.blockers.join("\n")).toContain("low confidence");
  });

  it("blocks when sourceConfidenceReview is missing", () => {
    const result = runReportResearchGate(input({ sourceConfidenceReview: "" }));

    expect(result.ok).toBe(false);
    expect(result.blockers.join("\n")).toContain("sourceConfidenceReview");
  });

  it("blocks when conflicts or evidenceGaps fields are omitted", () => {
    const missingConflicts = runReportResearchGate({ ...input(), conflicts: undefined } as unknown as ReportResearchGateInput);
    const missingGaps = runReportResearchGate({ ...input(), evidenceGaps: undefined } as unknown as ReportResearchGateInput);

    expect(missingConflicts.ok).toBe(false);
    expect(missingConflicts.blockers.join("\n")).toContain("conflicts");
    expect(missingGaps.ok).toBe(false);
    expect(missingGaps.blockers.join("\n")).toContain("evidenceGaps");
  });
});
