import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { planSessionWorktree } from "./worktree-planner";

export interface WorktreePlanInput {
  repoRoot: string;
  sessionId?: string;
  taskName?: string;
  branchName?: string;
  path?: string;
  homeDir?: string;
}

export interface WorktreeRuntimePlan {
  repoRoot: string;
  branchName?: string;
  path?: string;
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export function normalizeWorktreePath(path: string): string {
  return path.replace(/\\+/g, "/").replace(/\/+$/, "");
}

export function resolveWorktreePlan(input: WorktreePlanInput): WorktreeRuntimePlan {
  if (input.branchName && input.path) {
    return { repoRoot: input.repoRoot, branchName: input.branchName, path: input.path };
  }
  if (!input.sessionId && (!input.branchName || !input.path)) {
    return { repoRoot: input.repoRoot, branchName: input.branchName, path: input.path };
  }
  const sessionPlan = planSessionWorktree({
    repoRoot: input.repoRoot,
    sessionId: input.sessionId ?? "session",
    taskName: input.taskName,
    homeDir: input.homeDir ?? homedir(),
  });
  return {
    repoRoot: input.repoRoot,
    branchName: input.branchName ?? sessionPlan.branchName,
    path: input.path ?? sessionPlan.path,
  };
}
