import { describe, expect, it } from "vitest";
import chocoAutopilot from "../extensions/choco-autopilot/index";
import { runBranchSwitchGuard } from "../extensions/choco-autopilot/branch-switch-guard";
import { currentBranch } from "../extensions/choco-autopilot/git-runtime";
import { createGitFixture } from "./helpers/git-fixture";
import { createPiExtensionFixture } from "./helpers/pi-extension-fixture";

describe("branch switch guard", () => {
  it("registers branch_switch_guard as a Pi-native tool", () => {
    const { tools } = createPiExtensionFixture(chocoAutopilot);

    expect(tools.has("branch_switch_guard")).toBe(true);
  });

  it("switches a clean current cwd to an existing local branch", async () => {
    const fixture = await createGitFixture();
    try {
      await fixture.createBranch("feature/foo");

      const result = await runBranchSwitchGuard({ targetBranch: "feature/foo" }, { cwd: fixture.repoRoot });

      expect(result.ok).toBe(true);
      expect(result.action).toBe("switched");
      expect(await currentBranch(fixture.repoRoot)).toBe("feature/foo");
      expect(result.commands).toContain("git switch feature/foo");
    } finally {
      await fixture.cleanup();
    }
  });

  it("blocks unsafe git branch names before running git switch", async () => {
    const fixture = await createGitFixture();
    try {
      for (const targetBranch of ["foo..bar", "foo@{bar", "bad branch", "feature/trailing.", "feature/"]) {
        const result = await runBranchSwitchGuard({ targetBranch }, { cwd: fixture.repoRoot });
        expect(result.ok).toBe(false);
        expect(result.action).toBe("blocked");
        expect(result.blockers.join("\n")).toContain("targetBranch");
        expect(result.commands).toEqual([]);
      }
    } finally {
      await fixture.cleanup();
    }
  });

  it("blocks branch switching when the current cwd is dirty", async () => {
    const fixture = await createGitFixture();
    try {
      await fixture.createBranch("feature/foo");
      await fixture.dirtyFile();

      const result = await runBranchSwitchGuard({ targetBranch: "feature/foo" }, { cwd: fixture.repoRoot });

      expect(result.ok).toBe(false);
      expect(result.action).toBe("blocked");
      expect(result.blockers.join("\n")).toContain("current cwd is dirty");
      expect(await currentBranch(fixture.repoRoot)).toBe("main");
    } finally {
      await fixture.cleanup();
    }
  });

  it("returns an already-on-target no-op when no switch is needed", async () => {
    const fixture = await createGitFixture();
    try {
      await fixture.createBranch("feature/foo");
      await fixture.checkout("feature/foo");

      const result = await runBranchSwitchGuard({ targetBranch: "feature/foo" }, { cwd: fixture.repoRoot });

      expect(result.ok).toBe(true);
      expect(result.action).toBe("already-on-target");
      expect(result.commands).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("blocks when the target branch is checked out in another dirty worktree", async () => {
    const fixture = await createGitFixture();
    try {
      await fixture.createBranch("feature/occupied");
      const occupiedPath = await fixture.createLinkedWorktree("feature/occupied");
      await fixture.dirtyFile("outside.txt", occupiedPath);

      const result = await runBranchSwitchGuard({ targetBranch: "feature/occupied" }, { cwd: fixture.repoRoot });

      expect(result.ok).toBe(false);
      expect(result.action).toBe("blocked");
      expect(result.occupiedBy).toContainEqual({ path: occupiedPath, branch: "feature/occupied", dirty: true });
      expect(result.blockers.join("\n")).toContain("dirty worktree");
      expect(await currentBranch(fixture.repoRoot)).toBe("main");
    } finally {
      await fixture.cleanup();
    }
  });

  it("detaches another clean occupied worktree before switching when explicitly allowed", async () => {
    const fixture = await createGitFixture();
    try {
      await fixture.createBranch("feature/occupied");
      const occupiedPath = await fixture.createLinkedWorktree("feature/occupied");

      const result = await runBranchSwitchGuard({
        targetBranch: "feature/occupied",
        detachOtherCleanWorktree: true,
      }, { cwd: fixture.repoRoot });

      expect(result.ok).toBe(true);
      expect(result.action).toBe("switched");
      expect(result.detachedOtherWorktree).toBe(true);
      expect(await currentBranch(occupiedPath)).toBeNull();
      expect(await currentBranch(fixture.repoRoot)).toBe("feature/occupied");
    } finally {
      await fixture.cleanup();
    }
  });

  it("creates and switches to a missing branch when createIfMissing is enabled", async () => {
    const fixture = await createGitFixture();
    try {
      const result = await runBranchSwitchGuard({
        targetBranch: "feature/new-branch",
        createIfMissing: true,
        baseRef: "main",
      }, { cwd: fixture.repoRoot });

      expect(result.ok).toBe(true);
      expect(result.action).toBe("created-and-switched");
      expect(await currentBranch(fixture.repoRoot)).toBe("feature/new-branch");
      expect(result.commands).toContain("git switch -c feature/new-branch main");
    } finally {
      await fixture.cleanup();
    }
  });

  it("dry-runs a safe branch switch without executing git commands", async () => {
    const fixture = await createGitFixture();
    try {
      await fixture.createBranch("feature/dry-run");

      const result = await runBranchSwitchGuard({ targetBranch: "feature/dry-run", dryRun: true }, { cwd: fixture.repoRoot });

      expect(result.ok).toBe(true);
      expect(result.action).toBe("dry-run");
      expect(result.commands).toEqual(["git switch feature/dry-run"]);
      expect(await currentBranch(fixture.repoRoot)).toBe("main");
    } finally {
      await fixture.cleanup();
    }
  });
});
