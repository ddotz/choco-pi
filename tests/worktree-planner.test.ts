import { describe, expect, it } from "vitest";
import { formatParallelWorkPlan, planParallelWorkAreas, planSessionWorktree } from "../extensions/choco-autopilot/worktree-planner";

describe("session worktree planner", () => {
  it("plans isolated global worktree paths and branch names from repo, session, and task", () => {
    const plan = planSessionWorktree({
      repoRoot: "/Users/hyuns/code/choco-pi",
      sessionId: "abc123",
      taskName: "멀티 세션 todo 격리",
      homeDir: "/Users/hyuns",
    });

    expect(plan.projectName).toBe("choco-pi");
    expect(plan.branchName).toBe("session/abc123/multi-session-todo");
    expect(plan.path).toBe("/Users/hyuns/.config/superpowers/worktrees/choco-pi/abc123-multi-session-todo");
  });

  it("groups overlapping writable file and domain scopes into one serialized lane", () => {
    const plan = planParallelWorkAreas({
      items: [
        { id: "ui", description: "Implement the settings panel", files: ["./src/ui/settings.tsx"], domains: ["ui"] },
        { id: "api", description: "Implement settings API", files: ["src/api/settings.ts"], domains: ["api"] },
        { id: "ui-tests", description: "Update settings panel tests", files: ["src/ui/settings.tsx"], domains: ["ui"] },
      ],
    });

    expect(plan.lanes).toHaveLength(2);
    const uiLane = plan.lanes.find((lane) => lane.itemIds.includes("ui"));
    expect(uiLane?.itemIds).toEqual(expect.arrayContaining(["ui", "ui-tests"]));
    expect(uiLane?.serial).toBe(true);
    expect(plan.ownership.files["src/ui/settings.tsx"]).toBe(uiLane?.id);
    expect(plan.ownership.domains.ui).toBe(uiLane?.id);
    expect(plan.conflicts).toContainEqual({
      type: "file",
      scope: "src/ui/settings.tsx",
      itemIds: ["ui", "ui-tests"],
      resolution: "same-lane-serial",
    });
  });

  it("keeps dependent work out of the first parallel wave", () => {
    const plan = planParallelWorkAreas({
      items: [
        { id: "core", description: "Change runtime core", files: ["src/runtime/core.ts"], domains: ["runtime"] },
        { id: "docs", description: "Document runtime behavior", files: ["docs/runtime.md"], domains: ["docs"], dependsOn: ["core"] },
        { id: "tests", description: "Add runtime tests", files: ["tests/runtime.test.ts"], domains: ["tests"] },
      ],
    });

    const coreLane = plan.lanes.find((lane) => lane.itemIds.includes("core"));
    const docsLane = plan.lanes.find((lane) => lane.itemIds.includes("docs"));

    expect(plan.firstWaveLaneIds).toContain(coreLane?.id);
    expect(plan.firstWaveLaneIds).toContain(plan.lanes.find((lane) => lane.itemIds.includes("tests"))?.id);
    expect(plan.firstWaveLaneIds).not.toContain(docsLane?.id);
    expect(docsLane?.blockedByLaneIds).toEqual([coreLane?.id]);
  });

  it("does not let read-only lanes steal writable ownership", () => {
    const plan = planParallelWorkAreas({
      items: [
        { id: "writer", description: "Edit shared file", files: ["src/shared.ts"], domains: ["runtime"] },
        { id: "reviewer", description: "Review shared file", files: ["src/shared.ts"], domains: ["runtime"], write: false },
      ],
    });

    const writerLane = plan.lanes.find((lane) => lane.itemIds.includes("writer"));
    const reviewerLane = plan.lanes.find((lane) => lane.itemIds.includes("reviewer"));

    expect(writerLane?.id).not.toBe(reviewerLane?.id);
    expect(plan.ownership.files["src/shared.ts"]).toBe(writerLane?.id);
    expect(plan.ownership.domains.runtime).toBe(writerLane?.id);
    expect(plan.conflicts).toEqual([]);
  });

  it("defaults to a hybrid strategy with worktrees for writable lanes and spawn agents for read-only lanes", () => {
    const plan = planParallelWorkAreas({
      items: [
        { id: "writer", description: "Edit mode policy", files: ["modes/coding/MODE.md"], domains: ["mode-coding"] },
        { id: "reviewer", description: "Review mode policy", files: ["modes/coding/MODE.md"], domains: ["mode-coding"], write: false },
      ],
    });

    const writerLane = plan.lanes.find((lane) => lane.itemIds.includes("writer"));
    const reviewerLane = plan.lanes.find((lane) => lane.itemIds.includes("reviewer"));

    expect(plan.parallelStrategy).toBe("hybrid");
    expect(writerLane?.executionStrategy).toBe("worktree");
    expect(reviewerLane?.executionStrategy).toBe("spawn-agent");
  });

  it("allows worktree-first to use worktrees even for read-only lanes", () => {
    const plan = planParallelWorkAreas({
      parallelStrategy: "worktree-first",
      items: [
        { id: "review", description: "Review docs", files: ["docs/design.md"], domains: ["docs"], write: false },
      ],
    });

    expect(plan.lanes[0]?.executionStrategy).toBe("worktree");
  });

  it("allows a spawn-only strategy while keeping conflicted writable lanes serial", () => {
    const plan = planParallelWorkAreas({
      parallelStrategy: "spawn-only",
      items: [
        { id: "api", description: "Edit API", files: ["src/api.ts"], domains: ["api"] },
        { id: "ui", description: "Edit UI", files: ["src/ui.ts"], domains: ["ui"] },
        { id: "ui-test", description: "Edit UI tests", files: ["src/ui.ts"], domains: ["ui"] },
      ],
    });

    const apiLane = plan.lanes.find((lane) => lane.itemIds.includes("api"));
    const uiLane = plan.lanes.find((lane) => lane.itemIds.includes("ui"));

    expect(plan.parallelStrategy).toBe("spawn-only");
    expect(apiLane?.executionStrategy).toBe("spawn-agent");
    expect(uiLane?.executionStrategy).toBe("serial");
  });

  it("formats a concrete ownership map for agent handoff", () => {
    const plan = planParallelWorkAreas({
      items: [
        { id: "extensions", description: "Implement extension behavior", files: ["extensions/foo.ts"], domains: ["extensions"] },
        { id: "tests", description: "Add focused tests", files: ["tests/foo.test.ts"], domains: ["tests"] },
      ],
    });

    const text = formatParallelWorkPlan(plan);

    expect(text).toContain("Parallel work ownership plan");
    expect(text).toContain("File/domain ownership");
    expect(text).toContain("extensions/foo.ts");
    expect(text).toContain("First parallel wave");
  });
});
