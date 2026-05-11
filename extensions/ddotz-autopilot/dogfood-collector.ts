import { randomUUID } from "node:crypto";
import { classifyPromptForDogfood, dogfoodHash, isoWeekId, safeProjectLabel } from "./dogfood-privacy";
import { scoreDogfoodCase } from "./dogfood-scoring";
import { appendDogfoodEvent, type DogfoodStore, writeDogfoodCase } from "./dogfood-store";
import type { DogfoodCase } from "./dogfood-types";

export interface ActiveDogfoodCaseState {
  current?: DogfoodCase;
}

export function createActiveDogfoodCaseState(): ActiveDogfoodCaseState {
  return {};
}

function commandFromInput(input: unknown): string | undefined {
  const value = input && typeof input === "object" ? (input as { command?: unknown }).command : undefined;
  return typeof value === "string" ? value.trim() : undefined;
}

function isVerificationCommand(command: string | undefined): command is string {
  if (!command) return false;
  return /\b(pnpm|npm|yarn)\s+(run\s+)?(check|test|lint|typecheck|version:check)\b/i.test(command) || /\b(vitest|pytest|tsc|eslint|oxlint)\b/i.test(command);
}

export async function startDogfoodCase(state: ActiveDogfoodCaseState, store: DogfoodStore, input: {
  prompt: string;
  cwd: string;
  salt: string;
  workMode: string;
  executionIntensity: string;
  model?: string;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const classified = classifyPromptForDogfood(input.prompt);
  state.current = {
    id: randomUUID(),
    week: isoWeekId(now),
    startedAt: now.toISOString(),
    promptHash: dogfoodHash(input.prompt, input.salt),
    promptSummary: classified.summary,
    cwdHash: dogfoodHash(input.cwd, input.salt),
    projectLabel: safeProjectLabel(input.cwd),
    workMode: input.workMode,
    executionIntensity: input.executionIntensity,
    model: input.model,
    taskType: classified.taskType,
    toolCounts: {},
    verification: { required: false, passed: false, failedCommands: [], passedCommands: [] },
    gates: { structuralRequired: false, structuralPassed: false, loopTransitions: 0, repairQueued: false },
    userSteeringSignals: [],
    outcome: "review",
    outcomeConfidence: "Low",
    ruleReasons: [],
  };
  await appendDogfoodEvent(store, { type: "case_started", caseId: state.current.id, at: state.current.startedAt, week: state.current.week });
}

export function recordDogfoodToolCall(state: ActiveDogfoodCaseState, toolName: string): void {
  const current = state.current;
  if (!current) return;
  current.toolCounts[toolName] = (current.toolCounts[toolName] ?? 0) + 1;
  if (toolName === "structural_gate") current.gates.structuralRequired = true;
  if (toolName === "loop_transition") current.gates.loopTransitions += 1;
}

export function recordDogfoodToolResult(state: ActiveDogfoodCaseState, event: { toolName: string; input?: unknown; isError?: boolean; details?: unknown; content?: unknown }): void {
  const current = state.current;
  if (!current) return;
  if (event.toolName === "bash") {
    const command = commandFromInput(event.input);
    if (isVerificationCommand(command)) {
      current.verification.required = true;
      if (event.isError) current.verification.failedCommands.push(command);
      else current.verification.passedCommands.push(command);
      current.verification.passed = current.verification.passedCommands.length > 0 && current.verification.failedCommands.length === 0;
      if (current.verification.failedCommands.length > 0 && current.verification.passedCommands.length > 0) current.verification.passed = true;
    }
  }
  if (event.toolName === "structural_gate") {
    current.gates.structuralRequired = true;
    const details = event.details && typeof event.details === "object" ? event.details as { ok?: unknown } : {};
    current.gates.structuralPassed = details.ok === true || (Array.isArray(event.content) && JSON.stringify(event.content).includes("Structural gate passed"));
  }
}

export async function finishDogfoodCase(state: ActiveDogfoodCaseState, store: DogfoodStore, now = new Date()): Promise<DogfoodCase | undefined> {
  const current = state.current;
  if (!current) return undefined;
  if (current.endedAt) return current;
  const scored = scoreDogfoodCase({ ...current, endedAt: now.toISOString() });
  state.current = scored;
  await writeDogfoodCase(store, scored);
  await appendDogfoodEvent(store, { type: "case_finished", caseId: scored.id, at: scored.endedAt, outcome: scored.outcome });
  return scored;
}
