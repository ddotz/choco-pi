import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { StringEnum, Type, type AssistantMessage, type TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Container } from "@mariozechner/pi-tui";
import type { Static } from "typebox";
import { FALLBACK_SESSION_ID, normalizeSessionId, sessionIdFromContext } from "../session-identity";
import { featureDeletionCompletionBlock } from "./feature-deletion-detector";
import { repoRoot as gitRepoRoot } from "./git-runtime";
import { requirementLockCompletionBlockForSession, specDeltasForSession } from "./requirement-lock";
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

const MICRO_EXPLANATORY_PROMPT_PATTERNS = [
  /[?？]\s*$/,
  /어떻게|왜|뭐|무엇|어떤|가능|불가능|할\s*건데|할건데|되어\s*있|돼\s*있|반영되어|반영돼|맞(?:아|나요)|인가|일까|어때/i,
];

const ACTION_REQUEST_PROMPT_PATTERNS = [
  /해\s*줘|해주세요|해라|하자|고쳐|수정|구현|반영\s*해|반영\s*하|적용\s*해|적용\s*하|만들|실행|돌려|검증\s*해|확인\s*해|테스트\s*해|커밋|푸시/i,
  /\b(fix|implement|build|run|test|verify|commit|push)\b/i,
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
  outcome: Type.Optional(StringEnum(["complete", "blocked", "deferred"] as const, { description: "Use complete for successful completion; use blocked or deferred when stopping without completion is the correct boundary." })),
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
  turns: Record<string, StructuralGateTurnState>;
}

export type StructuralGateExternalCheck = (review: StructuralGateReview, ctx: ExtensionContext) => Promise<string | undefined>;

export function createStructuralGateState(): StructuralGateState {
  return { turns: {} };
}

function isMicroExplanatoryPrompt(prompt: string): boolean {
  const text = prompt.trim();
  if (!text || text.length > 180 || text.includes("\n")) return false;
  if (!MICRO_EXPLANATORY_PROMPT_PATTERNS.some((pattern) => pattern.test(text))) return false;
  return !ACTION_REQUEST_PROMPT_PATTERNS.some((pattern) => pattern.test(text));
}

export function promptRequiresStructuralGate(prompt: string): boolean {
  if (isMicroExplanatoryPrompt(prompt)) return false;
  return NON_TRIVIAL_PROMPT_PATTERNS.some((pattern) => pattern.test(prompt));
}

function structuralGateSessionKey(sessionId: string | undefined): string {
  return normalizeSessionId(sessionId || FALLBACK_SESSION_ID);
}

function getStructuralGateTurn(state: StructuralGateState, sessionId: string | undefined): StructuralGateTurnState | undefined {
  return state.turns[structuralGateSessionKey(sessionId)];
}

function setStructuralGateTurn(state: StructuralGateState, sessionId: string | undefined, turn: StructuralGateTurnState): void {
  state.turns[structuralGateSessionKey(sessionId)] = turn;
  state.current = turn;
}

export function startStructuralGateTurn(state: StructuralGateState, prompt: string, sessionId = FALLBACK_SESSION_ID): void {
  setStructuralGateTurn(state, sessionId, {
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
  });
}

function objectInput(input: unknown): Record<string, unknown> | undefined {
  return input && typeof input === "object" ? input as Record<string, unknown> : undefined;
}

