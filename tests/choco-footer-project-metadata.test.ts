import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ActiveWorktreeCwdTracker, readFooterProjectMetadata } from "../extensions/choco-footer/index";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe("choco footer project metadata", () => {
  it("reads the nearest project package version from cwd instead of choco-pi", async () => {
    const project = await tempDir("choco-footer-project-version-");
    const nested = join(project, "packages", "app", "src");
    await mkdir(nested, { recursive: true });
    await writeFile(join(project, "package.json"), JSON.stringify({ name: "actual-project", version: "2.3.4" }), "utf8");

    const metadata = readFooterProjectMetadata(nested);

    expect(metadata).toEqual({ branch: null, version: "2.3.4" });
  });

  it("uses the cwd git branch and does not fall back to the choco-pi package branch outside a git repo", async () => {
    const project = await tempDir("choco-footer-project-branch-");
    execFileSync("git", ["init", "-b", "feature-statusline"], { cwd: project, stdio: "ignore" });

    const nonGit = await tempDir("choco-footer-non-git-");

    expect(readFooterProjectMetadata(project).branch).toBe("feature-statusline");
    expect(readFooterProjectMetadata(nonGit).branch).toBeNull();
  });

  it("reads QuickLate-style app metadata version when package.json is absent", async () => {
    const project = await tempDir("choco-footer-swift-version-");
    const nested = join(project, "Sources", "QuickLate");
    await mkdir(join(project, "script"), { recursive: true });
    await mkdir(nested, { recursive: true });
    await writeFile(join(project, "script", "app_metadata.sh"), 'VERSION="${VERSION:-0.2.2}"\n', "utf8");

    expect(readFooterProjectMetadata(nested).version).toBe("0.2.2");
  });

  it("uses the git worktree touched by tool calls as the active footer cwd", async () => {
    const project = await tempDir("choco-footer-active-worktree-project-");
    execFileSync("git", ["init", "-b", "main"], { cwd: project, stdio: "ignore" });
    await writeFile(join(project, "README.md"), "base\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: project, stdio: "ignore" });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"], { cwd: project, stdio: "ignore" });

    const worktreeParent = await tempDir("choco-footer-active-worktree-");
    const worktree = join(worktreeParent, "feature");
    execFileSync("git", ["worktree", "add", "-b", "feature-footer", worktree], { cwd: project, stdio: "ignore" });
    await mkdir(join(worktree, "Sources"), { recursive: true });
    await writeFile(join(worktree, "Sources", "App.swift"), "// feature\n", "utf8");

    const tracker = new ActiveWorktreeCwdTracker();

    const expectedWorktreeRoot = execFileSync("git", ["-C", worktree, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

    expect(tracker.get("session-1", project)).toBe(project);
    expect(tracker.updateFromToolCall("session-1", project, "read", { path: join(worktree, "Sources", "App.swift") })).toBe(expectedWorktreeRoot);
    expect(tracker.get("session-1", project)).toBe(expectedWorktreeRoot);

    tracker.clear("session-1");
    expect(tracker.updateFromToolCall("session-1", project, "bash", { command: `git -C "${worktree}" status --short` })).toBe(expectedWorktreeRoot);

    tracker.clear("session-1");
    expect(tracker.updateFromToolCall("session-1", project, "write", { path: join(worktree, "Generated", "NewFile.swift") })).toBe(expectedWorktreeRoot);
    expect(readFooterProjectMetadata(tracker.get("session-1", project)).branch).toBe("feature-footer");
  });
});
