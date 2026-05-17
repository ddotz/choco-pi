import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { currentBranch, listWorktrees, statusSummary } from "./git-runtime";
import { summarizeAgentRunManifest, type AgentRunManifest } from "./agent-run-manifest";
import { sessionIdFromContext } from "./session-scope";

export interface SessionDashboardInput {
  sessionId: string;
  cwd: string;
  branch?: string | null;
  mode?: string;
  todos?: string;
  ledger?: string;
  manifests?: string[];
  worktrees?: string[];
}

export function formatSessionDashboard(input: SessionDashboardInput): string {
  return [
    "# choco-pi sessions",
    `session: ${input.sessionId}`,
    `cwd: ${input.cwd}`,
    `branch: ${input.branch ?? "unknown"}`,
    `mode: ${input.mode ?? "unknown"}`,
    `todos: ${input.todos ?? "none"}`,
    `ledger: ${input.ledger ?? "none"}`,
    "manifests:",
    ...(input.manifests?.length ? input.manifests.map((item) => `- ${item}`) : ["- none"]),
    "worktrees:",
    ...(input.worktrees?.length ? input.worktrees.map((item) => `- ${item}`) : ["- none"]),
  ].join("\n");
}

async function todoSummary(cwd: string, sessionId: string): Promise<string> {
  const path = join(cwd, ".pi", "sessions", sessionId, "todos.json");
  try {
    const todos = JSON.parse(await readFile(path, "utf8")) as Array<{ status?: string }>;
    const active = todos.filter((todo) => todo.status === "in_progress").length;
    const pending = todos.filter((todo) => todo.status === "pending").length;
    const done = todos.filter((todo) => todo.status === "done").length;
    return `${active} active / ${pending} pending / ${done} done`;
  } catch {
    return "none";
  }
}

async function manifestSummaries(cwd: string): Promise<string[]> {
  try {
    const groupIds = await readdir(join(cwd, ".pi", "agent-runs"));
    const summaries: string[] = [];
    for (const groupId of groupIds) {
      try {
        const manifest = JSON.parse(await readFile(join(cwd, ".pi", "agent-runs", groupId, "manifest.json"), "utf8")) as AgentRunManifest;
        summaries.push(summarizeAgentRunManifest(manifest).split("\n")[0]);
      } catch {
        summaries.push(`${groupId}: unreadable manifest`);
      }
    }
    return summaries;
  } catch {
    return [];
  }
}

async function worktreeSummaries(cwd: string): Promise<string[]> {
  try {
    const worktrees = await listWorktrees(cwd);
    const summaries: string[] = [];
    for (const worktree of worktrees) {
      const dirty = worktree.bare ? false : await statusSummary(worktree.path).then((status) => status.dirty).catch(() => true);
      summaries.push(`${worktree.path} ${worktree.branch ?? "detached"} ${dirty ? "dirty" : "clean"}`);
    }
    return summaries;
  } catch {
    return [];
  }
}

export function registerSessionDashboardCommand(pi: Pick<ExtensionAPI, "registerCommand">): void {
  pi.registerCommand("sessions", {
    description: "Show session, branch, todo, ledger, manifest, and worktree status",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const cwd = ctx.cwd || process.cwd();
      const sessionId = sessionIdFromContext(ctx as never);
      const text = formatSessionDashboard({
        sessionId,
        cwd,
        branch: await currentBranch(cwd).catch(() => null),
        mode: "default",
        todos: await todoSummary(cwd, sessionId),
        ledger: "see /ledger for detailed context ledger",
        manifests: await manifestSummaries(cwd),
        worktrees: await worktreeSummaries(cwd),
      });
      ctx.ui?.notify?.(text, "info");
    },
  });
}
