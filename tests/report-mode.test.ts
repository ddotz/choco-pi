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

describe("report mode isolation", () => {
  it("does not leak report overlay into default mode", () => {
    const prompt = promptFor("default");

    expect(prompt).not.toContain("### Report Mode");
    expect(prompt).not.toContain("Report evidence ledger");
    expect(prompt).not.toContain("Kami-derived layout");
    expect(prompt).not.toContain("im-not-ai-derived polishing");
  });

  it("adds evidence, layout, polishing, and confidence guardrails only in report mode", () => {
    const prompt = promptFor("report");

    expect(prompt).toContain("### Report Mode");
    expect(prompt).toContain("Mode isolation: this section applies only while Work mode is report");
    expect(prompt).toContain("Report evidence ledger");
    expect(prompt).toContain("No unsupported assumptions or unchecked citations");
    expect(prompt).toContain("double-check");
    expect(prompt).toContain("triple-check");
    expect(prompt).toContain("C-level");
    expect(prompt).toContain("300 Korean characters");
    expect(prompt).toContain("Kami-derived layout");
    expect(prompt).toContain("im-not-ai-derived polishing");
    expect(prompt).toContain("meaning-invariant");
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
    expect(policy.processPriorities).toContain("factual confidence before narrative polish");
  });
});
