import { createHash } from "node:crypto";
import { FALLBACK_SESSION_ID, normalizeSessionId } from "../session-identity";
import type { DynamicSddTurnState, SpecDelta, WorkingSpec } from "./dynamic-sdd";

export type RequirementLockSource = "objective" | "scope" | "acceptance" | "delta";
export type RequirementLockPriority = "must" | "should" | "informational";
export type RequirementLockItemStatus = "active" | "verified" | "deferred" | "removed-by-delta" | "blocked";

export interface RequirementLockItem {
  id: string;
  source: RequirementLockSource;
  priority: RequirementLockPriority;
  text: string;
  status: RequirementLockItemStatus;
  evidence: string[];
  deltaId?: string;
  reason?: string;
}

export interface RequirementLock {
  id: string;
  sessionKey: string;
  specHash: string;
  items: RequirementLockItem[];
  createdAt: string;
  updatedAt: string;
}

const activeLocks = new Map<string, RequirementLock>();
const activeDeltas = new Map<string, SpecDelta[]>();

function sessionKey(sessionId = FALLBACK_SESSION_ID): string {
  return normalizeSessionId(sessionId || FALLBACK_SESSION_ID);
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]+/gi, " ").replace(/\s+/g, " ").trim();
}

function includesNormalized(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeText(needle);
  if (!normalizedNeedle) return false;
  return normalizeText(haystack).includes(normalizedNeedle);
}

function explicitMust(text: string): boolean {
  return /\bmust\b|\brequired\b|필수|반드시|해야\s*함|해야\s*한다/i.test(text);
}

function itemId(prefix: string, index: number): string {
  return `REQ-${prefix}-${String(index + 1).padStart(3, "0")}`;
}

function item(source: RequirementLockSource, prefix: string, index: number, text: string, priority: RequirementLockPriority): RequirementLockItem {
  return {
    id: itemId(prefix, index),
    source,
    priority,
    text,
    status: "active",
    evidence: [],
  };
}

function deltaText(delta: SpecDelta): string {
  return [
    delta.description,
    delta.rationale,
    ...(delta.proposedChanges.scope ?? []),
    ...(delta.proposedChanges.acceptanceCriteria ?? []),
    ...(delta.proposedChanges.testStrategy ?? []),
    ...(delta.proposedChanges.risks ?? []),
  ].filter(Boolean).join("\n");
}

function deltaMatchesItem(delta: SpecDelta, lockItem: RequirementLockItem): boolean {
  const text = deltaText(delta);
  return includesNormalized(text, lockItem.id) || includesNormalized(text, lockItem.text);
}

function removalDelta(delta: SpecDelta): boolean {
  return /\b(remove|delete|drop|exclude|deprecate)\b|삭제|제거|축소|제외|폐기/i.test(delta.description);
}

function reconcileStatus(delta: SpecDelta): RequirementLockItemStatus {
  return removalDelta(delta) ? "removed-by-delta" : "deferred";
}

export function deriveRequirementLock(sessionId: string | undefined, spec: WorkingSpec, now = new Date()): RequirementLock {
  const session = sessionKey(sessionId);
  const createdAt = now.toISOString();
  const items: RequirementLockItem[] = [
    item("objective", "OBJ", 0, spec.objective, explicitMust(spec.objective) ? "must" : "informational"),
    ...spec.scope.map((text, index) => item("scope", "SC", index, text, explicitMust(text) ? "must" : "should")),
    ...spec.acceptanceCriteria.map((text, index) => item("acceptance", "AC", index, text, "must")),
  ];

  const specHash = stableHash({ objective: spec.objective, scope: spec.scope, acceptanceCriteria: spec.acceptanceCriteria });
  return {
    id: `lock-${session}-${specHash}`,
    sessionKey: session,
    specHash,
    items,
    createdAt,
    updatedAt: createdAt,
  };
}

export function reconcileRequirementLockWithDelta(lock: RequirementLock, delta: SpecDelta, now = new Date()): RequirementLock {
  const status = reconcileStatus(delta);
  const deltaId = stableHash({ description: delta.description, createdAt: delta.createdAt });
  return {
    ...lock,
    updatedAt: now.toISOString(),
    items: lock.items.map((lockItem) => {
      if (lockItem.status !== "active" || !deltaMatchesItem(delta, lockItem)) return lockItem;
      return {
        ...lockItem,
        status,
        deltaId,
        reason: `${delta.handling}: ${delta.description}`,
      };
    }),
  };
}

export function requirementLockFromTurn(sessionId: string | undefined, turn: DynamicSddTurnState, now = new Date()): RequirementLock | undefined {
  if (!turn.workingSpec) return undefined;
  return turn.deltas.reduce(
    (lock, delta) => reconcileRequirementLockWithDelta(lock, delta, now),
    deriveRequirementLock(sessionId, turn.workingSpec, now),
  );
}

function evidenceMatchesItem(evidence: string, lockItem: RequirementLockItem): boolean {
  return includesNormalized(evidence, lockItem.id) || includesNormalized(evidence, lockItem.text);
}

export function requirementLockCompletionBlock(lock: RequirementLock | undefined, verificationEvidence: string): string | undefined {
  if (!lock) return undefined;
  const unresolved = lock.items.filter((lockItem) => {
    if (lockItem.priority !== "must" || lockItem.status !== "active") return false;
    return !evidenceMatchesItem(verificationEvidence, lockItem);
  });
  if (unresolved.length === 0) return undefined;
  return `requirement lock unresolved: ${unresolved.map((lockItem) => `${lockItem.id} ${lockItem.text}`).join("; ")}`;
}

export function setRequirementLockForSession(sessionId: string | undefined, turn: DynamicSddTurnState): RequirementLock | undefined {
  const key = sessionKey(sessionId);
  activeDeltas.set(key, [...turn.deltas]);
  const lock = requirementLockFromTurn(sessionId, turn);
  if (!lock) {
    activeLocks.delete(key);
    return undefined;
  }
  activeLocks.set(key, lock);
  return lock;
}

export function clearRequirementLockForSession(sessionId: string | undefined): void {
  const key = sessionKey(sessionId);
  activeLocks.delete(key);
  activeDeltas.delete(key);
}

export function requirementLockCompletionBlockForSession(sessionId: string | undefined, verificationEvidence: string): string | undefined {
  return requirementLockCompletionBlock(activeLocks.get(sessionKey(sessionId)), verificationEvidence);
}

export function specDeltasForSession(sessionId: string | undefined): SpecDelta[] {
  return [...(activeDeltas.get(sessionKey(sessionId)) ?? [])];
}

export function requirementLockForSession(sessionId: string | undefined): RequirementLock | undefined {
  return activeLocks.get(sessionKey(sessionId));
}
