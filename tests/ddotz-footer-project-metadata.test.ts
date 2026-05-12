import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readFooterProjectMetadata } from "../extensions/ddotz-footer/index";

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

describe("ddotz footer project metadata", () => {
  it("reads the nearest project package version from cwd instead of ddotz-pi", async () => {
    const project = await tempDir("ddotz-footer-project-version-");
    const nested = join(project, "packages", "app", "src");
    await mkdir(nested, { recursive: true });
    await writeFile(join(project, "package.json"), JSON.stringify({ name: "actual-project", version: "2.3.4" }), "utf8");

    const metadata = readFooterProjectMetadata(nested);

    expect(metadata).toEqual({ branch: null, version: "2.3.4" });
  });

  it("uses the cwd git branch and does not fall back to the ddotz-pi package branch outside a git repo", async () => {
    const project = await tempDir("ddotz-footer-project-branch-");
    execFileSync("git", ["init", "-b", "feature-statusline"], { cwd: project, stdio: "ignore" });

    const nonGit = await tempDir("ddotz-footer-non-git-");

    expect(readFooterProjectMetadata(project).branch).toBe("feature-statusline");
    expect(readFooterProjectMetadata(nonGit).branch).toBeNull();
  });
});
