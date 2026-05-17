import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withFileLock } from "./state-lock";
import type { LaneExecutionStrategy, ParallelStrategy, ParallelWorkAreaPlan } from "./worktree-planner";

export type AgentRunStatus = "planned" | "dispatching" | "running" | "blocked" | "integrating" | "integrated" | "failed" | "closed";
export type AgentLaneStatus = "planned" | "created" | "running" | "blocked" | "failed" | "verified" | "ready-to-integrate" | "integrated";

export interface AgentRunManifest {
  version: 1;
  groupId: string;
  repoRoot: string;
  baseRef: string;
  createdAt: string;
  updatedAt: string;
  goal?: string;
  parallelStrategy: ParallelStrategy;
  status: AgentRunStatus;
  lanes: AgentLaneManifest[];
  integrationEvidence?: string;
}

export interface AgentLaneManifest {
  id: string;
  itemIds: string[];
  descriptions: string[];
  executionStrategy: LaneExecutionStrategy;
  branchName?: string;
  worktreePath?: string;
  ownedFiles: string[];
  ownedDomains: string[];
  blockedByLaneIds: string[];
  status: AgentLaneStatus;
  verificationCommands: string[];
  changedFiles: string[];
  lastCommit?: string;
  lastError?: string;
  updatedAt: string;
}

export interface CreateAgentRunManifestInput {
  repoRoot: string;
  groupId?: string;
  baseRef?: string;
  plan: ParallelWorkAreaPlan;
}

type LanePatch = Partial<Omit<AgentLaneManifest, "id" | "status" | "updatedAt">>;

const ALLOWED_TRANSITIONS: Record<AgentLaneStatus, AgentLaneStatus[]> = {
  planned: ["planned", "created", "running", "blocked", "failed"],
  created: ["created", "running", "blocked", "failed"],
  running: ["running", "verified", "blocked", "failed"],
  blocked: ["blocked", "running", "failed"],
  failed: ["failed", "running"],
  verified: ["verified", "ready-to-integrate", "integrated"],
  "ready-to-integrate": ["ready-to-integrate", "integrated"],
  integrated: ["integrated"],
};

function nowIso(): string {
  return new Date().toISOString();
}

export function agentRunManifestPath(repoRoot: string, groupId: string): string {
  return join(repoRoot, ".pi", "agent-runs", groupId, "manifest.json");
}

async function saveManifestUnlocked(manifest: AgentRunManifest): Promise<void> {
  const path = agentRunManifestPath(manifest.repoRoot, manifest.groupId);
  await mkdir(join(manifest.repoRoot, ".pi", "agent-runs", manifest.groupId), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

export async function saveAgentRunManifest(manifest: AgentRunManifest): Promise<void> {
  const path = agentRunManifestPath(manifest.repoRoot, manifest.groupId);
  await withFileLock(path, async () => saveManifestUnlocked(manifest));
}

export async function loadAgentRunManifest(repoRoot: string, groupId: string): Promise<AgentRunManifest> {
  try {
    return JSON.parse(await readFile(agentRunManifestPath(repoRoot, groupId), "utf8")) as AgentRunManifest;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load agent run manifest ${groupId}: ${detail}`);
  }
}

export async function createAgentRunManifest(input: CreateAgentRunManifestInput): Promise<AgentRunManifest> {
  const timestamp = nowIso();
  const groupId = input.groupId ?? `run-${timestamp.replace(/[^0-9]/g, "").slice(0, 14)}`;
  const manifest: AgentRunManifest = {
    version: 1,
    groupId,
    repoRoot: input.repoRoot,
    baseRef: input.baseRef ?? "HEAD",
    createdAt: timestamp,
    updatedAt: timestamp,
    goal: input.plan.goal,
    parallelStrategy: input.plan.parallelStrategy,
    status: "planned",
    lanes: input.plan.lanes.map((lane): AgentLaneManifest => ({
      id: lane.id,
      itemIds: lane.itemIds,
      descriptions: lane.descriptions,
      executionStrategy: lane.executionStrategy,
      ownedFiles: lane.files,
      ownedDomains: lane.domains,
      blockedByLaneIds: lane.blockedByLaneIds,
      status: "planned",
      verificationCommands: [],
      changedFiles: [],
      updatedAt: timestamp,
    })),
  };
  await saveAgentRunManifest(manifest);
  return manifest;
}

function assertLaneTransition(from: AgentLaneStatus, to: AgentLaneStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) throw new Error(`Invalid lane transition: ${from} -> ${to}`);
}

export async function updateAgentLaneStatus(
  repoRoot: string,
  groupId: string,
  laneId: string,
  status: AgentLaneStatus,
  patch: LanePatch = {},
): Promise<AgentRunManifest> {
  const path = agentRunManifestPath(repoRoot, groupId);
  return await withFileLock(path, async () => {
    const manifest = await loadAgentRunManifest(repoRoot, groupId);
    const lane = manifest.lanes.find((candidate) => candidate.id === laneId);
    if (!lane) throw new Error(`Unknown lane id: ${laneId}`);
    assertLaneTransition(lane.status, status);
    Object.assign(lane, patch, { status, updatedAt: nowIso() });
    manifest.updatedAt = nowIso();
    await saveManifestUnlocked(manifest);
    return manifest;
  });
}

export async function updateAgentRunManifest(
  repoRoot: string,
  groupId: string,
  update: (manifest: AgentRunManifest) => void,
): Promise<AgentRunManifest> {
  const path = agentRunManifestPath(repoRoot, groupId);
  return await withFileLock(path, async () => {
    const manifest = await loadAgentRunManifest(repoRoot, groupId);
    update(manifest);
    manifest.updatedAt = nowIso();
    await saveManifestUnlocked(manifest);
    return manifest;
  });
}

export function summarizeAgentRunManifest(manifest: AgentRunManifest): string {
  const lines = [`Agent run ${manifest.groupId} [${manifest.status}]`, `repoRoot: ${manifest.repoRoot}`, `baseRef: ${manifest.baseRef}`];
  if (manifest.goal) lines.push(`goal: ${manifest.goal}`);
  lines.push("lanes:");
  for (const lane of manifest.lanes) {
    lines.push(`- ${lane.id} [${lane.status}] ${lane.executionStrategy}: ${lane.itemIds.join(", ")}`);
    if (lane.blockedByLaneIds.length > 0) lines.push(`  blockedBy: ${lane.blockedByLaneIds.join(", ")}`);
    if (lane.worktreePath) lines.push(`  worktree: ${lane.worktreePath}`);
  }
  if (manifest.integrationEvidence) lines.push(`integrationEvidence: ${manifest.integrationEvidence}`);
  return lines.join("\n");
}
