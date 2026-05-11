import { describe, expect, it } from "vitest";
import { buildModeResourcePolicy } from "../extensions/ddotz-autopilot/mode-resource-policy";
import { buildAutopilotSystemPrompt } from "../extensions/ddotz-autopilot/policy";

function promptFor(workMode: "default" | "coding"): string {
  return buildAutopilotSystemPrompt({
    workMode,
    executionIntensity: "standard",
    cwd: "/repo",
  });
}

describe("coding mode isolation", () => {
  it("does not leak coding overlay into default mode", () => {
    const prompt = promptFor("default");

    expect(prompt).not.toContain("### Coding Mode");
    expect(prompt).not.toContain("Think Before Coding");
    expect(prompt).not.toContain("Simplicity First");
    expect(prompt).not.toContain("Coding quality guard");
  });

  it("adds tight implementation, TDD, debugging, simplicity, and verification guidance only in coding mode", () => {
    const prompt = promptFor("coding");

    expect(prompt).toContain("### Coding Mode");
    expect(prompt).toContain("Mode isolation: this section applies only while Work mode is coding");
    expect(prompt).toContain("Think Before Coding");
    expect(prompt).toContain("State assumptions explicitly");
    expect(prompt).toContain("Simplicity First");
    expect(prompt).toContain("Surgical Changes");
    expect(prompt).toContain("Goal-Driven Execution");
    expect(prompt).toContain("TDD-first");
    expect(prompt).toContain("systematic debugging");
    expect(prompt).toContain("RED");
    expect(prompt).toContain("GREEN");
    expect(prompt).toContain("version:check && pnpm run lint && pnpm run typecheck && pnpm run test");
    expect(prompt).toContain("gstack QA");
    expect(prompt).toContain("Coding quality guard");
  });

  it("returns mode-scoped resources for coding without changing default policy", () => {
    expect(buildModeResourcePolicy("default")).toEqual({
      mode: "default",
      skills: [],
      extensionGuidance: [],
      toolPriority: [],
      processPriorities: [],
    });

    const policy = buildModeResourcePolicy("coding");
    expect(policy.mode).toBe("coding");
    expect(policy.skills).toEqual(["test-driven-development", "systematic-debugging", "gstack"]);
    expect(policy.extensionGuidance).toContain("Use coding mode guidance only while coding is active; do not leak its strict output contract into default mode.");
    expect(policy.toolPriority).toContain("failing test before implementation for feature or bugfix work");
    expect(policy.processPriorities).toContain("simplicity and surgical diffs before abstraction");
  });
});
