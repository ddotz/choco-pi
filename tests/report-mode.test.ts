import { describe, expect, it } from "vitest";
import { buildModeResourcePolicy } from "../extensions/ddotz-autopilot/mode-resource-policy";
import { buildAutopilotSystemPrompt } from "../extensions/ddotz-autopilot/policy";

function promptFor(workMode: "default" | "report"): string {
  return buildAutopilotSystemPrompt({
    workMode,
    executionIntensity: "standard",
    cwd: "/repo",
  });
}

function expectContainsAll(text: string, fragments: readonly string[]): void {
  for (const fragment of fragments) expect(text).toContain(fragment);
}

function expectContainsNone(text: string, fragments: readonly string[]): void {
  for (const fragment of fragments) expect(text).not.toContain(fragment);
}

describe("report mode isolation", () => {
  it("does not leak report overlay into default mode", () => {
    const prompt = promptFor("default");

    expectContainsNone(prompt, [
      "### Report Mode",
      "Report evidence ledger",
      "Section-only pass",
      "Formula-bound numbers",
      "Kami-derived layout",
      "im-not-ai-derived polishing",
    ]);
  });

  it("adds evidence, layout, polishing, and confidence guardrails only in report mode", () => {
    const prompt = promptFor("report");

    expectContainsAll(prompt, [
      "### Report Mode",
      "Mode isolation: this section applies only while Work mode is report",
      "Report evidence ledger",
      "No unsupported assumptions or unchecked citations",
      "double-check",
      "triple-check",
      "C-level",
      "300 Korean characters",
      "Kami-derived layout",
      "im-not-ai-derived polishing",
      "meaning-invariant",
    ]);
  });

  it("returns mode-scoped resources for report without changing default policy", () => {
    expect(buildModeResourcePolicy("default")).toEqual({
      mode: "default",
      skills: [],
      extensionGuidance: [],
      toolPriority: [],
      processPriorities: [],
    });

    const policy = buildModeResourcePolicy("report");
    expect(policy.mode).toBe("report");
    expect(policy.skills).toEqual(["insane-search", "kami"]);
    expect(policy.extensionGuidance).toContain("Use Kami-derived layout constraints for report artifacts; do not vendor upstream templates wholesale.");
    expect(policy.extensionGuidance).toContain("Use im-not-ai-derived Korean polishing rules as report-mode policy; do not depend on Claude-only agents or commands.");
    expect(policy.toolPriority).toContain("evidence ledger before synthesis");
    expect(policy.toolPriority).toContain("formula-based calculation before numeric estimation");
    expect(policy.processPriorities).toContain("factual confidence before narrative polish");
    expect(policy.processPriorities).toContain("section-only drafting before cross-section review before whole-report critique");
  });

  it("requires section-only, cross-section, and whole-report passes with strict numeric consistency", () => {
    const prompt = promptFor("report");

    expectContainsAll(prompt, [
      "Section-only pass",
      "Cross-section pass",
      "Whole-report pass",
      "partition the report into parts and sections before drafting",
      "review and improve each section in isolation before checking other sections",
      "cross-check consistency, logical structure, sentence flow, and numeric consistency across sections",
      "Formula-bound numbers must be calculated from the stated formula, not estimated",
    ]);
  });
});
