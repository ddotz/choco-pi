import { createHash, randomUUID } from "node:crypto";
import { sessionScopedKey } from "./session-scope";

export type AutonomyProtocolKind =
  | "none"
  | "single-branch"
  | "coding"
  | "parallel-work"
  | "worktree-lane"
  | "integration"
  | "approval-boundary";

export interface BlockedProtocolTool {
  toolName: string;
  reason: string;
  updatedAt: string;
}

export interface AutonomyProtocol {
  version: 1;
  id: string;
  kind: AutonomyProtocolKind;
  sessionId: string;
  cwd: string;
  promptHash: string;
  requiredTools: string[];
  satisfiedTools: string[];
  blockedTools: BlockedProtocolTool[];
  activeGroupId?: string;
  activeLaneId?: string;
  hardBoundary?: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAutonomyProtocolInput {
  kind: AutonomyProtocolKind;
  sessionId: string;
  cwd: string;
  prompt: string;
  requiredTools: string[];
  reason: string;
  activeGroupId?: string;
  activeLaneId?: string;
  hardBoundary?: string;
  initiallySatisfiedTools?: string[];
  now?: Date;
}

export interface MissingRequiredToolsOptions {
  excludeTools?: string[];
}

export type ProtocolToolSatisfactionStatus = "satisfied" | "blocked" | "failed" | "ignored";

export interface ProtocolToolSatisfaction {
  toolName: string;
  status: ProtocolToolSatisfactionStatus;
  evidence?: string;
  toolCallId?: string;
  updatedAt: string;
}

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function autonomyProtocolKey(cwd: string, sessionId: string): string {
  return sessionScopedKey(cwd, sessionId);
}

export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 16);
}

