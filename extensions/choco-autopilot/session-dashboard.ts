import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { currentBranch, listWorktrees, repoRoot as gitRepoRoot, statusSummary } from "./git-runtime";
import { summarizeAgentRunManifest, type AgentRunManifest } from "./agent-run-manifest";
import { autonomyProtocolKey, summarizeAutonomyProtocol, type AutonomyProtocolKind } from "./autonomy-protocol";
import { sessionIdFromContext, sessionScopedKey } from "./session-scope";

export interface SessionDashboardAutonomyInput {
  protocol: AutonomyProtocolKind | "none";
  required?: string[];
  satisfied?: string[];
  missing?: string[];
  blocked?: string[];
}

export interface SessionDashboardActiveLaneInput {
  groupId: string;
  laneId: string;
  readOnly: boolean;
}

export interface SessionDashboardInput {
  sessionId: string;
  cwd: string;
  branch?: string | null;
  mode?: string;
  todos?: string;
  ledger?: string;
  manifests?: string[];
  worktrees?: string[];
  autonomy?: SessionDashboardAutonomyInput;
  activeLane?: SessionDashboardActiveLaneInput;
}

function formatList(values: string[] | undefined): string {
  return values?.length ? values.join(", ") : "none";
}

export function formatSessionDashboard(input: SessionDashboardInput): string {
  const autonomy = input.autonomy ?? { protocol: "none" as const, required: [], satisfied: [], missing: [], blocked: [] };
  return [
    "# choco-pi sessions",
    `session: ${input.sessionId}`,
    `cwd: ${input.cwd}`,
    `branch: ${input.branch ?? "unknown"}`,
    `mode: ${input.mode ?? "unknown"}`,
    `todos: ${input.todos ?? "none"}`,
    `ledger: ${input.ledger ?? "none"}`,
    "autonomy:",
    `- protocol: ${autonomy.protocol}`,
    `- required: ${formatList(autonomy.required)}`,
    `- satisfied: ${formatList(autonomy.satisfied)}`,
    `- missing: ${formatList(autonomy.missing)}`,
    ...(autonomy.blocked?.length ? [`- blocked: ${formatList(autonomy.blocked)}`] : []),
    "active lane:",
    ...(input.activeLane ? [
      `- groupId: ${input.activeLane.groupId}`,
      `- laneId: ${input.activeLane.laneId}`,
      `- readOnly: ${input.activeLane.readOnly}`,
    ] : ["- none"]),
    "manifests:",
    ...(input.manifests?.length ? input.manifests.map((item) => `- ${item}`) : ["- none"]),
    "worktrees:",
    ...(input.worktrees?.length ? input.worktrees.map((item) => `- ${item}`) : ["- none"]),
  ].join("\n");
}

async function todoSummary(cwd: string, sessionId: string): Promise<string> {
  const path = join(cwd, ".pi", "sessions", sessionId, "todos.json");
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as { todos?: Array<{ status?: string }> } | Array<{ status?: string }>;
    const todos = Array.isArray(parsed) ? parsed : Array.isArray(parsed.todos) ? parsed.todos : [];
    const active = todos.filter((todo) => todo.status === "in_progress").length;
    const pending = todos.filter((todo) => todo.status === "pending").length;
    const done = todos.filter((todo) => todo.status === "done").length;
    return `${active} active / ${pending} pending / ${done} done`;
  } catch {
    return "none";
  }
}

async function manifestScanRoot(cwd: string): Promise<string> {
  return await gitRepoRoot(cwd).catch(() => cwd);
}

async function manifestSummaries(cwd: string): Promise<string[]> {
  const root = await manifestScanRoot(cwd);
  try {
    const groupIds = await readdir(join(root, ".pi", "agent-runs"));
    const summaries: string[] = [];
    for (const groupId of groupIds) {
      try {
        const manifest = JSON.parse(await readFile(join(root, ".pi", "agent-runs", groupId, "manifest.json"), "utf8")) as AgentRunManifest;
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

interface DashboardModeState {
  runtime?: { workMode?: string; executionIntensity?: string };
  sessions?: Record<string, { effectiveWorkMode?: string; executionIntensity?: string }>;
  autonomyProtocols?: Record<string, Parameters<typeof summarizeAutonomyProtocol>[0]>;
  activeLanes?: Record<string, { groupId: string; laneId: string; readOnly: boolean; sessionId?: string; cwd?: string }>;
}

type DashboardStateReader = () => Promise<DashboardModeState>;

async function modeSummary(readState: DashboardStateReader | undefined, sessionId: string): Promise<string> {
  if (!readState) return "default";
  try {
    const state = await readState();
    const persistent = state.runtime?.workMode ?? "default";
    const session = state.sessions?.[sessionId];
    const effective = session?.effectiveWorkMode ?? persistent;
    const intensity = session?.executionIntensity ?? state.runtime?.executionIntensity ?? "standard";
    return effective === persistent ? `${persistent}/${intensity}` : `${persistent}->${effective}/${intensity}`;
  } catch {
    return "default";
  }
}

async function dashboardState(readState: DashboardStateReader | undefined): Promise<DashboardModeState | undefined> {
  try {
    return await readState?.();
  } catch {
    return undefined;
  }
}

function activeLaneSummary(state: DashboardModeState | undefined, cwd: string, sessionId: string): SessionDashboardActiveLaneInput | undefined {
  const lanes = state?.activeLanes ?? {};
  return lanes[sessionScopedKey(cwd, sessionId)] ?? lanes[sessionId];
}

export function registerSessionDashboardCommand(pi: Pick<ExtensionAPI, "registerCommand">, readState?: DashboardStateReader): void {
  pi.registerCommand("sessions", {
    description: "Show session, branch, todo, ledger, manifest, and worktree status",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const cwd = ctx.cwd || process.cwd();
      const sessionId = sessionIdFromContext(ctx as never);
      const state = await dashboardState(readState);
      const protocol = state?.autonomyProtocols?.[autonomyProtocolKey(cwd, sessionId)];
      const text = formatSessionDashboard({
        sessionId,
        cwd,
        branch: await currentBranch(cwd).catch(() => null),
        mode: await modeSummary(readState, sessionId),
        todos: await todoSummary(cwd, sessionId),
        ledger: "see /ledger for detailed context ledger",
        autonomy: summarizeAutonomyProtocol(protocol),
        activeLane: activeLaneSummary(state, cwd, sessionId),
        manifests: await manifestSummaries(cwd),
        worktrees: await worktreeSummaries(cwd),
      });
      ctx.ui?.notify?.(text, "info");
    },
  });
}
