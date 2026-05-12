import { describe, expect, it } from "vitest";
import { buildModeResourcePolicy } from "../extensions/ddotz-autopilot/mode-resource-policy";
import { buildAutopilotSystemPrompt } from "../extensions/ddotz-autopilot/policy";
import { inferPlannedWorkMode, parseWorkMode } from "../extensions/ddotz-autopilot/mode";

function promptForDesignMode(): string {
  return buildAutopilotSystemPrompt({
    workMode: "design",
    executionIntensity: "standard",
    cwd: "/repo",
  });
}

describe("design mode", () => {
  it("parses and infers design mode from design/UI/UX requests", () => {
    expect(parseWorkMode("design")).toBe("design");
    expect(parseWorkMode("ui")).toBe("design");
    expect(parseWorkMode("ux")).toBe("design");
    expect(inferPlannedWorkMode("랜딩페이지 디자인 방향 잡아줘")).toBe("design");
    expect(inferPlannedWorkMode("UI/UX 개선안 만들어줘")).toBe("design");
  });

  it("adds design guidance only in design mode", () => {
    const defaultPrompt = buildAutopilotSystemPrompt({ workMode: "default", executionIntensity: "standard", cwd: "/repo" });
    const designPrompt = promptForDesignMode();

    expect(defaultPrompt).not.toContain("### Design Mode");
    expect(designPrompt).toContain("### Design Mode");
    expect(designPrompt).toContain("Mode isolation: this section applies only while Work mode is design");
    expect(designPrompt).toContain("Design brief before pixels or code");
    expect(designPrompt).toContain("gstack QA");
    expect(designPrompt).toContain("Confidence: High");
  });

  it("returns mode-scoped design resources without changing default policy", () => {
    expect(buildModeResourcePolicy("default")).toEqual({
      mode: "default",
      skills: [],
      extensionGuidance: [],
      toolPriority: [],
      processPriorities: [],
    });

    const policy = buildModeResourcePolicy("design");
    expect(policy.mode).toBe("design");
    expect(policy.skills).toContain("frontend-ui-ux");
    expect(policy.skills).toContain("taste-skill");
    expect(policy.skills).toContain("web-design-guidelines");
    expect(policy.skills).toContain("gstack");
    expect(policy.extensionGuidance).toContain("Use design mode guidance only while design mode is active; do not leak aesthetic defaults into default mode.");
    expect(policy.toolPriority).toContain("design brief before pixels or code");
    expect(policy.processPriorities).toContain("specific visual direction before generic modern/clean defaults");
  });
});
