import { describe, expect, it } from "vitest";
import { buildAutopilotSystemPrompt } from "../extensions/ddotz-autopilot/policy";
import { buildModeResourcePolicy } from "../extensions/ddotz-autopilot/mode-resource-policy";

function promptFor(workMode: "default" | "adoption-analysis"): string {
  return buildAutopilotSystemPrompt({
    workMode,
    executionIntensity: "standard",
    cwd: "/repo",
  });
}

describe("adoption-analysis mode isolation", () => {
  it("does not leak adoption-analysis overlay into default mode", () => {
    const prompt = promptFor("default");

    expect(prompt).not.toContain("### Adoption Analysis Mode");
    expect(prompt).not.toContain("Adoption depth");
    expect(prompt).not.toContain("license/security/source freshness");
  });

  it("adds decision, depth, fit, risk, tracking, and confidence contract only in adoption-analysis mode", () => {
    const prompt = promptFor("adoption-analysis");

    expect(prompt).toContain("### Adoption Analysis Mode");
    expect(prompt).toContain("Mode isolation: this section applies only while Work mode is adoption-analysis");
    expect(prompt).toContain("default already has baseline adoption capability");
    expect(prompt).toContain("Decision: adopt / partially adopt / reject / watch");
    expect(prompt).toContain("Adoption depth");
    expect(prompt).toContain("idea-only");
    expect(prompt).toContain("fork-or-vendor");
    expect(prompt).toContain("Fit review");
    expect(prompt).toContain("mode isolation");
    expect(prompt).toContain("Risk review");
    expect(prompt).toContain("license/security/source freshness");
    expect(prompt).toContain("Tracking decision");
    expect(prompt).toContain("Confidence");
  });

  it("returns mode-scoped resources for adoption-analysis without changing default policy", () => {
    expect(buildModeResourcePolicy("default")).toEqual({
      mode: "default",
      skills: [],
      extensionGuidance: [],
      toolPriority: [],
      processPriorities: [],
    });

    const policy = buildModeResourcePolicy("adoption-analysis");
    expect(policy.mode).toBe("adoption-analysis");
    expect(policy.skills).toContain("insane-search");
    expect(policy.toolPriority).toContain("adoption depth before implementation");
    expect(policy.processPriorities).toContain("smallest sufficient adoption depth before vendoring or dependency adoption");
  });
});
