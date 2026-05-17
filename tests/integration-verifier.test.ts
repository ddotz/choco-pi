import { describe, expect, it } from "vitest";
import { createAgentRunManifest, loadAgentRunManifest, updateAgentLaneStatus } from "../extensions/choco-autopilot/agent-run-manifest";
import { runIntegrationVerifier } from "../extensions/choco-autopilot/integration-verifier-tool";
import { planParallelWorkAreas } from "../extensions/choco-autopilot/worktree-planner";
import { createGitFixture } from "./helpers/git-fixture";

describe("integration verifier", () => {
  it("blocks when any lane is not verified", async () => {
    const fixture = await createGitFixture();
    try {
      const plan = planParallelWorkAreas({ items: [{ id: "a", description: "A", files: ["a.txt"] }] });
      await createAgentRunManifest({ repoRoot: fixture.repoRoot, groupId: "group-a", baseRef: "main", plan });

      const result = await runIntegrationVerifier({ groupId: "group-a", repoRoot: fixture.repoRoot, dryRun: true });

      expect(result.ok).toBe(false);
      expect(result.status).toBe("blocked");
      expect(result.blockers.join("\n")).toContain("unverified lane");
    } finally {
      await fixture.cleanup();
    }
  });

  it("blocks dirty lane worktrees", async () => {
    const fixture = await createGitFixture();
    try {
      await fixture.createBranch("lane/a");
      const worktreePath = await fixture.createLinkedWorktree("lane/a");
      const plan = planParallelWorkAreas({ items: [{ id: "a", description: "A", files: ["a.txt"] }] });
      await createAgentRunManifest({ repoRoot: fixture.repoRoot, groupId: "group-a", baseRef: "main", plan });
      await updateAgentLaneStatus(fixture.repoRoot, "group-a", "lane-1", "running");
      await updateAgentLaneStatus(fixture.repoRoot, "group-a", "lane-1", "verified", { worktreePath, branchName: "lane/a" });
      await fixture.dirtyFile("dirty.txt", worktreePath);

      const result = await runIntegrationVerifier({ groupId: "group-a", repoRoot: fixture.repoRoot, dryRun: true });

      expect(result.ok).toBe(false);
      expect(result.status).toBe("blocked");
      expect(result.blockers.join("\n")).toContain("dirty lane worktree");
    } finally {
      await fixture.cleanup();
    }
  });

  it("blocks worktree lanes that are verified without a branch name", async () => {
    const fixture = await createGitFixture();
    try {
      const plan = planParallelWorkAreas({ items: [{ id: "a", description: "A", files: ["a.txt"] }] });
      await createAgentRunManifest({ repoRoot: fixture.repoRoot, groupId: "group-a", baseRef: "main", plan });
      await updateAgentLaneStatus(fixture.repoRoot, "group-a", "lane-1", "running");
      await updateAgentLaneStatus(fixture.repoRoot, "group-a", "lane-1", "verified", { worktreePath: fixture.repoRoot });

      const result = await runIntegrationVerifier({ groupId: "group-a", repoRoot: fixture.repoRoot, dryRun: true });

      expect(result.ok).toBe(false);
      expect(result.status).toBe("blocked");
      expect(result.blockers.join("\n")).toContain("lacks branchName");
    } finally {
      await fixture.cleanup();
    }
  });

  it("blocks unsupported integration strategies instead of silently merging", async () => {
    const fixture = await createGitFixture();
    try {
      const plan = planParallelWorkAreas({ items: [{ id: "review", description: "Review", files: ["README.md"], write: false }] });
      await createAgentRunManifest({ repoRoot: fixture.repoRoot, groupId: "group-a", baseRef: "main", plan });
      await updateAgentLaneStatus(fixture.repoRoot, "group-a", "lane-1", "running");
      await updateAgentLaneStatus(fixture.repoRoot, "group-a", "lane-1", "verified");

      const result = await runIntegrationVerifier({ groupId: "group-a", repoRoot: fixture.repoRoot, strategy: "cherry-pick", dryRun: true });

      expect(result.ok).toBe(false);
      expect(result.status).toBe("blocked");
      expect(result.blockers.join("\n")).toContain("only merge strategy is supported");
    } finally {
      await fixture.cleanup();
    }
  });

  it("blocks invalid group ids before reading manifests or cleaning integration worktrees", async () => {
    const fixture = await createGitFixture();
    try {
      const result = await runIntegrationVerifier({ groupId: "../../outside", repoRoot: fixture.repoRoot, dryRun: true });

      expect(result.ok).toBe(false);
      expect(result.status).toBe("blocked");
      expect(result.blockers.join("\n")).toContain("groupId");
    } finally {
      await fixture.cleanup();
    }
  });

  it("runs verification commands and marks the manifest integrated", async () => {
    const fixture = await createGitFixture();
    try {
      const plan = planParallelWorkAreas({ items: [{ id: "review", description: "Review", files: ["README.md"], write: false }] });
      await createAgentRunManifest({ repoRoot: fixture.repoRoot, groupId: "group-a", baseRef: "main", plan });
      await updateAgentLaneStatus(fixture.repoRoot, "group-a", "lane-1", "running");
      await updateAgentLaneStatus(fixture.repoRoot, "group-a", "lane-1", "verified");

      const result = await runIntegrationVerifier({
        groupId: "group-a",
        repoRoot: fixture.repoRoot,
        verificationCommands: ["git status --short"],
      });
      const manifest = await loadAgentRunManifest(fixture.repoRoot, "group-a");

      expect(result.ok).toBe(true);
      expect(result.status).toBe("passed");
      expect(result.verificationResults).toContainEqual(expect.objectContaining({ command: "git status --short", status: "passed" }));
      expect(manifest.status).toBe("integrated");
      expect(manifest.integrationEvidence).toContain("integration_verifier passed");
    } finally {
      await fixture.cleanup();
    }
  });

  it("reports failed verification commands", async () => {
    const fixture = await createGitFixture();
    try {
      const plan = planParallelWorkAreas({ items: [{ id: "review", description: "Review", files: ["README.md"], write: false }] });
      await createAgentRunManifest({ repoRoot: fixture.repoRoot, groupId: "group-a", baseRef: "main", plan });
      await updateAgentLaneStatus(fixture.repoRoot, "group-a", "lane-1", "running");
      await updateAgentLaneStatus(fixture.repoRoot, "group-a", "lane-1", "verified");

      const result = await runIntegrationVerifier({ groupId: "group-a", repoRoot: fixture.repoRoot, verificationCommands: ["exit 7"] });

      expect(result.ok).toBe(false);
      expect(result.status).toBe("failed");
      expect(result.verificationResults[0]).toMatchObject({ command: "exit 7", status: "failed" });
    } finally {
      await fixture.cleanup();
    }
  });
});
