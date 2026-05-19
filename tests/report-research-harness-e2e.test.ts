import { describe, expect, it } from "vitest";
import { createAutonomyProtocol, markProtocolToolSatisfied, missingRequiredTools } from "../extensions/choco-autopilot/autonomy-protocol";
import { requiredToolsForProtocol, routeAutonomyProtocol } from "../extensions/choco-autopilot/autonomy-router";
import { inferPlannedWorkModes } from "../extensions/choco-autopilot/mode";
import { evaluateReportQuality } from "../extensions/choco-autopilot/report-quality";
import { runReportResearchGate, type ReportResearchGateInput } from "../extensions/choco-autopilot/report-research-gate";

const sourceBackedReport = [
  "## Executive summary",
  "시장 진입은 특정 세그먼트부터 검증하는 방식이 적절합니다.",
  "## Evidence ledger",
  "- External source: https://example.com/official | publisher: Example Authority | published: 2026-05-01 | retrieved: 2026-05-19 | access quality: full-text | relevance: high | source confidence: high | used claim: market expansion.",
  "- External source: https://example.org/data | publisher: Example Data Lab | updated: 2026-05-10 | retrieved: 2026-05-19 | access quality: full-text | relevance: high | source confidence: medium | used claim: distribution constraints.",
  "- Source confidence review: sources were scored by relevance, recency, authority, independence, evidence quality, and access quality; no unresolved conflict changed the recommendation.",
  "## Main report",
  "Facts, analysis, recommendations, and open risks are separated.",
  "## Critical review",
  "Revenue split remains an evidence gap; stale or vendor-only sources would lower confidence.",
  "## Confidence",
  "Confidence: High",
].join("\n");

const noExternalBoundaryReport = [
  "## Executive summary",
  "제공 자료 기준으로만 판단하면 내부 검증이 우선입니다.",
  "## Evidence ledger",
  "- Evidence boundary: user-provided materials only; external research explicitly forbidden by user.",
  "- User material: attached brief, retrieved from prompt, access quality: full-text, source confidence: medium, used claim: internal priorities.",
  "- Source confidence review: no external source confidence matrix was built because the user forbade external research; conclusions are bounded to supplied material.",
  "## Main report",
  "Facts, analysis, recommendations, and open risks are separated.",
  "## Critical review",
  "Current market claims are intentionally not made because external research was forbidden.",
  "## Confidence",
  "Confidence: Medium",
].join("\n");

const gateInput: ReportResearchGateInput = {
  objective: "Market entry strategy report",
  userMaterials: [{ label: "Prompt", reference: "user request", usedClaims: ["User wants a market entry strategy report."] }],
  externalSources: [
    {
      url: "https://example.com/official",
      publisher: "Example Authority",
      publishedAt: "2026-05-01",
      retrievedAt: "2026-05-19T00:00:00.000Z",
      retrievalMethod: "web",
      accessQuality: "full-text",
      relevance: "high",
      confidence: "high",
      sourceType: "official",
      usedClaims: ["market expansion"],
    },
    {
      url: "https://example.org/data",
      publisher: "Example Data Lab",
      updatedAt: "2026-05-10",
      retrievedAt: "2026-05-19T00:00:00.000Z",
      retrievalMethod: "direct-url",
      accessQuality: "full-text",
      relevance: "high",
      confidence: "medium",
      sourceType: "data",
      usedClaims: ["distribution constraints"],
    },
  ],
  conflicts: [],
  evidenceGaps: ["Revenue split remains unavailable."],
  sourceConfidenceReview: "Sources were scored by relevance, recency, authority, independence, evidence quality, and access quality.",
};

