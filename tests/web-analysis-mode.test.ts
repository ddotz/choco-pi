import { describe, expect, it } from "vitest";
import { buildAutopilotSystemPrompt } from "../extensions/ddotz-autopilot/policy";
import { buildModeResourcePolicy } from "../extensions/ddotz-autopilot/mode-resource-policy";

function promptFor(workMode: "default" | "web-analysis"): string {
  return buildAutopilotSystemPrompt({
    workMode,
    executionIntensity: "standard",
    cwd: "/repo",
  });
}

describe("web-analysis mode isolation", () => {
  it("does not leak web-analysis overlay into default mode", () => {
    const prompt = promptFor("default");

    expect(prompt).not.toContain("### Web Analysis Mode");
    expect(prompt).not.toContain("Retrieval-first external research pipeline");
    expect(prompt).not.toContain("Source confidence matrix");
    expect(prompt).not.toContain("Use fivetaku/insane-search as the primary retrieval playbook");
  });

  it("adds retrieval-first and critical-review guidance only in web-analysis mode", () => {
    const prompt = promptFor("web-analysis");

    expect(prompt).toContain("### Web Analysis Mode");
    expect(prompt).toContain("Mode isolation: this section applies only while Work mode is web-analysis");
    expect(prompt).toContain("Retrieval-first external research pipeline");
    expect(prompt).toContain("Use fivetaku/insane-search as the primary retrieval playbook");
    expect(prompt).toContain("Source confidence matrix");
    expect(prompt).toContain("Critical review pass");
    expect(prompt).toContain("Do not apply this overlay in default mode");
  });

  it("returns empty resource policy for default and web resources for web-analysis", () => {
    expect(buildModeResourcePolicy("default")).toEqual({
      mode: "default",
      skills: [],
      extensionGuidance: [],
      toolPriority: [],
      processPriorities: [],
    });

    const policy = buildModeResourcePolicy("web-analysis");
    expect(policy.mode).toBe("web-analysis");
    expect(policy.skills).toContain("insane-search");
    expect(policy.extensionGuidance).toContain("Use external fivetaku/insane-search; do not vendor it into ddotz-pi.");
    expect(policy.toolPriority[0]).toBe("external retrieval before synthesis");
    expect(policy.processPriorities).toContain("critical review before final answer");
  });

  it("does not share mutable web-analysis resource policy arrays across calls", () => {
    const policy = buildModeResourcePolicy("web-analysis");
    policy.skills.push("mutated-skill");
    policy.extensionGuidance.length = 0;

    const fresh = buildModeResourcePolicy("web-analysis");
    expect(fresh.skills).toEqual(["insane-search"]);
    expect(fresh.extensionGuidance).toContain("Use external fivetaku/insane-search; do not vendor it into ddotz-pi.");
  });

  it("documents guardrail conditions for High confidence without adding service UX", () => {
    const prompt = promptFor("web-analysis");

    expect(prompt).toContain("at least two relevant provenance items");
    expect(prompt).toContain("If the answer lacks enough sources");
    expect(prompt).not.toContain("source explorer UI");
    expect(prompt).not.toContain("saved research");
  });
});
