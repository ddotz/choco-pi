import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  createAgentRunManifest,
  loadAgentRunManifest,
  summarizeAgentRunManifest,
  updateAgentLaneStatus,
  updateAgentRunManifest,
  type AgentLaneManifest,
  type AgentRunManifest,
  type AgentLaneStatus,
} from "./agent-run-manifest";
import type { ParallelWorkAreaPlan } from "./worktree-planner";

const FALLBACK_ACTIVE_SESSION_ID = "session-default";

export type AgentOrchestratorAction =
  | "start"
  | "dispatch"
  | "lane_status"
  | "mark_running"
  | "mark_blocked"
  | "mark_failed"
  | "mark_verified"
  | "activate_lane"
  | "deactivate_lane"
  | "summarize"
  | "close";

export interface AgentOrchestratorParams {
  action: AgentOrchestratorAction;
  groupId?: string;
  repoRoot?: string;
  goal?: string;
  baseRef?: string;
  laneId?: string;
  verificationCommands?: string[];
  evidence?: string;
  error?: string;
  plan?: ParallelWorkAreaPlan;
}

export interface AgentOrchestratorResult {
  ok: boolean;
  action: AgentOrchestratorAction;
  groupId?: string;
  repoRoot: string;
  blockers: string[];
  summary?: string;
  handoffPrompts: string[];
  manifest?: AgentRunManifest;
}

export interface ActiveLaneContext {
  groupId: string;
  laneId: string;
  repoRoot: string;
  ownedFiles: string[];
  ownedDomains: string[];
  executionStrategy: AgentLaneManifest["executionStrategy"];
  readOnly: boolean;
}

export interface ActiveLaneStore {
  activate(sessionId: string, cwd: string, context: ActiveLaneContext): Promise<void>;
  deactivate(sessionId: string, cwd?: string): Promise<void>;
}

interface AgentOrchestratorContext {
  cwd?: string;
  sessionId?: string;
}

const AgentOrchestratorParamsSchema = Type.Object({
  action: Type.Union([
    Type.Literal("start"),
    Type.Literal("dispatch"),
    Type.Literal("lane_status"),
    Type.Literal("mark_running"),
    Type.Literal("mark_blocked"),
    Type.Literal("mark_failed"),
    Type.Literal("mark_verified"),
    Type.Literal("activate_lane"),
    Type.Literal("deactivate_lane"),
    Type.Literal("summarize"),
    Type.Literal("close"),
  ]),
  groupId: Type.Optional(Type.String()),
  repoRoot: Type.Optional(Type.String()),
  goal: Type.Optional(Type.String()),
  baseRef: Type.Optional(Type.String()),
  laneId: Type.Optional(Type.String()),
  verificationCommands: Type.Optional(Type.Array(Type.String())),
  evidence: Type.Optional(Type.String()),
  error: Type.Optional(Type.String()),
  plan: Type.Optional(Type.Any()),
});

function laneIsWritable(lane: AgentLaneManifest): boolean {
  return lane.writable ?? (lane.ownedFiles.length > 0 || lane.ownedDomains.length > 0);
}

function laneDependenciesVerified(lane: AgentLaneManifest, manifest: AgentRunManifest): boolean {
  return lane.blockedByLaneIds.every((laneId) => {
    const dependency = manifest.lanes.find((candidate) => candidate.id === laneId);
    return dependency?.status === "verified" || dependency?.status === "ready-to-integrate" || dependency?.status === "integrated";
  });
}

function handoffPrompt(manifest: AgentRunManifest, lane: AgentLaneManifest): string {
  const activeLaneContext = JSON.stringify({
    groupId: manifest.groupId,
    laneId: lane.id,
    repoRoot: manifest.repoRoot,
    ownedFiles: lane.ownedFiles,
    ownedDomains: lane.ownedDomains,
    executionStrategy: lane.executionStrategy,
    readOnly: !laneIsWritable(lane),
  });
  return [
    "# choco-pi agent lane handoff",
    `groupId: ${manifest.groupId}`,
    `laneId: ${lane.id}`,
    `repoRoot: ${manifest.repoRoot}`,
    `executionStrategy: ${lane.executionStrategy}`,
    `worktreePath: ${lane.worktreePath ?? "none"}`,
    `branchName: ${lane.branchName ?? "none"}`,
    `items: ${lane.itemIds.join(", ")}`,
    `descriptions: ${lane.descriptions.join("; ")}`,
    `ownedFiles: ${lane.ownedFiles.join(", ") || "none"}`,
    `ownedDomains: ${lane.ownedDomains.join(", ") || "none"}`,
    `export CHOCO_PI_ACTIVE_LANE_CONTEXT='${activeLaneContext}'`,
  ].join("\n");
}

