import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentRunManifest, loadAgentRunManifest, updateAgentLaneStatus } from "../extensions/choco-autopilot/agent-run-manifest";
import { guardWritePath, recordWriteScopeViolation, type ActiveLaneContext } from "../extensions/choco-autopilot/write-scope-guard";
import { planParallelWorkAreas } from "../extensions/choco-autopilot/worktree-planner";

function lane(overrides: Partial<ActiveLaneContext> = {}): ActiveLaneContext {
  return {
    groupId: "group-a",
    laneId: "lane-1",
    repoRoot: "/repo",
    ownedFiles: ["tests"],
    ownedDomains: [],
    executionStrategy: "worktree",
    readOnly: false,
    ...overrides,
  };
}

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

async function tempRepoRoot(): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), "choco-pi-write-scope-"));
  return tempDir;
}

describe("write scope guard", () => {
  it("allows writes inside an owned directory", () => {
    expect(guardWritePath(lane(), "/repo/tests/a.ts")).toMatchObject({ allowed: true });
  });

  it("blocks writes outside the owned scope", () => {
    const result = guardWritePath(lane({ ownedFiles: ["tests/a.ts"] }), "/repo/src/a.ts");

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("outside active lane write scope");
  });

  it("blocks every write in read-only lanes", () => {
    const result = guardWritePath(lane({ readOnly: true }), "/repo/tests/a.ts");

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("read-only lane");
  });

  it("no-ops when there is no active lane", () => {
    expect(guardWritePath(undefined, "/repo/src/a.ts")).toMatchObject({ allowed: true });
  });

  it("allows glob-owned files", () => {
    expect(guardWritePath(lane({ ownedFiles: ["tests/*.test.ts"] }), "/repo/tests/foo.test.ts")).toMatchObject({ allowed: true });
  });

  it("records write-scope violations on the lane manifest", async () => {
    const repoRoot = await tempRepoRoot();
    const plan = planParallelWorkAreas({ items: [{ id: "lane", description: "Edit tests", files: ["tests"] }] });
    await createAgentRunManifest({ repoRoot, groupId: "group-a", baseRef: "main", plan });
    await updateAgentLaneStatus(repoRoot, "group-a", "lane-1", "running");

    await recordWriteScopeViolation({ ...lane({ repoRoot }), groupId: "group-a", laneId: "lane-1" }, "outside write");
    const manifest = await loadAgentRunManifest(repoRoot, "group-a");

    expect(manifest.lanes[0]).toMatchObject({ status: "blocked", lastError: "outside write" });
  });
});
