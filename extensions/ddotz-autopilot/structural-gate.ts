import { StringEnum, Type, type AssistantMessage, type TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Container } from "@mariozechner/pi-tui";
import type { Static } from "typebox";
import {
  clearRepairState,
  GUARD_REPAIR_STATUS_TEXT,
  queueRepairForAttempt,
  repairAttemptKey,
  type GuardRepairState,
} from "./guard-repair-status";

export const STRUCTURAL_GATE_TOOL_NAME = "structural_gate";
export const LOOP_TRANSITION_TOOL_NAME = "loop_transition";

const NON_TRIVIAL_PROMPT_PATTERNS = [
  /구현/,
  /수정/,
  /고쳐/,
  /버그/,
  /테스트/,
  /검증/,
  /확인.*해/,
  /리뷰/,
  /분석/,
  /완료/,
  /반영/,
  /적용/,
  /만들/,
  /빌드/,
  /실행/,
  /fix/i,
  /bug/i,
  /test/i,
  /verify/i,
  /implement/i,
  /build/i,
  /review/i,
  /analy[sz]e/i,
  /complete/i,
];

const StructuralGateParams = Type.Object({
  acceptanceFit: Type.String({ description: "Compare the user's latest request, assumptions, and completion boundary against the actual result." }),
  runtimeFit: Type.String({ description: "Check whether tests and code changes represent real Pi/runtime behavior, including reload/load order/UI state/conflicts when relevant." }),
  failureModes: Type.String({ description: "Remaining ways the change can fail, leak, regress, or be misreported, plus critical fixes taken." }),
  verificationEvidence: Type.String({ description: "Observable verification evidence. Separate test evidence from runtime guarantees when they differ." }),
  loopGovernance: Type.String({ description: "Confirm every step/todo transition stayed plan-first, and any new work after the current todo was deferred or routed through new steering/new loop." }),
  completionBoundary: Type.String({ description: "Why it is safe to stop now, or what concrete blocker remains." }),
  confidence: StringEnum(["High", "Medium", "Low"] as const, { description: "Confidence after the structural gate." }),
  readyToComplete: Type.Boolean({ description: "True only when the requested outcome is satisfied, verification passed, and no critical in-scope issue remains." }),
});

const LoopTransitionParams = Type.Object({
  currentStep: Type.String({ description: "The plan step or todo item that is being completed or crossed." }),
  nextStep: Type.String({ description: "The next step/todo, or 'final' if stopping." }),
  transitionDecision: Type.String({ description: "Why it is safe to cross this step boundary now." }),
  currentTodoFit: Type.String({ description: "How the next action still fits the current plan/current todo/requested scope." }),
  newWorkDiscovered: Type.Boolean({ description: "True if new work appeared after the current todo was already underway or completed." }),
  newWorkHandling: StringEnum(["none", "deferred", "new-steering", "new-loop", "approval-boundary"] as const, { description: "How newly discovered work was handled." }),
  newLoopPlan: Type.Optional(Type.String({ description: "Required when handling is new-steering or new-loop; summarize the fresh plan/todo scope." })),
});

export type StructuralGateReview = Static<typeof StructuralGateParams>;
export type LoopTransitionReview = Static<typeof LoopTransitionParams>;

export interface StructuralGateTurnState extends GuardRepairState {
  prompt: string;
  required: boolean;
  passed: boolean;
  toolCalls: number;
  todoStepCompletions: number;
  loopTransitionReviews: number;
  hasCompletedTodo: boolean;
  newWorkAfterTodo: boolean;
  newWorkAfterTodoHandled: boolean;
  review?: StructuralGateReview;
  rejectionReason?: string;
}

export interface StructuralGateState {
  current?: StructuralGateTurnState;
}

export function createStructuralGateState(): StructuralGateState {
  return {};
}

export function promptRequiresStructuralGate(prompt: string): boolean {
  return NON_TRIVIAL_PROMPT_PATTERNS.some((pattern) => pattern.test(prompt));
}

export function startStructuralGateTurn(state: StructuralGateState, prompt: string): void {
  state.current = {
    prompt,
    required: promptRequiresStructuralGate(prompt),
    passed: false,
    repairQueued: false,
    toolCalls: 0,
    todoStepCompletions: 0,
    loopTransitionReviews: 0,
    hasCompletedTodo: false,
    newWorkAfterTodo: false,
    newWorkAfterTodoHandled: false,
  };
}