describe("report research harness E2E", () => {
  it("keeps a generic report in report mode while preserving report-research evidence boundary", () => {
    const prompt = "보고서 작성해줘";
    const route = routeAutonomyProtocol({ prompt, cwd: "/repo", sessionId: "s1", hasActiveManifest: false });
    const skipped = runReportResearchGate({
      ...gateInput,
      objective: "Generic report",
      externalSources: [],
      noExternalResearchReason: "Active scoping found no external/current-fact claims in the prompt; use user-provided materials only until evidence gaps require research.",
    });

    expect(inferPlannedWorkModes(prompt)).toEqual(["report"]);
    expect(route.protocolKind).toBe("report-research");
    expect(route.requiredTools).toEqual(["spec_gate", "report_research_gate", "structural_gate"]);
    expect(skipped.ok).toBe(true);
    expect(skipped.externalResearchSkipped).toBe(true);
  });

  it("routes a market/current-fact report through web-analysis -> report and report-research protocol", () => {
    const prompt = "시장 진입 전략 보고서 작성해줘";
    const route = routeAutonomyProtocol({ prompt, cwd: "/repo", sessionId: "s1", hasActiveManifest: false });
    let protocol = createAutonomyProtocol({ kind: route.protocolKind, sessionId: "s1", cwd: "/repo", prompt, requiredTools: route.requiredTools, reason: route.reason });

    expect(inferPlannedWorkModes(prompt)).toEqual(["web-analysis", "report"]);
    expect(route.protocolKind).toBe("report-research");
    expect(route.requiredTools).toEqual(["spec_gate", "report_research_gate", "structural_gate"]);
    expect(missingRequiredTools(protocol, { excludeTools: ["structural_gate"] })).toEqual(["spec_gate", "report_research_gate"]);

    protocol = markProtocolToolSatisfied(protocol, "spec_gate");
    protocol = markProtocolToolSatisfied(protocol, "report_research_gate");
    expect(missingRequiredTools(protocol, { excludeTools: ["structural_gate"] })).toEqual([]);
    expect(runReportResearchGate(gateInput).ok).toBe(true);
  });

  it("keeps no-external-research reports on a skipped gate boundary and blocks High confidence", () => {
    const prompt = "첨부 자료만 기반으로 보고서 작성해줘. 외부 리서치 하지 마.";
    const route = routeAutonomyProtocol({ prompt, cwd: "/repo", sessionId: "s1", hasActiveManifest: false });
    const gate = runReportResearchGate({ ...gateInput, externalSources: [], noExternalResearchReason: "User explicitly forbade external research." });
    const mediumQuality = evaluateReportQuality("report", noExternalBoundaryReport);
    const highQuality = evaluateReportQuality("report", noExternalBoundaryReport.replace("Confidence: Medium", "Confidence: High"));

    expect(inferPlannedWorkModes(prompt)).toEqual(["report"]);
    expect(route.protocolKind).toBe("report-research");
    expect(gate.ok).toBe(true);
    expect(gate.externalResearchSkipped).toBe(true);
    expect(mediumQuality.passed).toBe(true);
    expect(highQuality.issues).toContain("unsupported-high-confidence");
  });

  it("repairs a hollow report draft without provenance or source confidence review", () => {
    const hollow = [
      "## Executive summary",
      "진입을 권장합니다.",
      "## Evidence notes",
      "확인했습니다.",
      "## Main report",
      "분석 본문입니다.",
      "## Critical review",
      "한계가 없습니다.",
      "## Confidence",
      "Confidence: High",
    ].join("\n");

    const quality = evaluateReportQuality("report", hollow);

    expect(quality.passed).toBe(false);
    expect(quality.issues).toContain("missing-external-research");
    expect(quality.issues).toContain("missing-source-confidence-review");
    expect(quality.issues).toContain("unsupported-high-confidence");
  });

  it("passes a sufficient source-backed final report", () => {
    expect(requiredToolsForProtocol("report-research")).toEqual(["spec_gate", "report_research_gate", "structural_gate"]);
    expect(evaluateReportQuality("report", sourceBackedReport)).toMatchObject({ required: true, passed: true, issues: [] });
  });
});