function rootFrom(input: AgentOrchestratorParams, context: AgentOrchestratorContext): string {
  return input.repoRoot || context.cwd || process.cwd();
}

async function requireManifest(input: AgentOrchestratorParams, context: AgentOrchestratorContext): Promise<AgentRunManifest> {
  if (!input.groupId) throw new Error("groupId is required");
  return await loadAgentRunManifest(rootFrom(input, context), input.groupId);
}

function resultBase(input: AgentOrchestratorParams, root: string): AgentOrchestratorResult {
  return { ok: false, action: input.action, groupId: input.groupId, repoRoot: root, blockers: [], handoffPrompts: [] };
}

function activeLaneContext(manifest: AgentRunManifest, lane: AgentLaneManifest): ActiveLaneContext {
  return {
    groupId: manifest.groupId,
    laneId: lane.id,
    repoRoot: manifest.repoRoot,
    ownedFiles: lane.ownedFiles,
    ownedDomains: lane.ownedDomains,
    executionStrategy: lane.executionStrategy,
    readOnly: !laneIsWritable(lane),
  };
}

export async function runAgentOrchestrator(
  input: AgentOrchestratorParams,
  context: AgentOrchestratorContext = {},
  activeLaneStore?: ActiveLaneStore,
): Promise<AgentOrchestratorResult> {
  const root = rootFrom(input, context);
  const result = resultBase(input, root);

  if (input.action === "start") {
    if (!input.plan) return { ...result, blockers: ["plan is required for start; pass the parallel_work_plan result."] };
    const manifest = await createAgentRunManifest({ repoRoot: root, groupId: input.groupId, baseRef: input.baseRef, plan: input.plan });
    return { ...result, ok: true, groupId: manifest.groupId, manifest, summary: summarizeAgentRunManifest(manifest) };
  }

  if (input.action === "deactivate_lane") {
    if (!activeLaneStore) return { ...result, blockers: ["active lane store is unavailable."] };
    await activeLaneStore.deactivate(context.sessionId ?? FALLBACK_ACTIVE_SESSION_ID, context.cwd);
    return { ...result, ok: true, summary: "active lane deactivated" };
  }

  const manifest = await requireManifest(input, context);
  result.groupId = manifest.groupId;

  if (input.action === "summarize" || input.action === "lane_status") {
    return { ...result, ok: true, manifest, summary: summarizeAgentRunManifest(manifest) };
  }

  if (input.action === "close") {
    const closed = await updateAgentRunManifest(manifest.repoRoot, manifest.groupId, (draft) => {
      draft.status = "closed";
    });
    return { ...result, ok: true, manifest: closed, summary: summarizeAgentRunManifest(closed) };
  }

  if (input.action === "dispatch") {
    const blockers: string[] = [];
    const prompts: string[] = [];
    const dispatchableLaneIds: string[] = [];
    for (const lane of manifest.lanes.filter((candidate) => candidate.status === "planned" || candidate.status === "created")) {
      if (lane.executionStrategy === "serial") {
        blockers.push(`${lane.id}: serial lane cannot be dispatched as a parallel handoff.`);
        continue;
      }
      if (!laneDependenciesVerified(lane, manifest)) {
        blockers.push(`${lane.id}: dependency lanes are not verified.`);
        continue;
      }
      if (lane.executionStrategy === "worktree" && laneIsWritable(lane) && !lane.worktreePath) {
        blockers.push(`${lane.id}: writable lane requires worktreePath before dispatch.`);
        continue;
      }
      prompts.push(handoffPrompt(manifest, lane));
      dispatchableLaneIds.push(lane.id);
    }
    if (blockers.length > 0) return { ...result, blockers, manifest };
    await updateAgentRunManifest(manifest.repoRoot, manifest.groupId, (draft) => {
      draft.status = "dispatching";
      for (const lane of draft.lanes) {
        if (dispatchableLaneIds.includes(lane.id)) {
          lane.status = "dispatched";
          lane.updatedAt = new Date().toISOString();
        }
      }
    });
    return { ...result, ok: true, manifest: await loadAgentRunManifest(manifest.repoRoot, manifest.groupId), handoffPrompts: prompts };
  }

  if (!input.laneId) return { ...result, blockers: ["laneId is required for lane update actions."], manifest };

  if (input.action === "activate_lane") {
    if (!activeLaneStore) return { ...result, blockers: ["active lane store is unavailable."], manifest };
    const lane = manifest.lanes.find((candidate) => candidate.id === input.laneId);
    if (!lane) return { ...result, blockers: [`Unknown lane id: ${input.laneId}`], manifest };
    await activeLaneStore.activate(context.sessionId ?? FALLBACK_ACTIVE_SESSION_ID, context.cwd ?? manifest.repoRoot, activeLaneContext(manifest, lane));
    return { ...result, ok: true, manifest, summary: `active lane ${lane.id} activated` };
  }

  const statusByAction: Partial<Record<AgentOrchestratorAction, AgentLaneStatus>> = {
    mark_running: "running",
    mark_blocked: "blocked",
    mark_failed: "failed",
    mark_verified: "verified",
  };
  const status = statusByAction[input.action];
  if (!status) return { ...result, blockers: [`Unsupported action: ${input.action}`], manifest };
  if (input.action === "mark_verified" && !input.evidence?.trim() && (!input.verificationCommands || input.verificationCommands.length === 0)) {
    return { ...result, blockers: ["evidence or verificationCommands is required before marking a lane verified."], manifest };
  }
  const patch: Partial<AgentLaneManifest> = {};
  if (input.verificationCommands) patch.verificationCommands = input.verificationCommands;
  if (input.evidence?.trim()) patch.verificationEvidence = input.evidence.trim();
  if (input.action === "mark_verified") patch.verifiedAt = new Date().toISOString();
  if (input.error) patch.lastError = input.error;
  const updated = await updateAgentLaneStatus(manifest.repoRoot, manifest.groupId, input.laneId, status, patch);
  return { ...result, ok: true, manifest: updated, summary: summarizeAgentRunManifest(updated) };
}

