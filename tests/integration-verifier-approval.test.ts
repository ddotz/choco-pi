import { describe, expect, it, vi } from "vitest";
import { createAgentRunManifest, updateAgentLaneStatus } from "../extensions/choco-autopilot/agent-run-manifest";
import { planParallelWorkAreas } from "../extensions/choco-autopilot/worktree-planner";
import { createGitFixture } from "./helpers/git-fixture";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    exec: vi.fn((command: string, options: unknown, callback: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
      callback(null, { stdout: `executed: ${command}`, stderr: "" });
      return { on: vi.fn(), kill: vi.fn() };
    }),
  };
});

describe("integration verifier approval boundaries", () => {
  it("blocks approval-boundary verification commands without executing them", async () => {
    const { exec } = await import("node:child_process");
    const { runIntegrationVerifier } = await import("../extensions/choco-autopilot/integration-verifier-tool");
    const fixture = await createGitFixture();
    try {
      const plan = planParallelWorkAreas({ items: [{ id: "review", description: "Review", files: ["README.md"], write: false }] });
      await createAgentRunManifest({ repoRoot: fixture.repoRoot, groupId: "group-a", baseRef: "main", plan });
      await updateAgentLaneStatus(fixture.repoRoot, "group-a", "lane-1", "running");
      await updateAgentLaneStatus(fixture.repoRoot, "group-a", "lane-1", "verified");

      const result = await runIntegrationVerifier({ groupId: "group-a", repoRoot: fixture.repoRoot, verificationCommands: ["npm publish"] });

      expect(result.ok).toBe(false);
      expect(result.status).toBe("blocked");
      expect(result.verificationResults).toContainEqual(expect.objectContaining({ command: "npm publish", status: "blocked" }));
      expect(vi.mocked(exec)).not.toHaveBeenCalledWith(expect.stringContaining("npm publish"), expect.anything(), expect.anything());
    } finally {
      await fixture.cleanup();
    }
  });

  it("blocks arbitrary shell verification commands even when they do not match approval regexes", async () => {
    const { exec } = await import("node:child_process");
    const { runIntegrationVerifier } = await import("../extensions/choco-autopilot/integration-verifier-tool");
    const fixture = await createGitFixture();
    try {
      const plan = planParallelWorkAreas({ items: [{ id: "review", description: "Review", files: ["README.md"], write: false }] });
      await createAgentRunManifest({ repoRoot: fixture.repoRoot, groupId: "group-a", baseRef: "main", plan });
      await updateAgentLaneStatus(fixture.repoRoot, "group-a", "lane-1", "running");
      await updateAgentLaneStatus(fixture.repoRoot, "group-a", "lane-1", "verified");

      const command = "node -e \"console.log('not allowlisted')\"";
      const result = await runIntegrationVerifier({ groupId: "group-a", repoRoot: fixture.repoRoot, verificationCommands: [command] });

      expect(result.ok).toBe(false);
      expect(result.status).toBe("blocked");
      expect(result.verificationResults).toContainEqual(expect.objectContaining({ command, status: "blocked" }));
      expect(vi.mocked(exec)).not.toHaveBeenCalledWith(expect.stringContaining("node -e"), expect.anything(), expect.anything());
    } finally {
      await fixture.cleanup();
    }
  });
});
