import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { currentBranch, execGit, hasBranch, listWorktrees, repoRoot as gitRepoRoot, statusSummary } from "./git-runtime";
import { assertSafeBranchName } from "./safe-identifiers";

export interface BranchSwitchGuardParams {
  repoRoot?: string;
  targetBranch: string;
  createIfMissing?: boolean;
  baseRef?: string;
  detachOtherCleanWorktree?: boolean;
  dryRun?: boolean;
}

export interface BranchSwitchGuardResult {
  ok: boolean;
  action: "already-on-target" | "switched" | "created-and-switched" | "blocked" | "dry-run";
  repoRoot: string;
  cwd: string;
  previousBranch?: string;
  targetBranch: string;
  occupiedBy: Array<{
    path: string;
    branch: string;
    dirty: boolean;
  }>;
  detachedOtherWorktree: boolean;
  blockers: string[];
  commands: string[];
}

interface BranchSwitchGuardContext {
  cwd?: string;
}

const BranchSwitchGuardParamsSchema = Type.Object({
  repoRoot: Type.Optional(Type.String({ description: "Repository/worktree root. Defaults to the current Pi session cwd git root." })),
  targetBranch: Type.String({ description: "Branch to switch to in the current cwd." }),
  createIfMissing: Type.Optional(Type.Boolean({ description: "Create the target branch from baseRef when it does not exist." })),
  baseRef: Type.Optional(Type.String({ description: "Base ref used when createIfMissing is true." })),
  detachOtherCleanWorktree: Type.Optional(Type.Boolean({ description: "Detach another clean worktree that currently occupies targetBranch before switching." })),
  dryRun: Type.Optional(Type.Boolean({ description: "Return the planned action without executing git commands." })),
});

function commandText(args: string[]): string {
  return ["git", ...args].join(" ");
}

function commandTextForCwd(cwd: string, args: string[]): string {
  return ["git", "-C", cwd, ...args].join(" ");
}

function normalizePath(path: string): string {
  return path.replace(/\\+/g, "/").replace(/\/+$/, "");
}

function blockedResult(base: Omit<BranchSwitchGuardResult, "ok" | "action">): BranchSwitchGuardResult {
  return { ...base, ok: false, action: "blocked" };
}

async function worktreeDirty(path: string): Promise<boolean> {
  try {
    return (await statusSummary(path)).dirty;
  } catch {
    return true;
  }
}

