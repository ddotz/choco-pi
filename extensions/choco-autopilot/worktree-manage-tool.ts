import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { currentBranch, execGit, hasBranch, listWorktrees, repoRoot as gitRepoRoot, statusSummary, type GitWorktreeInfo } from "./git-runtime";
import { normalizeWorktreePath, pathExists, resolveWorktreePlan } from "./worktree-runtime";

export type WorktreeManageAction = "plan" | "create" | "list" | "status" | "handoff" | "merge_ready" | "remove";

export interface WorktreeManageParams {
  action: WorktreeManageAction;
  repoRoot?: string;
  sessionId?: string;
  taskName?: string;
  groupId?: string;
  laneId?: string;
  baseRef?: string;
  branchName?: string;
  path?: string;
  requireClean?: boolean;
  allowExisting?: boolean;
}

export interface WorktreeManageResult {
  ok: boolean;
  action: WorktreeManageAction;
  repoRoot: string;
  branchName?: string;
  path?: string;
  worktrees?: GitWorktreeInfo[];
  dirty?: boolean;
  blockers: string[];
  commands: string[];
  handoffPrompt?: string;
}

interface WorktreeManageContext {
  cwd?: string;
  homeDir?: string;
}

const WorktreeManageParamsSchema = Type.Object({
  action: Type.Union([
    Type.Literal("plan"),
    Type.Literal("create"),
    Type.Literal("list"),
    Type.Literal("status"),
    Type.Literal("handoff"),
    Type.Literal("merge_ready"),
    Type.Literal("remove"),
  ]),
  repoRoot: Type.Optional(Type.String({ description: "Repository/worktree root. Defaults to current cwd git root." })),
  sessionId: Type.Optional(Type.String({ description: "Pi session id used for deterministic branch/path planning." })),
  taskName: Type.Optional(Type.String({ description: "Human task name used for deterministic branch/path planning." })),
  groupId: Type.Optional(Type.String({ description: "Optional agent run group id for handoff prompts." })),
  laneId: Type.Optional(Type.String({ description: "Optional lane id for handoff prompts." })),
  baseRef: Type.Optional(Type.String({ description: "Base ref used when creating a missing branch." })),
  branchName: Type.Optional(Type.String({ description: "Branch name for create/status/handoff." })),
  path: Type.Optional(Type.String({ description: "Worktree path for create/status/remove/handoff." })),
  requireClean: Type.Optional(Type.Boolean({ description: "Require a clean worktree for status/merge_ready." })),
  allowExisting: Type.Optional(Type.Boolean({ description: "Allow an existing path only if it is already a registered worktree." })),
});

function commandText(args: string[]): string {
  return ["git", ...args].join(" ");
}

function blocked(base: Omit<WorktreeManageResult, "ok">): WorktreeManageResult {
  return { ...base, ok: false };
}

function missingPlanBlockers(action: WorktreeManageAction, branchName: string | undefined, path: string | undefined): string[] {
  const blockers: string[] = [];
  if ((action === "create" || action === "handoff") && !branchName) blockers.push("branchName or sessionId/taskName is required.");
  if ((action === "create" || action === "status" || action === "remove" || action === "merge_ready" || action === "handoff") && !path) blockers.push("path or sessionId/taskName is required.");
  return blockers;
}

