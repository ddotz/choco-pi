import { spawn } from "node:child_process";

export interface GitExecResult {
  code: number;
  stdout: string;
  stderr: string;
  command: string[];
}

export interface GitWorktreeInfo {
  path: string;
  head?: string;
  branch?: string;
  detached: boolean;
  bare: boolean;
  prunable?: boolean;
  locked?: boolean;
  reason?: string;
}

export interface GitStatusSummary {
  branch: string | null;
  dirty: boolean;
  porcelain: string;
  changedFiles: string[];
  untrackedFiles: string[];
}

export interface GitExecOptions {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_GIT_TIMEOUT_MS = 30_000;

export async function execGit(cwd: string, args: string[], options: GitExecOptions = {}): Promise<GitExecResult> {
  const command = ["git", ...args];
  return await new Promise<GitExecResult>((resolve) => {
    const child = spawn("git", args, {
      cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const finish = (result: GitExecResult): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const onAbort = (): void => {
      child.kill("SIGTERM");
      finish({ code: 130, stdout, stderr: stderr || "git command aborted", command });
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      finish({ code: 127, stdout, stderr: stderr || error.message, command });
    });
    child.on("close", (code) => {
      finish({ code: code ?? 1, stdout, stderr, command });
    });

    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });

    const timeoutMs = options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS;
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timer = setTimeout(() => {
        child.kill("SIGTERM");
        const suffix = `git command timed out after ${timeoutMs}ms`;
        finish({ code: 124, stdout, stderr: stderr ? `${stderr.trimEnd()}\n${suffix}` : suffix, command });
      }, timeoutMs);
    }
  });
}

function ensureGitSuccess(result: GitExecResult, action: string): void {
  if (result.code === 0) return;
  const detail = result.stderr.trim() || result.stdout.trim() || `git exited with code ${result.code}`;
  throw new Error(`${action} failed: ${detail}`);
}

function parseBranchHeader(header: string | undefined): string | null {
  if (!header?.startsWith("## ")) return null;
  const value = header.slice(3).trim();
  if (!value || value.startsWith("HEAD ") || value === "HEAD" || value.includes("no branch")) return null;
  return value.split("...")[0]?.split(" ")[0] ?? null;
}

function parsePorcelainPath(line: string): string | undefined {
  const path = line.slice(3).trim();
  if (!path) return undefined;
  return path.includes(" -> ") ? path.split(" -> ").at(-1) : path;
}

export async function statusSummary(cwd: string): Promise<GitStatusSummary> {
  const result = await execGit(cwd, ["status", "--porcelain=v1", "-b", "--untracked-files=all"]);
  ensureGitSuccess(result, "git status");
  const lines = result.stdout.split(/\r?\n/).filter((line) => line.length > 0);
  const header = lines[0]?.startsWith("## ") ? lines.shift() : undefined;
  const changedFiles: string[] = [];
  const untrackedFiles: string[] = [];
  for (const line of lines) {
    const file = parsePorcelainPath(line);
    if (!file) continue;
    changedFiles.push(file);
    if (line.startsWith("??")) untrackedFiles.push(file);
  }
  return {
    branch: parseBranchHeader(header),
    dirty: changedFiles.length > 0,
    porcelain: lines.join("\n"),
    changedFiles,
    untrackedFiles,
  };
}

export async function currentBranch(cwd: string): Promise<string | null> {
  const result = await execGit(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (result.code !== 0) return null;
  return result.stdout.trim() || null;
}

export async function isDirty(cwd: string): Promise<boolean> {
  return (await statusSummary(cwd)).dirty;
}

export async function repoRoot(cwd: string): Promise<string> {
  const result = await execGit(cwd, ["rev-parse", "--show-toplevel"]);
  ensureGitSuccess(result, "git repo root");
  return result.stdout.trim();
}

export async function hasBranch(cwd: string, branch: string): Promise<boolean> {
  const result = await execGit(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
  return result.code === 0;
}

function emptyWorktree(path: string): GitWorktreeInfo {
  return { path, detached: false, bare: false };
}

function finishWorktree(current: GitWorktreeInfo | undefined, worktrees: GitWorktreeInfo[]): void {
  if (!current) return;
  if (!current.branch && !current.bare && current.head) current.detached = true;
  worktrees.push(current);
}

export function parseGitWorktreeListPorcelain(output: string): GitWorktreeInfo[] {
  const worktrees: GitWorktreeInfo[] = [];
  let current: GitWorktreeInfo | undefined;
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) {
      finishWorktree(current, worktrees);
      current = undefined;
      continue;
    }
    if (line.startsWith("worktree ")) {
      finishWorktree(current, worktrees);
      current = emptyWorktree(line.slice("worktree ".length));
      continue;
    }
    if (!current) continue;
    if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      const branch = line.slice("branch ".length);
      current.branch = branch.startsWith("refs/heads/") ? branch.slice("refs/heads/".length) : branch;
      current.detached = false;
    } else if (line === "detached") {
      current.detached = true;
    } else if (line === "bare") {
      current.bare = true;
    } else if (line.startsWith("locked")) {
      current.locked = true;
      const reason = line.slice("locked".length).trim();
      if (reason) current.reason = reason;
    } else if (line.startsWith("prunable")) {
      current.prunable = true;
      const reason = line.slice("prunable".length).trim();
      if (reason && !current.reason) current.reason = reason;
    }
  }
  finishWorktree(current, worktrees);
  return worktrees;
}

export async function listWorktrees(cwd: string): Promise<GitWorktreeInfo[]> {
  const result = await execGit(cwd, ["worktree", "list", "--porcelain"]);
  ensureGitSuccess(result, "git worktree list");
  return parseGitWorktreeListPorcelain(result.stdout);
}

export async function findWorktreeByBranch(cwd: string, branch: string): Promise<GitWorktreeInfo | undefined> {
  return (await listWorktrees(cwd)).find((worktree) => worktree.branch === branch);
}