export async function runBranchSwitchGuard(
  params: BranchSwitchGuardParams,
  context: BranchSwitchGuardContext = {},
): Promise<BranchSwitchGuardResult> {
  const cwd = params.repoRoot?.trim() || context.cwd || process.cwd();
  const commands: string[] = [];
  const blockers: string[] = [];
  const occupiedBy: BranchSwitchGuardResult["occupiedBy"] = [];
  let detachedOtherWorktree = false;
  let targetBranch: string;
  try {
    targetBranch = assertSafeBranchName(params.targetBranch, "targetBranch");
  } catch (error) {
    return blockedResult({
      repoRoot: cwd,
      cwd,
      targetBranch: params.targetBranch.trim(),
      occupiedBy,
      detachedOtherWorktree,
      blockers: [error instanceof Error ? error.message : String(error)],
      commands,
    });
  }

  let root: string;
  try {
    root = await gitRepoRoot(cwd);
  } catch (error) {
    return blockedResult({
      repoRoot: cwd,
      cwd,
      targetBranch,
      occupiedBy,
      detachedOtherWorktree,
      blockers: [`repo root check failed: ${error instanceof Error ? error.message : String(error)}`],
      commands,
    });
  }

  const previousBranch = await currentBranch(root) ?? undefined;
  const base = () => ({ repoRoot: root, cwd, previousBranch, targetBranch, occupiedBy, detachedOtherWorktree, blockers, commands });

  if (previousBranch === targetBranch) {
    return { ...base(), ok: true, action: "already-on-target" };
  }

  const currentStatus = await statusSummary(root);
  if (currentStatus.dirty) blockers.push("current cwd is dirty; commit, stash, or revert changes before switching branches.");

  let worktrees = [] as Awaited<ReturnType<typeof listWorktrees>>;
  try {
    worktrees = await listWorktrees(root);
  } catch (error) {
    blockers.push(`branch occupancy check failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const currentRoot = normalizePath(root);
  for (const worktree of worktrees) {
    if (worktree.branch !== targetBranch || normalizePath(worktree.path) === currentRoot) continue;
    const dirty = await worktreeDirty(worktree.path);
    occupiedBy.push({ path: worktree.path, branch: targetBranch, dirty });
    if (dirty) blockers.push(`target branch is checked out in another dirty worktree: ${worktree.path}`);
  }

  const cleanOccupied = occupiedBy.filter((worktree) => !worktree.dirty);
  if (cleanOccupied.length > 0 && !params.detachOtherCleanWorktree) {
    blockers.push("target branch is checked out in another clean worktree; set detachOtherCleanWorktree=true to detach it first.");
  }

  const branchExists = await hasBranch(root, targetBranch);
  if (!branchExists && !params.createIfMissing) blockers.push(`target branch does not exist: ${targetBranch}`);

  const switchArgs = branchExists ? ["switch", targetBranch] : ["switch", "-c", targetBranch, params.baseRef || "HEAD"];
  for (const worktree of cleanOccupied) commands.push(commandTextForCwd(worktree.path, ["switch", "--detach"]));
  commands.push(commandText(switchArgs));

  if (blockers.length > 0) return blockedResult(base());
  if (params.dryRun) return { ...base(), ok: true, action: "dry-run" };

  for (const worktree of cleanOccupied) {
    const detach = await execGit(worktree.path, ["switch", "--detach"]);
    if (detach.code !== 0) {
      blockers.push(`failed to detach clean worktree ${worktree.path}: ${detach.stderr.trim() || detach.stdout.trim() || detach.code}`);
      return blockedResult(base());
    }
    detachedOtherWorktree = true;
  }

  const switched = await execGit(root, switchArgs);
  if (switched.code !== 0) {
    blockers.push(`git switch failed: ${switched.stderr.trim() || switched.stdout.trim() || switched.code}`);
    return blockedResult(base());
  }

  return { ...base(), ok: true, action: branchExists ? "switched" : "created-and-switched" };
}

export function formatBranchSwitchGuardResult(result: BranchSwitchGuardResult): string {
  const lines = [`branch_switch_guard: ${result.ok ? result.action : "blocked"}`];
  lines.push(`repoRoot: ${result.repoRoot}`);
  lines.push(`cwd: ${result.cwd}`);
  lines.push(`targetBranch: ${result.targetBranch}`);
  if (result.previousBranch) lines.push(`previousBranch: ${result.previousBranch}`);
  if (result.occupiedBy.length > 0) {
    lines.push("occupiedBy:");
    lines.push(...result.occupiedBy.map((worktree) => `- ${worktree.path} (${worktree.branch}, dirty:${worktree.dirty ? "yes" : "no"})`));
  }
  if (result.detachedOtherWorktree) lines.push("detachedOtherWorktree: yes");
  if (result.commands.length > 0) {
    lines.push("commands:");
    lines.push(...result.commands.map((command) => `- ${command}`));
  }
  if (result.blockers.length > 0) {
    lines.push("blockers:");
    lines.push(...result.blockers.map((blocker) => `- ${blocker}`));
  }
  return lines.join("\n");
}

export function registerBranchSwitchGuardTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "branch_switch_guard",
    label: "Branch switch guard",
    description: "Safely switch the current Pi session cwd to a target branch after dirty-state and worktree occupancy checks.",
    promptSnippet: "branch_switch_guard: safely switch a single-branch task in the current cwd after dirty and worktree occupancy checks.",
    promptGuidelines: [
      "Use branch_switch_guard before git switch for single-branch work.",
      "Keep single-branch work in the current Pi session cwd; use worktrees only for parallel, multi-session, or explicitly isolated work.",
      "Never force switch, hard reset, git clean, or delete branches from branch_switch_guard.",
    ],
    parameters: BranchSwitchGuardParamsSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx?: { cwd?: string }) {
      const result = await runBranchSwitchGuard(params as BranchSwitchGuardParams, { cwd: ctx?.cwd });
      return {
        content: [{ type: "text", text: formatBranchSwitchGuardResult(result) }],
        details: { result },
      };
    },
  });
}
