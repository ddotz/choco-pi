import { describe, expect, it } from "vitest";
import {
  currentBranch,
  execGit,
  findWorktreeByBranch,
  listWorktrees,
  parseGitWorktreeListPorcelain,
  repoRoot,
  statusSummary,
} from "../extensions/choco-autopilot/git-runtime";
import { createGitFixture } from "./helpers/git-fixture";

describe("git runtime helper", () => {
  it("returns structured command results instead of throwing on git failure", async () => {
    const fixture = await createGitFixture();
    try {
      const result = await execGit(fixture.repoRoot, ["not-a-real-subcommand"]);

      expect(result.code).not.toBe(0);
      expect(result.command).toEqual(["git", "not-a-real-subcommand"]);
      expect(result.stderr).toContain("not-a-real-subcommand");
    } finally {
      await fixture.cleanup();
    }
  });

  it("times out hung git commands with a structured result", async () => {
    const fixture = await createGitFixture();
    try {
      const result = await execGit(fixture.repoRoot, ["-c", "alias.pause=!sleep 1", "pause"], { timeoutMs: 10 });

      expect(result.code).toBe(124);
      expect(result.stderr).toContain("timed out");
    } finally {
      await fixture.cleanup();
    }
  });

  it("summarizes branch and dirty status including staged, unstaged, and untracked files", async () => {
    const fixture = await createGitFixture();
    try {
      await fixture.write("src/tracked.txt", "original\n");
      await fixture.commitAll("add tracked file");
      await fixture.write("src/tracked.txt", "changed\n");
      await fixture.write("src/staged.txt", "staged\n");
      await fixture.runGit(["add", "src/staged.txt"]);
      await fixture.write("src/untracked.txt", "untracked\n");

      const summary = await statusSummary(fixture.repoRoot);

      expect(summary.branch).toBe("main");
      expect(summary.dirty).toBe(true);
      expect(summary.porcelain).toContain("src/tracked.txt");
      expect(summary.changedFiles).toEqual(expect.arrayContaining(["src/tracked.txt", "src/staged.txt", "src/untracked.txt"]));
      expect(summary.untrackedFiles).toEqual(["src/untracked.txt"]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("parses worktree porcelain output with branch, detached, bare, locked, and prunable flags", () => {
    const parsed = parseGitWorktreeListPorcelain([
      "worktree /repo",
      "HEAD 1111111111111111111111111111111111111111",
      "branch refs/heads/main",
      "",
      "worktree /repo-detached",
      "HEAD 2222222222222222222222222222222222222222",
      "detached",
      "",
      "worktree /repo-bare",
      "bare",
      "",
      "worktree /repo-locked",
      "HEAD 3333333333333333333333333333333333333333",
      "branch refs/heads/feature/foo",
      "locked keep this worktree",
      "prunable stale metadata",
      "",
    ].join("\n"));

    expect(parsed).toEqual([
      { path: "/repo", head: "1111111111111111111111111111111111111111", branch: "main", detached: false, bare: false },
      { path: "/repo-detached", head: "2222222222222222222222222222222222222222", detached: true, bare: false },
      { path: "/repo-bare", detached: false, bare: true },
      {
        path: "/repo-locked",
        head: "3333333333333333333333333333333333333333",
        branch: "feature/foo",
        detached: false,
        bare: false,
        locked: true,
        prunable: true,
        reason: "keep this worktree",
      },
    ]);
  });

  it("lists linked worktrees and finds a branch owner", async () => {
    const fixture = await createGitFixture();
    try {
      await fixture.createBranch("feature/linked");
      const worktreePath = await fixture.createLinkedWorktree("feature/linked");

      const worktrees = await listWorktrees(fixture.repoRoot);
      const owner = await findWorktreeByBranch(fixture.repoRoot, "feature/linked");

      expect(await repoRoot(worktreePath)).toBe(worktreePath);
      expect(await currentBranch(worktreePath)).toBe("feature/linked");
      expect(worktrees.map((worktree) => worktree.path)).toContain(worktreePath);
      expect(owner?.path).toBe(worktreePath);
      expect(owner?.branch).toBe("feature/linked");
    } finally {
      await fixture.cleanup();
    }
  });
});
