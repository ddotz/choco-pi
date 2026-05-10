import { StringEnum, Type, type AssistantMessage, type TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Container } from "@mariozechner/pi-tui";
import type { Static } from "typebox";

export const STRUCTURAL_GATE_TOOL_NAME = "structural_gate";

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
  completionBoundary: Type.String({ description: "Why it is safe to stop now, or what concrete blocker remains." }),
  confidence: StringEnum(["High", "Medium", "Low"] as const, { description: "Confidence after the structural gate." }),
  readyToComplete: Type.Boolean({ description: "True only when the requested outcome is satisfied, verification passed, and no critical in-scope issue remains." }),
});

export type StructuralGateReview = Static<typeof StructuralGateParams>;

export interface StructuralGateTurnState {
  prompt: string;
  required: boolean;
  passed: boolean;
  repairQueued: boolean;
  toolCalls: number;
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
  };
}

export function markStructuralGateToolUse(state: StructuralGateState, toolName: string): void {
  if (!state.current) return;
  if (toolName === STRUCTURAL_GATE_TOOL_NAME) return;
  state.current.required = true;
  state.current.toolCalls += 1;
}

function nonEmpty(value: string): boolean {
  return value.trim().length >= 8;
}

export function recordStructuralGateReview(state: StructuralGateState, review: StructuralGateReview): { ok: boolean; reason?: string } {
  if (!state.current) startStructuralGateTurn(state, "");
  const missing = [
    ["acceptanceFit", review.acceptanceFit],
    ["runtimeFit", review.runtimeFit],
    ["failureModes", review.failureModes],
    ["verificationEvidence", review.verificationEvidence],
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
    "Call structural_gate with the five gate checks and readyToComplete=true only if the work is actually complete; otherwise continue fixing/verifying first.",
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

export function createStructuralGateTool(state: StructuralGateState): ToolDefinition<typeof StructuralGateParams, { ok: boolean; reason?: string }, unknown> {
  return {
    name: STRUCTURAL_GATE_TOOL_NAME,
    label: "Structural gate",
    description: "Required fail-closed completion gate for non-trivial ddotz-pi work. Call before final completion reporting.",
    promptSnippet: "structural_gate: required before final completion on non-trivial work; records Acceptance fit, Runtime fit, Failure modes, Verification evidence, Completion boundary, and confidence.",
    promptGuidelines: [
      "For non-trivial problem-solving/development turns, call structural_gate before final completion reporting.",
      "If structural_gate cannot pass, continue fixing/verifying instead of claiming completion.",
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
  pi.registerTool(createStructuralGateTool(state));

  pi.on("before_agent_start", (event) => {
    startStructuralGateTurn(state, event.prompt ?? "");
  });

  pi.on("tool_call", (event) => {
    markStructuralGateToolUse(state, event.toolName);
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