function objectInput(input: unknown): Record<string, unknown> | undefined {
  return input && typeof input === "object" ? input as Record<string, unknown> : undefined;
}

export function markStructuralGateToolUse(state: StructuralGateState, toolName: string, input?: unknown): void {
  if (!state.current) return;
  if (toolName === STRUCTURAL_GATE_TOOL_NAME) return;
  const turn = state.current;
  turn.required = true;
  turn.toolCalls += 1;

  if (toolName !== "todo") return;
  const payload = objectInput(input);
  if (!payload) return;

  if (payload.action === "set_status" && payload.status === "done") {
    turn.todoStepCompletions += 1;
    turn.hasCompletedTodo = true;
    return;
  }

  if (payload.action === "add" && turn.hasCompletedTodo) {
    turn.newWorkAfterTodo = true;
  }
}

function nonEmpty(value: string): boolean {
  return value.trim().length >= 8;
}

function nonEmptyOrFinal(value: string): boolean {
  return value.trim() === "final" || nonEmpty(value);
}

export function recordLoopTransitionReview(state: StructuralGateState, review: LoopTransitionReview): { ok: boolean; reason?: string } {
  if (!state.current) startStructuralGateTurn(state, "");
  const missing = [
    ["currentStep", review.currentStep, nonEmpty],
    ["nextStep", review.nextStep, nonEmptyOrFinal],
    ["transitionDecision", review.transitionDecision, nonEmpty],
    ["currentTodoFit", review.currentTodoFit, nonEmpty],
  ].filter(([, value, predicate]) => typeof value !== "string" || !(predicate as (input: string) => boolean)(value));

  const turn = state.current!;
  turn.required = true;

  if (missing.length > 0) {
    return { ok: false, reason: `incomplete fields: ${missing.map(([name]) => name).join(", ")}` };
  }

  if (review.newWorkDiscovered && review.newWorkHandling === "none") {
    return { ok: false, reason: "new work after the current todo must be deferred, routed through new steering/new loop, or stopped at an approval boundary" };
  }

  if ((review.newWorkHandling === "new-steering" || review.newWorkHandling === "new-loop") && !nonEmpty(review.newLoopPlan ?? "")) {
    return { ok: false, reason: "newLoopPlan is required for new-steering or new-loop handling" };
  }

  turn.loopTransitionReviews += 1;
  if (review.newWorkDiscovered && review.newWorkHandling !== "none") {
    turn.newWorkAfterTodoHandled = true;
  }

  return { ok: true };
}

export function recordStructuralGateReview(state: StructuralGateState, review: StructuralGateReview): { ok: boolean; reason?: string } {
  if (!state.current) startStructuralGateTurn(state, "");
  const missing = [
    ["acceptanceFit", review.acceptanceFit],
    ["runtimeFit", review.runtimeFit],
    ["failureModes", review.failureModes],
    ["verificationEvidence", review.verificationEvidence],
    ["loopGovernance", review.loopGovernance],
    ["completionBoundary", review.completionBoundary],
  ].filter(([, value]) => typeof value !== "string" || !nonEmpty(value));

  const turn = state.current!;
  turn.required = true;
  turn.review = review;

  if (missing.length > 0) {
    const reason = `incomplete fields: ${missing.map(([name]) => name).join(", ")}`;
    turn.passed = false;
    turn.rejectionReason = reason;
    return { ok: false, reason };
  }

  if (turn.todoStepCompletions > turn.loopTransitionReviews) {
    const reason = "loop_transition is required after completing a todo step before crossing to the next step or final completion";
    turn.passed = false;
    turn.rejectionReason = reason;
    return { ok: false, reason };
  }

  if (turn.newWorkAfterTodo && !turn.newWorkAfterTodoHandled) {
    const reason = "new work after the current todo requires loop_transition with deferred, new-steering/new-loop, or approval-boundary handling";
    turn.passed = false;
    turn.rejectionReason = reason;
    return { ok: false, reason };
  }

  if (!review.readyToComplete) {
    const reason = "readyToComplete is false";
    turn.passed = false;
    turn.rejectionReason = reason;
    return { ok: false, reason };
  }

  if (review.confidence === "Medium") {
    const reason = "Medium confidence cannot complete: reinforce verification to High or stop with a concrete blocker and readyToComplete=false";
    turn.passed = false;
    turn.rejectionReason = reason;
    return { ok: false, reason };
  }

  turn.passed = true;
  turn.rejectionReason = undefined;
  clearRepairState(turn);
  return { ok: true };
}