export function formatAgentOrchestratorResult(result: AgentOrchestratorResult): string {
  const lines = [`agent_orchestrator: ${result.action} ${result.ok ? "ok" : "blocked"}`];
  if (result.groupId) lines.push(`groupId: ${result.groupId}`);
  lines.push(`repoRoot: ${result.repoRoot}`);
  if (result.summary) lines.push("summary:", result.summary);
  if (result.handoffPrompts.length > 0) lines.push("handoffPrompts:", ...result.handoffPrompts.map((prompt) => `---\n${prompt}`));
  if (result.blockers.length > 0) lines.push("blockers:", ...result.blockers.map((blocker) => `- ${blocker}`));
  return lines.join("\n");
}

function sessionIdFromContext(ctx: unknown): string | undefined {
  const value = ctx as { sessionId?: string; sessionManager?: { getSessionId?: () => string } } | undefined;
  return value?.sessionId ?? value?.sessionManager?.getSessionId?.();
}

export function registerAgentOrchestratorTool(pi: ExtensionAPI, activeLaneStore?: ActiveLaneStore): void {
  pi.registerTool({
    name: "agent_orchestrator",
    label: "Agent orchestrator",
    description: "Connect parallel work plans, durable manifests, worktree lanes, and handoff prompts.",
    promptSnippet: "agent_orchestrator: start/dispatch/status/update/close manifest-backed parallel agent runs.",
    promptGuidelines: [
      "Use agent_orchestrator start after parallel_work_plan when moving from planning to multi-session execution.",
      "Writable worktree lanes need worktree_manage-created worktreePath before dispatch.",
      "Do not mark a lane verified without evidence or verification commands.",
    ],
    parameters: AgentOrchestratorParamsSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx?: { cwd?: string }) {
      const result = await runAgentOrchestrator(params as AgentOrchestratorParams, { cwd: ctx?.cwd, sessionId: sessionIdFromContext(ctx) }, activeLaneStore);
      return {
        content: [{ type: "text", text: formatAgentOrchestratorResult(result) }],
        details: { result },
      };
    },
  });
}
