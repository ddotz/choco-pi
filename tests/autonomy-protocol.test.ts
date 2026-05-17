import { describe, expect, it } from "vitest";
import {
  autonomyProtocolKey,
  createAutonomyProtocol,
  markProtocolToolBlocked,
  markProtocolToolSatisfied,
  missingRequiredTools,
  protocolReadyForCompletion,
} from "../extensions/choco-autopilot/autonomy-protocol";

describe("autonomy protocol state model", () => {
  it("creates a durable protocol from a router decision", () => {
    const protocol = createAutonomyProtocol({
      kind: "single-branch",
      sessionId: "s1",
      cwd: "/repo",
      prompt: "feature/foo 브랜치에서 고쳐줘",
      requiredTools: ["branch_switch_guard", "structural_gate"],
      reason: "branch intent",
      now: new Date("2026-05-17T00:00:00.000Z"),
    });

    expect(protocol.version).toBe(1);
    expect(protocol.id).toContain("single-branch");
    expect(protocol.promptHash).toHaveLength(16);
    expect(protocol.requiredTools).toEqual(["branch_switch_guard", "structural_gate"]);
    expect(protocol.satisfiedTools).toEqual([]);
    expect(autonomyProtocolKey("/repo", "s1")).toBeTruthy();
  });

  it("marks required tools satisfied and decreases missing tools", () => {
    const protocol = createAutonomyProtocol({
      kind: "single-branch",
      sessionId: "s1",
      cwd: "/repo",
      prompt: "feature/foo 브랜치에서 고쳐줘",
      requiredTools: ["branch_switch_guard"],
      reason: "branch intent",
      now: new Date("2026-05-17T00:00:00.000Z"),
    });

    const satisfied = markProtocolToolSatisfied(protocol, "branch_switch_guard", "switched", new Date("2026-05-17T00:00:01.000Z"));

    expect(missingRequiredTools(satisfied)).toEqual([]);
    expect(satisfied.satisfiedTools).toEqual(["branch_switch_guard"]);
    expect(protocolReadyForCompletion(satisfied)).toBe(true);
  });

  it("marks blocked tools and prevents completion", () => {
    const protocol = createAutonomyProtocol({
      kind: "single-branch",
      sessionId: "s1",
      cwd: "/repo",
      prompt: "feature/foo 브랜치에서 고쳐줘",
      requiredTools: ["branch_switch_guard"],
      reason: "branch intent",
    });

    const blocked = markProtocolToolBlocked(protocol, "branch_switch_guard", "dirty cwd", new Date("2026-05-17T00:00:01.000Z"));

    expect(blocked.blockedTools).toContainEqual(expect.objectContaining({ toolName: "branch_switch_guard", reason: "dirty cwd" }));
    expect(protocolReadyForCompletion(blocked)).toBe(false);
  });

  it("excludes structural_gate from missing checks while the gate is being evaluated", () => {
    const protocol = createAutonomyProtocol({
      kind: "parallel-work",
      sessionId: "s1",
      cwd: "/repo",
      prompt: "병렬로 구현해줘",
      requiredTools: ["parallel_work_plan", "integration_verifier", "structural_gate"],
      reason: "parallel intent",
    });
    const partiallySatisfied = markProtocolToolSatisfied(markProtocolToolSatisfied(protocol, "parallel_work_plan"), "integration_verifier");

    expect(missingRequiredTools(partiallySatisfied)).toEqual(["structural_gate"]);
    expect(missingRequiredTools(partiallySatisfied, { excludeTools: ["structural_gate"] })).toEqual([]);
  });

  it("treats none protocols as ready and approval-boundary protocols as non-completable", () => {
    const none = createAutonomyProtocol({ kind: "none", sessionId: "s1", cwd: "/repo", prompt: "설명해줘", requiredTools: [], reason: "question" });
    const approval = createAutonomyProtocol({ kind: "approval-boundary", sessionId: "s1", cwd: "/repo", prompt: "npm publish", requiredTools: [], hardBoundary: "deployment", reason: "publish" });

    expect(protocolReadyForCompletion(none)).toBe(true);
    expect(protocolReadyForCompletion(approval)).toBe(false);
  });
});