export function createAutonomyProtocol(input: CreateAutonomyProtocolInput): AutonomyProtocol {
  const timestamp = nowIso(input.now);
  const promptHash = hashPrompt(input.prompt);
  const id = `${input.kind}-${promptHash}-${randomUUID().slice(0, 8)}`;
  return {
    version: 1,
    id,
    kind: input.kind,
    sessionId: input.sessionId,
    cwd: input.cwd,
    promptHash,
    requiredTools: unique(input.requiredTools),
    satisfiedTools: unique(input.initiallySatisfiedTools ?? []),
    blockedTools: [],
    activeGroupId: input.activeGroupId,
    activeLaneId: input.activeLaneId,
    hardBoundary: input.hardBoundary,
    reason: input.reason,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function markProtocolToolSatisfied(
  protocol: AutonomyProtocol,
  toolName: string,
  _evidence?: string,
  now = new Date(),
): AutonomyProtocol {
  return {
    ...protocol,
    satisfiedTools: unique([...protocol.satisfiedTools, toolName]),
    blockedTools: protocol.blockedTools.filter((tool) => tool.toolName !== toolName),
    updatedAt: nowIso(now),
  };
}

export function markProtocolToolBlocked(
  protocol: AutonomyProtocol,
  toolName: string,
  reason: string,
  now = new Date(),
): AutonomyProtocol {
  const updatedAt = nowIso(now);
  return {
    ...protocol,
    satisfiedTools: protocol.satisfiedTools.filter((tool) => tool !== toolName),
    blockedTools: [
      ...protocol.blockedTools.filter((tool) => tool.toolName !== toolName),
      { toolName, reason, updatedAt },
    ],
    updatedAt,
  };
}

export function missingRequiredTools(protocol: AutonomyProtocol, options: MissingRequiredToolsOptions = {}): string[] {
  const exclude = new Set(options.excludeTools ?? []);
  const satisfied = new Set(protocol.satisfiedTools);
  return protocol.requiredTools.filter((tool) => !exclude.has(tool) && !satisfied.has(tool));
}

export function protocolReadyForCompletion(protocol: AutonomyProtocol): boolean {
  if (protocol.kind === "approval-boundary") return false;
  return protocol.blockedTools.length === 0 && missingRequiredTools(protocol).length === 0;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function nestedResult(details: unknown): Record<string, unknown> | undefined {
  const object = objectValue(details);
  return objectValue(object?.result) ?? object;
}

function evidenceFrom(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 500);
  if (Array.isArray(value)) return value.map((item) => evidenceFrom(item)).filter(Boolean).join(", ").slice(0, 500) || undefined;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return evidenceFrom(object.reason) ?? evidenceFrom(object.error) ?? evidenceFrom(object.blockers) ?? evidenceFrom(object.status) ?? evidenceFrom(object.action);
  }
  return undefined;
}

function okBoolean(result: Record<string, unknown> | undefined): boolean | undefined {
  return typeof result?.ok === "boolean" ? result.ok : undefined;
}

function statusString(result: Record<string, unknown> | undefined): string | undefined {
  return typeof result?.status === "string" ? result.status : undefined;
}

export function protocolToolSatisfactionFromResult(
  toolName: string,
  event: { toolCallId?: unknown; details?: unknown; isError?: unknown; content?: unknown },
  now = new Date(),
): ProtocolToolSatisfaction | undefined {
  const updatedAt = nowIso(now);
  const toolCallId = typeof event.toolCallId === "string" ? event.toolCallId : undefined;
  const result = nestedResult(event.details);
  const failedByTool = event.isError === true;

  const make = (status: ProtocolToolSatisfactionStatus, evidence?: string): ProtocolToolSatisfaction => ({
    toolName,
    status,
    evidence,
    toolCallId,
    updatedAt,
  });

  if (toolName === "parallel_work_plan") {
    return objectValue(event.details)?.plan ? make("satisfied", "parallel plan created") : make("blocked", "parallel_work_plan result lacks plan");
  }

  if (toolName === "integration_verifier") {
    const status = statusString(result);
    if (status === "passed") return make("satisfied", evidenceFrom(result) ?? "integration_verifier passed");
    if (status === "dry-run") return make("ignored", "integration_verifier dry-run is not completion-satisfying");
    if (status === "blocked" || status === "failed") return make(status, evidenceFrom(result) ?? `integration_verifier ${status}`);
    return okBoolean(result) === true ? make("satisfied", "integration_verifier ok") : make("blocked", evidenceFrom(result) ?? "integration_verifier did not pass");
  }

  if (toolName === "branch_switch_guard" || toolName === "worktree_manage" || toolName === "agent_orchestrator") {
    const ok = okBoolean(result);
    if (ok === true) return make("satisfied", evidenceFrom(result) ?? `${toolName} ok`);
    if (ok === false) return make("blocked", evidenceFrom(result) ?? `${toolName} blocked`);
    if (failedByTool) return make("failed", evidenceFrom(event.content) ?? `${toolName} failed`);
    return undefined;
  }

  if (toolName === "structural_gate" || toolName === "spec_gate") {
    const ok = okBoolean(result);
    if (ok === true) return make("satisfied", `${toolName} ok`);
    if (ok === false) return make("blocked", evidenceFrom(result) ?? `${toolName} blocked`);
    if (failedByTool) return make("failed", `${toolName} failed`);
    return undefined;
  }

  if (toolName === "todo") {
    return failedByTool ? make("failed", "todo failed") : make("satisfied", "todo action completed");
  }

  return undefined;
}

export function summarizeAutonomyProtocol(protocol: AutonomyProtocol | undefined): {
  protocol: AutonomyProtocolKind | "none";
  required: string[];
  satisfied: string[];
  missing: string[];
  blocked: string[];
} {
  if (!protocol || protocol.kind === "none") return { protocol: "none", required: [], satisfied: [], missing: [], blocked: [] };
  return {
    protocol: protocol.kind,
    required: protocol.requiredTools,
    satisfied: protocol.satisfiedTools,
    missing: missingRequiredTools(protocol),
    blocked: protocol.blockedTools.map((tool) => `${tool.toolName}: ${tool.reason}`),
  };
}
