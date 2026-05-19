import { describe, expect, it } from "vitest";
import { repairPromptText } from "../extensions/choco-autopilot/structural-gate";

describe("structural gate autonomy repair prompts", () => {
  it("tells the agent which missing protocol tool to run next", () => {
    const prompt = repairPromptText("required autonomous protocol tools missing: integration_verifier", "초안");

    expect(prompt).toContain("Autonomous protocol repair required.");
    expect(prompt).toContain("Missing required tools:");
    expect(prompt).toContain("- integration_verifier");
    expect(prompt).toContain("Run integration_verifier for the active manifest");
    expect(prompt).toContain("rerun structural_gate");
  });

  it("includes the protocol kind when the external block reason provides it", () => {
    const prompt = repairPromptText("autonomous protocol parallel-work required tools missing: integration_verifier", "초안");

    expect(prompt).toContain("Protocol: parallel-work");
    expect(prompt).toContain("Missing required tools:");
    expect(prompt).toContain("- integration_verifier");
  });

  it("includes blocked protocol tool reasons and approval-boundary instructions", () => {
    const blocked = repairPromptText("autonomous protocol has blocked tools: branch_switch_guard (current cwd is dirty)", "");
    const approval = repairPromptText("approval-boundary protocol cannot complete before hard boundary: deployment", "");

    expect(blocked).toContain("Blocked protocol tools:");
    expect(blocked).toContain("branch_switch_guard (current cwd is dirty)");
    expect(blocked).toContain("report the blocker or repair the dirty cwd safely");
    expect(approval).toContain("readyToComplete=false");
    expect(approval).toContain("outcome=blocked");
  });
});
