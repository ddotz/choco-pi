import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  agentRunManifestPath,
  createAgentRunManifest,
  loadAgentRunManifest,
  summarizeAgentRunManifest,
  updateAgentLaneStatus,
} from "../extensions/choco-autopilot/agent-run-manifest";
import { planParallelWorkAreas } from "../extensions/choco-autopilot/worktree-planner";

let repoRoot: string | undefined;

afterEach(async () => {
  if (repoRoot) await rm(repoRoot, { recursive: true, force: true });
  repoRoot = undefined;
});

async function tempRepoRoot(): Promise<string> {
  repoRoot = await mkdtemp(join(tmpdir(), "choco-pi-manifest-"));
  return repoRoot;
}

describe("agent run manifest", () => {
  it("creates, saves, loads, and summarizes lanes from a parallel plan", async () => {
    const root = await tempRepoRoot();
    const plan = planParallelWorkAreas({
      goal: "ship runtime",
      items: [
        { id: "runtime", description: "Edit runtime", files: ["extensions/runtime.ts"] },
        { id: "docs", description: "Review docs", files: ["README.md"], write: false },
      ],
    });

    const manifest = await createAgentRunManifest({ repoRoot: root, groupId: "group-a", baseRef: "main", plan });
    const loaded = await loadAgentRunManifest(root, "group-a");
    const summary = summarizeAgentRunManifest(loaded);

    expect(manifest.lanes).toHaveLength(2);
    expect(loaded.goal).toBe("ship runtime");
    expect(loaded.lanes.map((lane) => lane.id)).toEqual(["lane-1", "lane-2"]);
    expect(summary).toContain("group-a");
    expect(summary).toContain("lane-1");
  });

  it("rejects group ids that would escape the repo-local manifest root", async () => {
    const root = await tempRepoRoot();

    expect(() => agentRunManifestPath(root, "../../outside")).toThrow("groupId");
    const manifestPath = agentRunManifestPath(root, "group-a");
    const relativePath = relative(resolve(root, ".pi", "agent-runs"), manifestPath);
    expect(relativePath.startsWith(`..${sep}`)).toBe(false);
  });

  it("rejects invalid lane transitions", async () => {
    const root = await tempRepoRoot();
    const plan = planParallelWorkAreas({ items: [{ id: "runtime", description: "Edit runtime", files: ["src/runtime.ts"] }] });
    await createAgentRunManifest({ repoRoot: root, groupId: "group-a", baseRef: "main", plan });

    await expect(updateAgentLaneStatus(root, "group-a", "lane-1", "integrated"))
      .rejects.toThrow("Invalid lane transition");
  });

  it("serializes concurrent lane updates through file locking", async () => {
    const root = await tempRepoRoot();
    const plan = planParallelWorkAreas({ items: [{ id: "runtime", description: "Edit runtime", files: ["src/runtime.ts"] }] });
    await createAgentRunManifest({ repoRoot: root, groupId: "group-a", baseRef: "main", plan });

    await Promise.all([
      updateAgentLaneStatus(root, "group-a", "lane-1", "created", { worktreePath: "/tmp/a", branchName: "a" }),
      updateAgentLaneStatus(root, "group-a", "lane-1", "created", { verificationCommands: ["pnpm test"] }),
    ]);

    const loaded = await loadAgentRunManifest(root, "group-a");
    expect(loaded.lanes[0].status).toBe("created");
    expect(loaded.lanes[0].worktreePath).toBe("/tmp/a");
    expect(loaded.lanes[0].verificationCommands).toEqual(["pnpm test"]);
  });
});
