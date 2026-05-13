import { randomUUID } from "node:crypto";
import { classifyPromptForDogfood, dogfoodHash, isoWeekId, safeProjectLabel } from "./dogfood-privacy";
import { scoreDogfoodCase } from "./dogfood-scoring";
import { appendDogfoodEvent, type DogfoodStore, writeDogfoodCase } from "./dogfood-store";
import type { DogfoodCase, DogfoodScopeSignals } from "./dogfood-types";
import { commandClassFromInput, verificationCommandFromInput } from "./verification-command";

export interface ActiveDogfoodCaseState {
  current?: DogfoodCase;
}

export function createActiveDogfoodCaseState(): ActiveDogfoodCaseState {
  return {};
}

export async function startDogfoodCase(state: ActiveDogfoodCaseState, store: DogfoodStore, input: {
  prompt: string;
  cwd: string;
  salt: string;
  workMode: string;
  executionIntensity: string;
  model?: string;
  now?: Date;
  scope: DogfoodScopeSignals;
}): Promise<void> {
  const now = input.now ?? new Date();
  if (!input.scope.capture) {
    state.current = undefined;
    return;
  }
  const classified = classifyPromptForDogfood(input.prompt);
  state.current = {
    id: randomUUID(),
    week: isoWeekId(now),
    startedAt: now.toISOString(),
    promptHash: dogfoodHash(input.prompt, input.salt),
    promptSummary: classified.summary,
    cwdHash: input.scope.projectRootHash ?? dogfoodHash(input.cwd, input.salt),
    projectLabel: input.scope.projectLabel ?? safeProjectLabel(input.cwd),
    workMode: input.workMode,
    executionIntensity: input.executionIntensity,
    model: input.model,
    taskType: classified.taskType,
    toolCounts: {},
    scope: input.scope,
    flow: { toolSequence: [], commandSequence: [] },
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
  current.flow.toolSequence = [...current.flow.toolSequence, toolName].slice(-40);
  if (toolName === "structural_gate") current.gates.structuralRequired = true;
  if (toolName === "loop_transition") current.gates.loopTransitions += 1;
}

export function recordDogfoodToolResult(state: ActiveDogfoodCaseState, event: { toolName: string; input?: unknown; isError?: boolean; details?: unknown; content?: unknown }): void {
  const current = state.current;
  if (!current) return;
  if (event.toolName === "bash") {
    const commandClass = commandClassFromInput(event.input);
    if (commandClass) current.flow.commandSequence = [...current.flow.commandSequence, commandClass].slice(-40);
    const command = verificationCommandFromInput(event.input);
    if (command) {
      const sanitizedCommand = commandClass ?? "verification";
      current.verification.required = true;
      if (event.isError) current.verification.failedCommands.push(sanitizedCommand);
      else current.verification.passedCommands.push(sanitizedCommand);
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
