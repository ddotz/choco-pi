import { readFileSync } from "node:fs";
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
    expect(defaultPrompt).not.toContain("Artifact-track routing");
    expect(defaultPrompt).not.toContain("word-break: keep-all");
    expect(designPrompt).toContain("### Design Mode");
    expect(designPrompt).toContain("Mode isolation: this section applies only while Work mode is design");
    expect(designPrompt).toContain("Artifact-track routing");
    expect(designPrompt).toContain("Mobile web");
    expect(designPrompt).toContain("Mobile app");
    expect(designPrompt).toContain("Desktop web");
    expect(designPrompt).toContain("Desktop app");
    expect(designPrompt).toContain("Presentation slides");
    expect(designPrompt).toContain("Design brief before pixels or code");
    expect(designPrompt).toContain("AI slop");
    expect(designPrompt).toContain("Pretendard");
    expect(designPrompt).toContain("word-break: keep-all");
    expect(designPrompt).toContain("text-wrap: balance");
    expect(designPrompt).toContain("leading-none");
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
    expect(policy.skills).toContain("taste-ko");
    expect(policy.skills).toContain("taste-redesign");
    expect(policy.skills).toContain("web-design-guidelines");
    expect(policy.skills).toContain("gstack");
    expect(policy.skills).toContain("slides-grab");
    expect(policy.skills).toContain("frontend-slides");
    expect(policy.extensionGuidance).toContain("Use design mode guidance only while design mode is active; do not leak aesthetic defaults into default mode.");
    expect(policy.extensionGuidance).toContain("Apply taste-ko only as design-mode Korean typography/copy guidance; do not force standalone HTML or landing-page defaults when the project stack or artifact track differs.");
    expect(policy.toolPriority).toContain("artifact-track classification before visual direction");
    expect(policy.toolPriority).toContain("design brief before pixels or code");
    expect(policy.toolPriority).toContain("Korean line-break and typography QA before visual polish");
    expect(policy.processPriorities).toContain("anti-slop specificity before generic modern/clean defaults");
  });

  it("keeps the design mode documentation aligned with artifact tracks and Korean typography", () => {
    const modeDoc = readFileSync(new URL("../modes/design/MODE.md", import.meta.url), "utf8");

    expect(modeDoc).toContain("Artifact-track routing");
    expect(modeDoc).toContain("Mobile web");
    expect(modeDoc).toContain("Desktop app");
    expect(modeDoc).toContain("Presentation slides");
    expect(modeDoc).toContain("word-break: keep-all");
    expect(modeDoc).toContain("text-wrap: balance");
    expect(modeDoc).toContain("Pretendard");
  });
});
