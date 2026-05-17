import { describe, expect, it } from "vitest";
import {
  autonomyProtocolKey,
  completeAutonomyProtocol,
  createAutonomyProtocol,
  markProtocolSuperseded,
  markProtocolToolBlocked,
  markProtocolToolSatisfied,
  missingRequiredTools,
  pruneAutonomyProtocols,
  protocolReadyForCompletion,
  summarizeAutonomyProtocol,
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
    expect(protocol.taskStatus).toBe("active");
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

  it("marks protocols completed and hides them from active summaries", () => {
    const protocol = createAutonomyProtocol({
      kind: "micro-coding",
      sessionId: "s1",
      cwd: "/repo",
      prompt: "README 오타 고쳐줘",
      requiredTools: ["structural_gate"],
      reason: "micro coding",
      now: new Date("2026-05-17T00:00:00.000Z"),
    });

    const completed = completeAutonomyProtocol(protocol, new Date("2026-05-17T00:00:02.000Z"));

    expect(completed.taskStatus).toBe("completed");
    expect(completed.completedAt).toBe("2026-05-17T00:00:02.000Z");
    expect(summarizeAutonomyProtocol(completed).protocol).toBe("none");
  });

  it("marks incompatible active protocols superseded for audit", () => {
    const protocol = createAutonomyProtocol({
      kind: "parallel-work",
      sessionId: "s1",
      cwd: "/repo",
      prompt: "병렬로 구현해줘",
      requiredTools: ["spec_gate"],
      reason: "parallel",
      now: new Date("2026-05-17T00:00:00.000Z"),
    });

    const superseded = markProtocolSuperseded(protocol, "single-branch-2", new Date("2026-05-17T00:00:03.000Z"));

    expect(superseded.taskStatus).toBe("superseded");
    expect(superseded.supersededBy).toBe("single-branch-2");
    expect(superseded.supersededAt).toBe("2026-05-17T00:00:03.000Z");
  });

  it("prunes old completed and superseded protocol audit entries but keeps active ones", () => {
    const protocols = Object.fromEntries(Array.from({ length: 4 }, (_, index) => {
      const protocol = completeAutonomyProtocol(createAutonomyProtocol({
        kind: "micro-coding",
        sessionId: "s1",
        cwd: "/repo",
        prompt: `오타 ${index}`,
        requiredTools: ["structural_gate"],
        reason: "micro",
        now: new Date(`2026-05-17T00:00:0${index}.000Z`),
      }), new Date(`2026-05-17T00:00:1${index}.000Z`));
      return [`archive-${index}`, protocol];
    }));
    const active = createAutonomyProtocol({ kind: "coding", sessionId: "s1", cwd: "/repo", prompt: "구현해줘", requiredTools: ["spec_gate"], reason: "coding" });

    const pruned = pruneAutonomyProtocols({ ...protocols, active }, 2);

    expect(Object.keys(pruned).sort()).toEqual(["active", "archive-2", "archive-3"]);
  });
});