export function markStructuralGateToolUse(state: StructuralGateState, toolName: string, input?: unknown, sessionId = FALLBACK_SESSION_ID): void {
  const turn = getStructuralGateTurn(state, sessionId);
  if (!turn) return;
  if (toolName === STRUCTURAL_GATE_TOOL_NAME) return;
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

function structuralOutcome(review: StructuralGateReview): "complete" | "blocked" | "deferred" {
  return review.outcome ?? "complete";
}

function hasConcreteStopEvidence(review: StructuralGateReview, outcome: "blocked" | "deferred"): boolean {
  const haystack = `${review.failureModes}\n${review.loopGovernance}\n${review.completionBoundary}`;
  if (outcome === "blocked") {
    return /blocked|approval|boundary|secret|credential|account|cannot|can't|unable|external|블로커|차단|승인|경계|비밀|계정|권한|외부|진행할 수|대기/i.test(haystack);
  }
  return /deferred|optional|new[- ]?scope|follow[- ]?up|out of scope|보류|선택|별도\s*범위|새\s*범위|후속/i.test(haystack);
}

export function recordLoopTransitionReview(state: StructuralGateState, review: LoopTransitionReview, sessionId = FALLBACK_SESSION_ID): { ok: boolean; reason?: string } {
  if (!getStructuralGateTurn(state, sessionId)) startStructuralGateTurn(state, "", sessionId);
  const missing = [
    ["currentStep", review.currentStep, nonEmpty],
    ["nextStep", review.nextStep, nonEmptyOrFinal],
    ["transitionDecision", review.transitionDecision, nonEmpty],
    ["currentTodoFit", review.currentTodoFit, nonEmpty],
  ].filter(([, value, predicate]) => typeof value !== "string" || !(predicate as (input: string) => boolean)(value));

  const turn = getStructuralGateTurn(state, sessionId)!;
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

export function recordStructuralGateReview(state: StructuralGateState, review: StructuralGateReview, sessionId = FALLBACK_SESSION_ID): { ok: boolean; reason?: string } {
  if (!getStructuralGateTurn(state, sessionId)) startStructuralGateTurn(state, "", sessionId);
  const missing = [
    ["acceptanceFit", review.acceptanceFit],
    ["runtimeFit", review.runtimeFit],
    ["failureModes", review.failureModes],
    ["verificationEvidence", review.verificationEvidence],
    ["loopGovernance", review.loopGovernance],
    ["completionBoundary", review.completionBoundary],
  ].filter(([, value]) => typeof value !== "string" || !nonEmpty(value));

  const turn = getStructuralGateTurn(state, sessionId)!;
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

  const outcome = structuralOutcome(review);
  if (outcome !== "complete") {
    if (review.readyToComplete) {
      const reason = `${outcome} outcome cannot use readyToComplete=true`;
      turn.passed = false;
      turn.rejectionReason = reason;
      return { ok: false, reason };
    }

    if (!hasConcreteStopEvidence(review, outcome)) {
      const reason = `${outcome} outcome requires concrete stop evidence in failureModes, loopGovernance, or completionBoundary`;
      turn.passed = false;
      turn.rejectionReason = reason;
      return { ok: false, reason };
    }

    turn.passed = true;
    turn.rejectionReason = undefined;
    clearRepairState(turn);
    return { ok: true };
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

  const requirementBlock = requirementLockCompletionBlockForSession(sessionId, review.verificationEvidence);
  if (requirementBlock) {
    turn.passed = false;
    turn.rejectionReason = requirementBlock;
    return { ok: false, reason: requirementBlock };
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

function protocolRepairInstruction(reason: string): string | undefined {
  const missingMatch = reason.match(/^(?:autonomous protocol\s+([a-z-]+)\s+required tools missing|required autonomous protocol tools missing):\s*(.+)$/i);
  if (missingMatch) {
    const protocolKind = missingMatch[1];
    const tools = missingMatch[2]
      .split(",")
      .map((tool) => tool.trim())
      .filter(Boolean);
    const nextAction = tools.includes("report_research_gate")
      ? "Run web-analysis source collection, then call report_research_gate with user materials, external sources, source confidence review, conflicts, and evidence gaps. If spec_gate is still missing, run it, then rerun structural_gate."
      : tools.includes("integration_verifier")
        ? "Run integration_verifier for the active manifest, then rerun structural_gate."
        : tools.includes("branch_switch_guard")
          ? "Run branch_switch_guard for the requested branch, then rerun structural_gate."
          : tools.includes("parallel_work_plan")
            ? "Run parallel_work_plan to assign file/domain ownership, then continue the required tool sequence."
            : tools.includes("agent_orchestrator")
              ? "Run agent_orchestrator for the active manifest/lane workflow, then rerun structural_gate."
              : tools.includes("worktree_manage")
                ? "Run worktree_manage for required worktree lifecycle actions, then rerun structural_gate."
                : tools.includes("spec_gate")
                  ? "Run spec_gate for the active non-trivial coding scope, then rerun structural_gate."
                  : `Run the missing required tool${tools.length > 1 ? "s" : ""}, then rerun structural_gate.`;
    return [
      "Autonomous protocol repair required.",
      protocolKind ? `Protocol: ${protocolKind}` : undefined,
      "Missing required tools:",
      ...tools.map((tool) => `- ${tool}`),
      "Next action:",
      nextAction,
      "Do not claim completion until protocol is satisfied.",
    ].filter(Boolean).join("\n");
  }

  const blockedMatch = reason.match(/^(?:autonomous protocol\s+([a-z-]+)\s+has blocked tools|autonomous protocol has blocked tools):\s*(.+)$/i);
  if (blockedMatch) {
    const protocolKind = blockedMatch[1];
    const blocked = blockedMatch[2].trim();
    const branchAdvice = blocked.includes("branch_switch_guard")
      ? "For branch_switch_guard, report the blocker or repair the dirty cwd safely before retrying."
      : undefined;
    return [
      "Autonomous protocol repair required.",
      protocolKind ? `Protocol: ${protocolKind}` : undefined,
      "Blocked protocol tools:",
      `- ${blocked}`,
      branchAdvice,
      "Next action:",
      "Resolve the blocked tool reason safely or report a concrete blocker; rerun structural_gate only after the blocker is resolved.",
    ].filter(Boolean).join("\n");
  }

  if (/approval-boundary/i.test(reason)) {
    return [
      "Autonomous protocol repair required.",
      "Protocol: approval-boundary",
      "Approval boundary detected.",
      "Next action:",
      "Stop before the hard boundary and rerun structural_gate with readyToComplete=false and outcome=blocked or outcome=deferred.",
      "Do not execute publish/deploy/payment/secret/destructive/private-transfer actions.",
    ].join("\n");
  }

  return undefined;
}

export function repairPromptText(reason: string, originalText: string): string {
  return [
    "내부 structural_gate 보강이 필요합니다.",
    "이 내부 gate 메시지를 사용자에게 보여주거나 요약하지 마세요.",
    "아직 완료를 주장하지 마세요.",
    "최종 사용자 답변은 반드시 한국어 존댓말로 작성하세요. 사용자가 다른 언어를 명시한 경우에만 그 언어를 따르세요.",
    "원래 사용자 요청 언어와 출력 형식을 유지하고, 이전 차단/보강 과정을 언급하지 마세요.",
    `Reason: ${reason}`,
    protocolRepairInstruction(reason),
    "structural_gate를 호출해 gate checks와 loopGovernance를 기록하세요. 실제로 완료된 경우에만 readyToComplete=true를 사용하고, 아니면 먼저 수정/검증을 계속하세요.",
    originalText ? `차단된 원래 초안:\n${originalText}` : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function continuationPromptText(reason: string): string {
  return [
    "자동 재개 필요: 최종 답변에 현재 진행 중인 todo 또는 남은 인스코프 작업 표현이 감지됐습니다.",
    `감지 근거: ${reason}`,
    "todo 상태를 다시 확인하고 실제 active todo가 있으면 이어서 진행하세요.",
    "명시적 보류, 승인 경계, 새 범위라면 loop_transition과 structural_gate로 근거를 기록하고 보류/차단으로 보고하세요.",
    "다시 완료를 보고하기 전 structural_gate를 호출하세요.",
  ].join("\n");
}

function isDeferredOrBlockedLine(line: string): boolean {
  return /\b(deferred|optional|nice[- ]?to[- ]?have|new[- ]?scope|blocked|approval|follow[- ]?up)\b|보류|선택|별도\s*범위|새\s*범위|승인\s*경계|블로커|차단/i.test(line);
}

function isCompletedOrEmptyActiveLine(line: string): boolean {
  return /\b(done|complete[sd]?|closed|resolved|none|no\s+active|no\s+current)\b|완료|끝났|해결|없(?:었|습니다|음|다)?/i.test(line);
}

function isStatusAssertionLine(line: string): boolean {
  return /^(현재|진행\s*중|pending|remaining|still|todo|todos?|할\s*일|남은\s*작업|아직|미완료|#\d)/i.test(line)
    || /^(?:active\/current|active|current|in[-_ ]?progress)\s+todos?\b\s*(?::|=|-|\b(?:is|are|remain|remains|still|pending|open|left)\b)/i.test(line);
}

function finalTextLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•]\s*/, ""))
    .filter(Boolean);
}

function isExplanatoryCompletionMention(line: string): boolean {
  return /주장|문구|예시|조건|경우|기준|없음|없습니다|아님|아닙|금지|차단|유지|필수|생략|가능/i.test(line);
}

export function detectCompletionClaimFromFinalText(text: string): string | undefined {
  for (const line of finalTextLines(text)) {
    if (isExplanatoryCompletionMention(line)) continue;
    if (/(?:완료|수정|구현|반영|적용|검증|테스트|해결|커밋|푸시)(?:\s*(?:완료|통과))?\s*(?:했|했습니다|됐|되었습니다|끝났습니다|완료했습니다)/i.test(line)
      || /(?:고쳤|고쳤습니다|끝났|끝났습니다|통과했습니다)/i.test(line)
      || /\b(?:completed|fixed|implemented|verified|tested|passed|committed|pushed)\b/i.test(line)) {
      return `completion claim requires structural_gate: ${line}`;
    }
  }
  return undefined;
}

export function detectRequiredContinuationFromFinalText(text: string): string | undefined {
  const lines = finalTextLines(text);

  for (const line of lines) {
    if (!isStatusAssertionLine(line) || isDeferredOrBlockedLine(line) || isCompletedOrEmptyActiveLine(line)) continue;

    const mentionsTodo = /\btodos?\b|할\s*일/i.test(line);
    const activeTodo = mentionsTodo && (/\b(active|current|in[-_ ]?progress)\b|현재|진행\s*중/i.test(line));
    const openTodo = mentionsTodo && (/\b(pending|remaining|still|to\s+do)\b|남아|그대로|준비|해야/i.test(line));
    const unfinishedWork = /\b(remaining\s+work|still\s+need|not\s+(?:done|complete[sd]?))\b|남은\s*작업|아직\s+.*(?:필요|해야)|미완료/i.test(line);

    if (activeTodo || openTodo || unfinishedWork) {
      return `final message indicates active/current todo remains: ${line}`;
    }
  }

  return undefined;
}

export function guardAssistantMessage(state: StructuralGateState, message: AssistantMessage, sessionId = FALLBACK_SESSION_ID): { message?: AssistantMessage; followUp?: string } {
  const turn = getStructuralGateTurn(state, sessionId);
  if (!turn) return {};
  if (message.stopReason === "toolUse" || message.stopReason === "error" || message.stopReason === "aborted") return {};
  if (hasToolCall(message)) return {};

  const text = assistantText(message);
  const completionClaimReason = detectCompletionClaimFromFinalText(text);
  if (!turn.required && !completionClaimReason) return {};
  if (!turn.required && completionClaimReason) {
    turn.required = true;
    turn.rejectionReason = completionClaimReason;
  }

  const continuationReason = detectRequiredContinuationFromFinalText(text);
  if (turn.passed && !continuationReason) return {};

  const reason = turn.passed
    ? continuationReason!
    : turn.review
      ? `structural_gate did not pass (${turn.rejectionReason ?? "unknown reason"})`
      : completionClaimReason ?? "structural_gate tool was not called";
  const replacement: AssistantMessage = {
    ...message,
    content: [{ type: "text", text: GUARD_REPAIR_STATUS_TEXT }],
    stopReason: "stop",
  };

  const key = repairAttemptKey(message, text, [reason]);
  const followUp = queueRepairForAttempt(turn, key, turn.passed ? continuationPromptText(reason) : repairPromptText(reason, text));
  if (!followUp) return {};

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
    async execute(_toolCallId: string, params: LoopTransitionReview, _signal: AbortSignal | undefined, _onUpdate: undefined, ctx: ExtensionContext) {
      const result = recordLoopTransitionReview(state, params, sessionIdFromContext(ctx));
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

async function activeParallelManifestIntegrationBlock(cwd: string, _review: StructuralGateReview): Promise<string | undefined> {
  const root = await gitRepoRoot(cwd).catch(() => cwd);
  let entries: string[] = [];
  try {
    entries = await readdir(join(root, ".pi", "agent-runs"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return "active parallel manifest check failed; run integration_verifier or resolve manifest state before completion";
  }
  for (const groupId of entries) {
    try {
      const raw = await readFile(join(root, ".pi", "agent-runs", groupId, "manifest.json"), "utf8");
      const manifest = JSON.parse(raw) as { status?: string; lanes?: unknown[]; integrationEvidence?: string };
      const active = manifest.status !== "integrated" && manifest.status !== "closed";
      if (active && (manifest.lanes?.length ?? 0) > 1 && !manifest.integrationEvidence) {
        return `active parallel manifest ${groupId} requires integration_verifier evidence before completion`;
      }
    } catch {
      return `active parallel manifest ${groupId} could not be inspected; run integration_verifier or fix manifest state before completion`;
    }
  }
  return undefined;
}

function recordStructuralGateExternalBlock(state: StructuralGateState, review: StructuralGateReview, reason: string, sessionId: string): void {
  const turn = getStructuralGateTurn(state, sessionId);
  if (!turn) return;
  turn.required = true;
  turn.review = review;
  turn.passed = false;
  turn.rejectionReason = reason;
}

export function createStructuralGateTool(
  state: StructuralGateState,
  externalCheck?: StructuralGateExternalCheck,
): ToolDefinition<typeof StructuralGateParams, { ok: boolean; reason?: string }, unknown> {
  return {
    name: STRUCTURAL_GATE_TOOL_NAME,
    label: "Structural gate",
    description: "Required fail-closed completion gate for non-trivial choco-pi work. Call before final completion reporting.",
    promptSnippet: "structural_gate: required before final completion on non-trivial work; records Acceptance fit, Runtime fit, Failure modes, Verification evidence, Loop governance, Completion boundary, and confidence.",
    promptGuidelines: [
      "For non-trivial problem-solving/development turns, call structural_gate before final completion reporting.",
      "If structural_gate cannot pass, continue fixing/verifying instead of claiming completion.",
      "structural_gate.loopGovernance must state that step/todo transitions stayed within the current plan and that any new work after the current todo used new steering/new loop or was deferred.",
      "If structural_gate confidence would be Medium, do not complete. Reinforce verification to reach High, or use outcome=blocked/deferred with readyToComplete=false and concrete stop evidence when stopping is the correct boundary.",
    ],
    parameters: StructuralGateParams,
    renderShell: "self",
    async execute(_toolCallId: string, params: StructuralGateReview, _signal: AbortSignal | undefined, _onUpdate: undefined, ctx: ExtensionContext) {
      const sessionId = sessionIdFromContext(ctx);
      const cwd = ctx.cwd || process.cwd();
      const shouldComplete = params.readyToComplete && structuralOutcome(params) === "complete";
      const integrationBlock = shouldComplete ? await activeParallelManifestIntegrationBlock(cwd, params) : undefined;
      const featureDeletionBlock = integrationBlock || !shouldComplete ? undefined : await featureDeletionCompletionBlock(cwd, specDeltasForSession(sessionId));
      const protocolBlock = integrationBlock || featureDeletionBlock ? undefined : await externalCheck?.(params, ctx);
      const block = integrationBlock ?? featureDeletionBlock ?? protocolBlock;
      const result = block ? { ok: false, reason: block } : recordStructuralGateReview(state, params, sessionId);
      if (block) recordStructuralGateExternalBlock(state, params, block, sessionId);
      return {
        content: [{ type: "text", text: result.ok ? "Structural gate passed." : `Structural gate failed: ${result.reason}` }],
        details: { ok: result.ok, reason: result.reason, readyToComplete: params.readyToComplete, outcome: structuralOutcome(params) },
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

export function installStructuralGate(
  pi: Pick<ExtensionAPI, "on" | "registerTool" | "sendMessage">,
  externalCheck?: StructuralGateExternalCheck,
): void {
  const state = createStructuralGateState();
  pi.registerTool(createLoopTransitionTool(state));
  pi.registerTool(createStructuralGateTool(state, externalCheck));

  pi.on("before_agent_start", (event, ctx) => {
    startStructuralGateTurn(state, event.prompt ?? "", sessionIdFromContext(ctx));
  });

  pi.on("tool_call", (event, ctx) => {
    markStructuralGateToolUse(state, event.toolName, event.input, sessionIdFromContext(ctx));
  });

  pi.on("message_end", (event, ctx) => {
    if (event.message.role !== "assistant") return undefined;
    const result = guardAssistantMessage(state, event.message, sessionIdFromContext(ctx));
    if (result.followUp) {
      pi.sendMessage(
        {
          customType: "choco.structural_gate.repair",
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