function assistantText(message: AssistantMessage): string {
  return message.content
    .filter((item): item is TextContent => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}

function hasToolCall(message: AssistantMessage): boolean {
  return message.content.some((item) => item.type === "toolCall");
}

function repairPromptText(reason: string, originalText: string): string {
  return [
    "내부 structural_gate 보강이 필요합니다.",
    "이 내부 gate 메시지를 사용자에게 보여주거나 요약하지 마세요.",
    "아직 완료를 주장하지 마세요.",
    "최종 사용자 답변은 반드시 한국어 존댓말로 작성하세요. 사용자가 다른 언어를 명시한 경우에만 그 언어를 따르세요.",
    "원래 사용자 요청 언어와 출력 형식을 유지하고, 이전 차단/보강 과정을 언급하지 마세요.",
    `Reason: ${reason}`,
    "structural_gate를 호출해 gate checks와 loopGovernance를 기록하세요. 실제로 완료된 경우에만 readyToComplete=true를 사용하고, 아니면 먼저 수정/검증을 계속하세요.",
    originalText ? `차단된 원래 초안:\n${originalText}` : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function continuationPromptText(reason: string, originalText: string): string {
  return [
    "내부 final-message continuation guard가 재개를 요구합니다.",
    "이 내부 gate 메시지를 사용자에게 보여주거나 요약하지 마세요.",
    "최종 assistant 메시지가 완료/Ready처럼 끝났지만 active/current todo 또는 남은 in-scope 작업을 직접 언급했습니다.",
    "아직 완료를 주장하지 마세요.",
    "최종 사용자 답변은 반드시 한국어 존댓말로 작성하세요. 사용자가 다른 언어를 명시한 경우에만 그 언어를 따르세요.",
    "원래 사용자 요청 언어와 출력 형식을 유지하고, 이전 차단/보강 과정을 언급하지 마세요.",
    `Reason: ${reason}`,
    "todo 상태를 다시 확인하고 현재 active todo를 계속 진행하세요. 승인 경계, 명시적 보류, 새 범위가 맞는 경우에만 loop_transition과 structural_gate로 근거를 남기고 블록/보류로 보고하세요.",
    "실제로 완료된 경우에만 structural_gate를 다시 호출해 readyToComplete=true를 사용하세요.",
    originalText ? `차단된 원래 초안:\n${originalText}` : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function isDeferredOrBlockedLine(line: string): boolean {
  return /\b(deferred|optional|nice[- ]?to[- ]?have|new[- ]?scope|blocked|approval|follow[- ]?up)\b|보류|선택|별도\s*범위|새\s*범위|승인\s*경계|블로커|차단/i.test(line);
}

function isCompletedOrEmptyActiveLine(line: string): boolean {
  return /\b(done|complete[sd]?|closed|resolved|none|no\s+active|no\s+current)\b|완료|끝났|해결|없(?:습니다|음|다)?/i.test(line);
}

export function detectRequiredContinuationFromFinalText(text: string): string | undefined {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•]\s*/, ""))
    .filter(Boolean);

  for (const line of lines) {
    if (isDeferredOrBlockedLine(line) || isCompletedOrEmptyActiveLine(line)) continue;

    const mentionsTodo = /\btodos?\b|할\s*일/i.test(line);
    const activeTodo = mentionsTodo && (/\b(active|current|in[-_ ]?progress)\b|현재|진행\s*중/i.test(line));
    const openTodo = mentionsTodo && (/\b(pending|remaining|still|to\s*do)\b|남아|그대로|준비|해야/i.test(line));
    const unfinishedWork = /\b(remaining\s+work|still\s+need|not\s+(?:done|complete[sd]?))\b|남은\s*작업|아직\s+.*(?:필요|해야)|미완료/i.test(line);

    if (activeTodo || openTodo || unfinishedWork) {
      return `final message indicates active/current todo remains: ${line}`;
    }
  }

  return undefined;
}

export function guardAssistantMessage(state: StructuralGateState, message: AssistantMessage): { message?: AssistantMessage; followUp?: string } {
  const turn = state.current;
  if (!turn?.required) return {};
  if (message.stopReason === "toolUse" || message.stopReason === "error" || message.stopReason === "aborted") return {};
  if (hasToolCall(message)) return {};

  const text = assistantText(message);
  const continuationReason = detectRequiredContinuationFromFinalText(text);
  if (turn.passed && !continuationReason) return {};

  const reason = turn.passed
    ? continuationReason!
    : turn.review
      ? `structural_gate did not pass (${turn.rejectionReason ?? "unknown reason"})`
      : "structural_gate tool was not called";
  const replacement: AssistantMessage = {
    ...message,
    content: [{ type: "text", text: GUARD_REPAIR_STATUS_TEXT }],
    stopReason: "stop",
  };

  const key = repairAttemptKey(message, text, [reason]);
  const followUp = queueRepairForAttempt(turn, key, turn.passed ? continuationPromptText(reason, text) : repairPromptText(reason, text));

  return { message: replacement, followUp };
}

export function createLoopTransitionTool(state: StructuralGateState): ToolDefinition<typeof LoopTransitionParams, { ok: boolean; reason?: string }, unknown> {
  return {
    name: LOOP_TRANSITION_TOOL_NAME,
    label: "Loop transition",
    description: "Required before crossing todo/plan step boundaries. Records plan fit and newly discovered work handling.",
    promptSnippet: "loop_transition: required after completing a todo/plan step before moving to the next step or final completion; records plan fit and new-work handling.",
    promptGuidelines: [
      "Call loop_transition after marking a todo/plan step done and before crossing to the next step or final completion.",
      "If new work appears after the current todo, loop_transition must mark it deferred, new-steering, new-loop, or approval-boundary; do not append it silently.",
    ],
    parameters: LoopTransitionParams,
    renderShell: "self",
    async execute(_toolCallId: string, params: LoopTransitionReview, _signal: AbortSignal | undefined, _onUpdate: undefined, _ctx: ExtensionContext) {
      const result = recordLoopTransitionReview(state, params);
      return {
        content: [{ type: "text", text: result.ok ? "Loop transition recorded." : `Loop transition failed: ${result.reason}` }],
        details: { ok: result.ok, reason: result.reason },
      };
    },
    renderCall() {
      return new Container();
    },
    renderResult() {
      return new Container();
    },
  };
}

export function createStructuralGateTool(state: StructuralGateState): ToolDefinition<typeof StructuralGateParams, { ok: boolean; reason?: string }, unknown> {
  return {
    name: STRUCTURAL_GATE_TOOL_NAME,
    label: "Structural gate",
    description: "Required fail-closed completion gate for non-trivial ddotz-pi work. Call before final completion reporting.",
    promptSnippet: "structural_gate: required before final completion on non-trivial work; records Acceptance fit, Runtime fit, Failure modes, Verification evidence, Loop governance, Completion boundary, and confidence.",
    promptGuidelines: [
      "For non-trivial problem-solving/development turns, call structural_gate before final completion reporting.",
      "If structural_gate cannot pass, continue fixing/verifying instead of claiming completion.",
      "structural_gate.loopGovernance must state that step/todo transitions stayed within the current plan and that any new work after the current todo used new steering/new loop or was deferred.",
      "If structural_gate confidence would be Medium, do not complete. Reinforce verification to reach High, or set readyToComplete=false with a concrete blocker.",
    ],
    parameters: StructuralGateParams,
    renderShell: "self",
    async execute(_toolCallId: string, params: StructuralGateReview, _signal: AbortSignal | undefined, _onUpdate: undefined, _ctx: ExtensionContext) {
      const result = recordStructuralGateReview(state, params);
      return {
        content: [{ type: "text", text: result.ok ? "Structural gate passed." : `Structural gate failed: ${result.reason}` }],
        details: { ok: result.ok, reason: result.reason },
      };
    },
    renderCall() {
      return new Container();
    },
    renderResult() {
      return new Container();
    },
  };
}

export function installStructuralGate(pi: Pick<ExtensionAPI, "on" | "registerTool" | "sendMessage">): void {
  const state = createStructuralGateState();
  pi.registerTool(createLoopTransitionTool(state));
  pi.registerTool(createStructuralGateTool(state));

  pi.on("before_agent_start", (event) => {
    startStructuralGateTurn(state, event.prompt ?? "");
  });

  pi.on("tool_call", (event) => {
    markStructuralGateToolUse(state, event.toolName, event.input);
  });

  pi.on("message_end", (event) => {
    if (event.message.role !== "assistant") return undefined;
    const result = guardAssistantMessage(state, event.message);
    if (result.followUp) {
      pi.sendMessage(
        {
          customType: "ddotz.structural_gate.repair",
          content: result.followUp,
          display: false,
          details: { repairQueued: true },
        },
        { deliverAs: "followUp", triggerTurn: true },
      );
    }
    return result.message ? { message: result.message } : undefined;
  });
}