async function resolveRepoRoot(input: WorktreeManageParams, context: WorktreeManageContext): Promise<{ root: string; blockers: string[] }> {
  const cwd = input.repoRoot?.trim() || context.cwd || process.cwd();
  try {
    return { root: await gitRepoRoot(cwd), blockers: [] };
  } catch (error) {
    return { root: cwd, blockers: [`repo root check failed: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

function buildHandoffPrompt(input: WorktreeManageParams, root: string, branchName: string | undefined, path: string | undefined): string {
  return [
    "# choco-pi lane handoff",
    `groupId: ${input.groupId ?? "none"}`,
    `laneId: ${input.laneId ?? "none"}`,
    `repoRoot: ${root}`,
    `cwd: ${path ?? root}`,
    `branch: ${branchName ?? "unknown"}`,
    "Allowed write scope: use the lane manifest/parallel_work_plan ownership for this lane; do not write outside it.",
    "Before completion: run lane-local verification and report evidence.",
  ].join("\n");
}

async function registeredWorktreeForPath(root: string, path: string): Promise<GitWorktreeInfo | undefined> {
  const normalized = normalizeWorktreePath(path);
  return (await listWorktrees(root)).find((worktree) => normalizeWorktreePath(worktree.path) === normalized);
}

export async function runWorktreeManage(
  input: WorktreeManageParams,
  context: WorktreeManageContext = {},
): Promise<WorktreeManageResult> {
  const { root, blockers: rootBlockers } = await resolveRepoRoot(input, context);
  const plan = resolveWorktreePlan({
    repoRoot: root,
    sessionId: input.sessionId,
    taskName: input.taskName,
    branchName: input.branchName,
    path: input.path,
    homeDir: context.homeDir,
  });
  const blockers = [...rootBlockers, ...missingPlanBlockers(input.action, plan.branchName, plan.path)];
  const commands: string[] = [];
  const base = (): Omit<WorktreeManageResult, "ok"> => ({
    action: input.action,
    repoRoot: root,
    branchName: plan.branchName,
    path: plan.path,
    blockers,
    commands,
  });

  if (blockers.length > 0) return blocked(base());

  if (input.action === "plan") return { ...base(), ok: true };

  if (input.action === "list") {
    const worktrees = await listWorktrees(root);
    return { ...base(), ok: true, worktrees };
  }

  if (input.action === "handoff") {
    return { ...base(), ok: true, handoffPrompt: buildHandoffPrompt(input, root, plan.branchName, plan.path) };
  }

  if (input.action === "status" || input.action === "merge_ready") {
    const targetPath = plan.path ?? root;
    const summary = await statusSummary(targetPath);
    const branchName = await currentBranch(targetPath) ?? plan.branchName;
    if (input.requireClean && summary.dirty) blockers.push("worktree is dirty but requireClean=true.");
    if (input.action === "merge_ready" && summary.dirty) blockers.push("dirty worktree is not merge-ready.");
    return { ...base(), ok: blockers.length === 0, branchName, dirty: summary.dirty };
  }

  if (input.action === "remove") {
    const targetPath = plan.path!;
    const summary = await statusSummary(targetPath);
    if (summary.dirty) blockers.push("dirty worktree remove is blocked.");
    commands.push(commandText(["worktree", "remove", targetPath]));
    if (blockers.length > 0) return { ...base(), ok: false, dirty: summary.dirty };
    const removed = await execGit(root, ["worktree", "remove", targetPath]);
    if (removed.code !== 0) {
      blockers.push(`git worktree remove failed: ${removed.stderr.trim() || removed.stdout.trim() || removed.code}`);
      return { ...base(), ok: false, dirty: summary.dirty };
    }
    return { ...base(), ok: true, dirty: false };
  }

  const targetPath = plan.path!;
  const targetBranch = plan.branchName!;
  const worktrees = await listWorktrees(root);
  const occupied = worktrees.find((worktree) => worktree.branch === targetBranch);
  if (occupied) blockers.push(`branch is already checked out in worktree: ${occupied.path}`);

  if (await pathExists(targetPath)) {
    if (!input.allowExisting) blockers.push(`path already exists: ${targetPath}`);
    else if (!await registeredWorktreeForPath(root, targetPath)) blockers.push(`existing path is not a registered git worktree: ${targetPath}`);
  }

  const branchExists = await hasBranch(root, targetBranch);
  const createArgs = branchExists
    ? ["worktree", "add", targetPath, targetBranch]
    : ["worktree", "add", "-b", targetBranch, targetPath, input.baseRef || "HEAD"];
  commands.push(commandText(createArgs));

  if (blockers.length > 0) return blocked(base());

  const created = await execGit(root, createArgs);
  if (created.code !== 0) {
    blockers.push(`git worktree add failed: ${created.stderr.trim() || created.stdout.trim() || created.code}`);
    return blocked(base());
  }
  return { ...base(), ok: true };
}

export function formatWorktreeManageResult(result: WorktreeManageResult): string {
  const lines = [`worktree_manage: ${result.action} ${result.ok ? "ok" : "blocked"}`];
  lines.push(`repoRoot: ${result.repoRoot}`);
  if (result.branchName) lines.push(`branchName: ${result.branchName}`);
  if (result.path) lines.push(`path: ${result.path}`);
  if (typeof result.dirty === "boolean") lines.push(`dirty: ${result.dirty ? "yes" : "no"}`);
  if (result.worktrees) {
    lines.push("worktrees:");
    lines.push(...result.worktrees.map((worktree) => `- ${worktree.path} ${worktree.branch ?? "detached"}${worktree.detached ? " detached" : ""}`));
  }
  if (result.handoffPrompt) lines.push("handoffPrompt:", result.handoffPrompt);
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

export function registerWorktreeManageTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "worktree_manage",
    label: "Worktree manage",
    description: "Plan, create, list, inspect, hand off, merge-check, and remove clean git worktrees for choco-pi multi-session work.",
    promptSnippet: "worktree_manage: plan/create/list/status/handoff/merge_ready/remove isolated git worktrees for multi-session lanes.",
    promptGuidelines: [
      "Use worktree_manage for parallel or multi-session worktree lifecycle actions after parallel_work_plan.",
      "Never remove dirty worktrees; worktree_manage remove is clean-only and does not delete branches.",
      "Do not use worktree_manage for ordinary single-branch work; use branch_switch_guard in the current cwd instead.",
    ],
    parameters: WorktreeManageParamsSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx?: { cwd?: string }) {
      const result = await runWorktreeManage(params as WorktreeManageParams, { cwd: ctx?.cwd });
      return {
        content: [{ type: "text", text: formatWorktreeManageResult(result) }],
        details: { result },
      };
    },
  });
}
