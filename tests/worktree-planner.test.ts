import { describe, expect, it } from "vitest";
import { planSessionWorktree } from "../extensions/ddotz-autopilot/worktree-planner";

describe("session worktree planner", () => {
  it("plans isolated global worktree paths and branch names from repo, session, and task", () => {
    const plan = planSessionWorktree({
      repoRoot: "/Users/hyuns/code/ddotz-pi",
      sessionId: "abc123",
      taskName: "멀티 세션 todo 격리",
      homeDir: "/Users/hyuns",
    });

    expect(plan.projectName).toBe("ddotz-pi");
    expect(plan.branchName).toBe("session/abc123/multi-session-todo");
    expect(plan.path).toBe("/Users/hyuns/.config/superpowers/worktrees/ddotz-pi/abc123-multi-session-todo");
  });
});
