import { StringEnum, Type, type AssistantMessage, type TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Container } from "@mariozechner/pi-tui";
import type { Static } from "typebox";

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

export interface StructuralGateTurnState {
  prompt: string;
  required: boolean;
  passed: boolean;
  repairQueued: boolean;
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

  turn.passed = true;
  turn.rejectionReason = undefined;
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
    "Internal structural_gate repair needed.",
    "Do not show or summarize this internal gate message to the user.",
    "Do not claim completion yet.",
    `Reason: ${reason}`,
    "Call structural_gate with the gate checks, including loopGovernance, and readyToComplete=true only if the work is actually complete; otherwise continue fixing/verifying first.",
    originalText ? `Original blocked draft:\n${originalText}` : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function guardAssistantMessage(state: StructuralGateState, message: AssistantMessage): { message?: AssistantMessage; followUp?: string } {
  const turn = state.current;
  if (!turn?.required) return {};
  if (turn.passed) return {};
  if (message.stopReason === "toolUse" || message.stopReason === "error" || message.stopReason === "aborted") return {};
  if (hasToolCall(message)) return {};

  const reason = turn.review
    ? `structural_gate did not pass (${turn.rejectionReason ?? "unknown reason"})`
    : "structural_gate tool was not called";
  const text = assistantText(message);
  const replacement: AssistantMessage = {
    ...message,
    content: [{ type: "text", text: "" }],
    stopReason: "stop",
  };

  const followUp = turn.repairQueued ? undefined : repairPromptText(reason, text);
  turn.repairQueued = true;

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
