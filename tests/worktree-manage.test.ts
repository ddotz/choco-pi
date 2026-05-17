import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import chocoAutopilot from "../extensions/choco-autopilot/index";
import { runAgentOrchestrator } from "../extensions/choco-autopilot/agent-orchestrator-tool";
import { loadAgentRunManifest } from "../extensions/choco-autopilot/agent-run-manifest";
import { runWorktreeManage } from "../extensions/choco-autopilot/worktree-manage-tool";
import { currentBranch } from "../extensions/choco-autopilot/git-runtime";
import { planParallelWorkAreas } from "../extensions/choco-autopilot/worktree-planner";
import { createGitFixture } from "./helpers/git-fixture";
import { createPiExtensionFixture } from "./helpers/pi-extension-fixture";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempWorktreePath(): Promise<string> {
  const rawRoot = await mkdtemp(join(tmpdir(), "choco-pi-wt-manage-"));
  const root = await realpath(rawRoot);
  tempDirs.push(root);
  return join(root, "worktree");
}

describe("worktree_manage tool", () => {
  it("registers worktree_manage as a Pi-native tool", () => {
    const { tools } = createPiExtensionFixture(chocoAutopilot);

    expect(tools.has("worktree_manage")).toBe(true);
  });

  it("plans deterministic branch and path names with readable slug and digest", async () => {
    const fixture = await createGitFixture();
    try {
      const result = await runWorktreeManage({
        action: "plan",
        repoRoot: fixture.repoRoot,
        sessionId: "abc123",
        taskName: "멀티 세션 todo 격리",
      }, { cwd: fixture.repoRoot, homeDir: "/Users/hyuns" });

      expect(result.ok).toBe(true);
      expect(result.branchName).toMatch(/^session\/abc123\/multi-session-todo-[a-f0-9]{8}$/);
      expect(result.path).toBe(`/Users/hyuns/.config/superpowers/worktrees/${basename(fixture.repoRoot)}/${result.branchName!.replace("session/abc123/", "abc123-")}`);
      expect(result.commands).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("creates, lists, reports status for, and removes a clean worktree", async () => {
    const fixture = await createGitFixture();
    const path = await tempWorktreePath();
    try {
      const created = await runWorktreeManage({
        action: "create",
        repoRoot: fixture.repoRoot,
        branchName: "session/test/worktree-manage",
        baseRef: "main",
        path,
      }, { cwd: fixture.repoRoot });

      expect(created.ok).toBe(true);
      expect(created.path).toBe(path);
      expect(await currentBranch(path)).toBe("session/test/worktree-manage");

      const listed = await runWorktreeManage({ action: "list", repoRoot: fixture.repoRoot }, { cwd: fixture.repoRoot });
      expect(listed.worktrees?.map((worktree) => worktree.path)).toContain(path);

      const status = await runWorktreeManage({ action: "status", repoRoot: fixture.repoRoot, path }, { cwd: fixture.repoRoot });
      expect(status.ok).toBe(true);
      expect(status.dirty).toBe(false);
      expect(status.branchName).toBe("session/test/worktree-manage");

      const removed = await runWorktreeManage({ action: "remove", repoRoot: fixture.repoRoot, path }, { cwd: fixture.repoRoot });
      expect(removed.ok).toBe(true);
      expect(removed.commands).toContain(`git worktree remove ${path}`);
    } finally {
      await fixture.cleanup();
    }
  });

  it("attaches created worktree details to the target manifest lane", async () => {
    const fixture = await createGitFixture();
    const path = await tempWorktreePath();
    try {
      const plan = planParallelWorkAreas({ items: [{ id: "runtime", description: "Edit runtime", files: ["src/runtime.ts"] }] });
      await runAgentOrchestrator({ action: "start", repoRoot: fixture.repoRoot, groupId: "group-a", baseRef: "main", plan });

      const created = await runWorktreeManage({
        action: "create",
        repoRoot: fixture.repoRoot,
        groupId: "group-a",
        laneId: "lane-1",
        branchName: "session/test/manifest-link",
        baseRef: "main",
        path,
      }, { cwd: fixture.repoRoot });
      const dispatched = await runAgentOrchestrator({ action: "dispatch", repoRoot: fixture.repoRoot, groupId: "group-a" });
      const manifest = await loadAgentRunManifest(fixture.repoRoot, "group-a");

      expect(created.ok).toBe(true);
      expect(manifest.lanes[0]).toMatchObject({ status: "created", worktreePath: path, branchName: "session/test/manifest-link" });
      expect(dispatched.ok).toBe(true);
      expect(dispatched.handoffPrompts.join("\n")).toContain(path);
    } finally {
      await fixture.cleanup();
    }
  });

  it("treats an existing registered worktree path as idempotent when allowExisting is set", async () => {
    const fixture = await createGitFixture();
    const path = await tempWorktreePath();
    try {
      await runWorktreeManage({
        action: "create",
        repoRoot: fixture.repoRoot,
        branchName: "session/test/idempotent",
        baseRef: "main",
        path,
      }, { cwd: fixture.repoRoot });

      const result = await runWorktreeManage({
        action: "create",
        repoRoot: fixture.repoRoot,
        branchName: "session/test/idempotent",
        path,
        allowExisting: true,
      }, { cwd: fixture.repoRoot });

      expect(result.ok).toBe(true);
      expect(result.blockers).toEqual([]);
      expect(result.commands).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("blocks create when the target path exists unless allowExisting is set", async () => {
    const fixture = await createGitFixture();
    const existingPath = join(fixture.repoRoot, "existing-path");
    try {
      await mkdir(existingPath);

      const result = await runWorktreeManage({
        action: "create",
        repoRoot: fixture.repoRoot,
        branchName: "session/test/existing-path",
        path: existingPath,
      }, { cwd: fixture.repoRoot });

      expect(result.ok).toBe(false);
      expect(result.blockers.join("\n")).toContain("path already exists");
    } finally {
      await fixture.cleanup();
    }
  });

  it("blocks create when the branch is already occupied by another worktree", async () => {
    const fixture = await createGitFixture();
    const path = await tempWorktreePath();
    try {
      await fixture.createBranch("session/test/occupied");
      const occupiedPath = await fixture.createLinkedWorktree("session/test/occupied");

      const result = await runWorktreeManage({
        action: "create",
        repoRoot: fixture.repoRoot,
        branchName: "session/test/occupied",
        path,
      }, { cwd: fixture.repoRoot });

      expect(result.ok).toBe(false);
      expect(result.blockers.join("\n")).toContain(`branch is already checked out in worktree: ${occupiedPath}`);
    } finally {
      await fixture.cleanup();
    }
  });

  it("blocks removing a dirty worktree", async () => {
    const fixture = await createGitFixture();
    const path = await tempWorktreePath();
    try {
      await runWorktreeManage({
        action: "create",
        repoRoot: fixture.repoRoot,
        branchName: "session/test/dirty-remove",
        baseRef: "main",
        path,
      }, { cwd: fixture.repoRoot });
      await fixture.dirtyFile("dirty.txt", path);

      const result = await runWorktreeManage({ action: "remove", repoRoot: fixture.repoRoot, path }, { cwd: fixture.repoRoot });

      expect(result.ok).toBe(false);
      expect(result.dirty).toBe(true);
      expect(result.blockers.join("\n")).toContain("dirty worktree remove is blocked");
    } finally {
      await fixture.cleanup();
    }
  });

  it("generates a lane handoff prompt with cwd, branch, and lane scope", async () => {
    const fixture = await createGitFixture();
    try {
      const result = await runWorktreeManage({
        action: "handoff",
        repoRoot: fixture.repoRoot,
        groupId: "group-a",
        laneId: "lane-1",
        branchName: "session/test/handoff",
        path: "/tmp/choco-pi-handoff",
      }, { cwd: fixture.repoRoot });

      expect(result.ok).toBe(true);
      expect(result.handoffPrompt).toContain("group-a");
      expect(result.handoffPrompt).toContain("lane-1");
      expect(result.handoffPrompt).toContain("/tmp/choco-pi-handoff");
      expect(result.handoffPrompt).toContain("session/test/handoff");
    } finally {
      await fixture.cleanup();
    }
  });
});
