import { describe, expect, it } from "vitest";
import { buildAutopilotSystemPrompt } from "../extensions/choco-autopilot/policy";
import { createAutonomyProtocol } from "../extensions/choco-autopilot/autonomy-protocol";

describe("autonomy protocol prompt injection", () => {
  it("injects required branch guard for single-branch protocol", () => {
    const protocol = createAutonomyProtocol({
      kind: "single-branch",
      sessionId: "s1",
      cwd: "/repo",
      prompt: "feature/foo 브랜치에서 고쳐줘",
      requiredTools: ["branch_switch_guard", "structural_gate"],
      reason: "branch intent",
    });

    const prompt = buildAutopilotSystemPrompt({ workMode: "default", executionIntensity: "standard", cwd: "/repo", autonomyProtocol: protocol });

    expect(prompt).toContain("Autonomous Protocol for This Turn");
    expect(prompt).toContain("Protocol: single-branch");
    expect(prompt).toContain("branch_switch_guard");
    expect(prompt).toContain("Do not claim completion until all required tools are satisfied");
  });

  it("injects full required sequence for parallel protocol", () => {
    const protocol = createAutonomyProtocol({
      kind: "parallel-work",
      sessionId: "s1",
      cwd: "/repo",
      prompt: "병렬로 나눠서 구현해줘",
      requiredTools: ["spec_gate", "parallel_work_plan", "agent_orchestrator", "worktree_manage", "integration_verifier", "structural_gate"],
      reason: "parallel intent",
    });

    const prompt = buildAutopilotSystemPrompt({ workMode: "default", executionIntensity: "standard", cwd: "/repo", autonomyProtocol: protocol });

    expect(prompt).toContain("Protocol: parallel-work");
    expect(prompt).toContain("- spec_gate");
    expect(prompt).toContain("- parallel_work_plan");
    expect(prompt).toContain("- agent_orchestrator");
    expect(prompt).toContain("- worktree_manage");
    expect(prompt).toContain("- integration_verifier");
  });

  it("injects approval boundary stop rule", () => {
    const protocol = createAutonomyProtocol({
      kind: "approval-boundary",
      sessionId: "s1",
      cwd: "/repo",
      prompt: "npm publish까지 해줘",
      requiredTools: [],
      hardBoundary: "deployment",
      reason: "publish boundary",
    });

    const prompt = buildAutopilotSystemPrompt({ workMode: "default", executionIntensity: "standard", cwd: "/repo", autonomyProtocol: protocol });

    expect(prompt).toContain("Protocol: approval-boundary");
    expect(prompt).toContain("Hard boundary: deployment");
    expect(prompt).toContain("Stop before the hard boundary");
  });

  it("omits the section for none protocol", () => {
    const protocol = createAutonomyProtocol({ kind: "none", sessionId: "s1", cwd: "/repo", prompt: "설명해줘", requiredTools: [], reason: "question" });

    const prompt = buildAutopilotSystemPrompt({ workMode: "default", executionIntensity: "standard", cwd: "/repo", autonomyProtocol: protocol });

    expect(prompt).not.toContain("Autonomous Protocol for This Turn");
  });
});
