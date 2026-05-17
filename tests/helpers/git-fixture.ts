import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitFixture {
  repoRoot: string;
  runGit(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }>;
  write(relativePath: string, content: string, cwd?: string): Promise<void>;
  commitAll(message: string, cwd?: string): Promise<void>;
  createBranch(branch: string, startPoint?: string): Promise<void>;
  checkout(branch: string, cwd?: string): Promise<void>;
  createLinkedWorktree(branch: string): Promise<string>;
  dirtyFile(relativePath?: string, cwd?: string): Promise<void>;
  cleanup(): Promise<void>;
}

export async function createGitFixture(prefix = "choco-pi-git-"): Promise<GitFixture> {
  const rawRepoRoot = await mkdtemp(join(tmpdir(), prefix));
  const repoRoot = await realpath(rawRepoRoot);
  const cleanupRoots = new Set<string>([repoRoot]);

  const runGit = async (args: string[], cwd = repoRoot): Promise<{ stdout: string; stderr: string }> => {
    const result = await execFileAsync("git", args, { cwd });
    return { stdout: result.stdout, stderr: result.stderr };
  };

  const write = async (relativePath: string, content: string, cwd = repoRoot): Promise<void> => {
    const filePath = join(cwd, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  };

  const commitAll = async (message: string, cwd = repoRoot): Promise<void> => {
    await runGit(["add", "-A"], cwd);
    await runGit(["commit", "-m", message], cwd);
  };

  await runGit(["init"]);
  await runGit(["config", "user.email", "choco-pi-test@example.com"]);
  await runGit(["config", "user.name", "Choco Pi Test"]);
  await runGit(["checkout", "-B", "main"]);
  await write("README.md", "# fixture\n");
  await commitAll("initial commit");

  const createBranch = async (branch: string, startPoint = "main"): Promise<void> => {
    await runGit(["branch", branch, startPoint]);
  };

  const checkout = async (branch: string, cwd = repoRoot): Promise<void> => {
    await runGit(["switch", branch], cwd);
  };

  const createLinkedWorktree = async (branch: string): Promise<string> => {
    const rawRoot = await mkdtemp(join(tmpdir(), "choco-pi-worktree-"));
    const root = await realpath(rawRoot);
    cleanupRoots.add(root);
    const worktreePath = join(root, "worktree");
    await runGit(["worktree", "add", worktreePath, branch]);
    return worktreePath;
  };

  const dirtyFile = async (relativePath = "dirty.txt", cwd = repoRoot): Promise<void> => {
    await write(relativePath, `dirty ${Date.now()}\n`, cwd);
  };

  const cleanup = async (): Promise<void> => {
    await Promise.all([...cleanupRoots].map((root) => rm(root, { recursive: true, force: true })));
  };

  return { repoRoot, runGit, write, commitAll, createBranch, checkout, createLinkedWorktree, dirtyFile, cleanup };
}
