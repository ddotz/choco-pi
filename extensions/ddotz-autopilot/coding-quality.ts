import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import {
  clearRepairState,
  GUARD_REPAIR_STATUS_TEXT,
  queueRepairForAttempt,
  repairAttemptKey,
  type GuardRepairState,
} from "./guard-repair-status";
import type { WorkMode } from "./mode";
import { sectionContent } from "./quality-section";

export type CodingQualityIssue =
  | "missing-result"
  | "missing-verification"
  | "missing-confidence"
  | "missing-red-root-fix-green";

export interface CodingQualityResult {
  required: boolean;
  passed: boolean;
  issues: CodingQualityIssue[];
}

export interface CodingQualityGuardResult {
  message?: AssistantMessage;
  followUp?: string;
}

export interface CodingRepairState extends GuardRepairState {}

function firstSectionContent(text: string, labels: string[]): string {
  for (const label of labels) {
    const content = sectionContent(text, label);
    if (content.trim()) return content;
  }
  return "";
}

function hasResult(text: string): boolean {
  return firstSectionContent(text, ["Result", "결과"]).trim().length > 0;
}

function verificationContent(text: string): string {
  return firstSectionContent(text, ["Verification", "검증", "GREEN"]);
}

function hasVerification(text: string): boolean {
  return /pnpm|npm|pytest|vitest|test|lint|typecheck|tsc|passed|pass|통과|실행|확인|green/i.test(verificationContent(text));
}

function hasConfidence(text: string): boolean {
  return /\b(High|Medium|Low)\b/.test(firstSectionContent(text, ["Confidence", "신뢰도"]));
}

function appearsToBeCodingCompletion(text: string): boolean {
  return /\b(Result|Verification|RED|GREEN|Fix|Root cause):/i.test(text)
    || /^#{1,6}\s*(Result|Verification|RED|GREEN|Fix|Root cause|결과|검증|원인|수정)\s*$/im.test(text)
    || /구현\s*완료|수정\s*완료|고쳤|커밋|푸시|tests?\s+passed|검증.*통과|완료했습니다/i.test(text);
}

function appearsToBeBugFixCompletion(text: string): boolean {
  return /버그|\bbug\b|bug[- ]?fix|fixed\s+(?:the\s+)?bug|regression|회귀|오류|에러|고쳤|Root cause|RED|GREEN/i.test(text);
}

function hasRedRootFixGreen(text: string): boolean {
  return firstSectionContent(text, ["RED"]).trim().length > 0
    && firstSectionContent(text, ["Root cause", "원인"]).trim().length > 0
    && firstSectionContent(text, ["Fix", "수정"]).trim().length > 0
    && firstSectionContent(text, ["GREEN"]).trim().length > 0;
}

export function evaluateCodingQuality(mode: WorkMode, answer: string): CodingQualityResult {
  if (mode !== "coding") return { required: false, passed: true, issues: [] };

  const issues: CodingQualityIssue[] = [];
  if (!hasResult(answer)) issues.push("missing-result");
  if (!hasVerification(answer)) issues.push("missing-verification");
  if (!hasConfidence(answer)) issues.push("missing-confidence");
  if (appearsToBeBugFixCompletion(answer) && !hasRedRootFixGreen(answer)) issues.push("missing-red-root-fix-green");

  return { required: true, passed: issues.length === 0, issues };
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

function repairPrompt(quality: CodingQualityResult): string {
  return [
    "내부 coding 품질 보강이 필요합니다.",
    "이 내부 guardrail 메시지를 사용자에게 보여주거나 요약하지 마세요.",
    "아직 완료를 주장하지 마세요.",
    "최종 사용자 답변은 반드시 한국어 존댓말로 작성하세요. 사용자가 다른 언어를 명시한 경우에만 그 언어를 따르세요.",
    "원래 사용자 요청 언어와 출력 형식을 유지하고, 이전 차단/보강 과정을 언급하지 마세요.",
    `Issues: ${quality.issues.join(", ")}`,
    "Result, Verification, Confidence 섹션으로 최종 답변을 다시 작성하세요.",
    "버그 수정 또는 회귀 수정이면 RED, Root cause, Fix, GREEN 섹션도 포함하세요.",
    "Confidence: High는 실제 검증 명령 또는 관찰 증거가 있을 때만 사용하세요. 아니면 confidence를 낮추거나 구체적인 blocker를 보고하세요.",
  ].join("\n\n");
}

export function guardCodingQualityMessage(
  mode: WorkMode,
  message: AssistantMessage,
  repairState?: CodingRepairState,
): CodingQualityGuardResult {
  if (mode !== "coding") return {};
  if (message.stopReason === "toolUse" || message.stopReason === "error" || message.stopReason === "aborted") return {};
  if (hasToolCall(message)) return {};

  const text = assistantText(message);
  if (!appearsToBeCodingCompletion(text)) return {};

  const quality = evaluateCodingQuality(mode, text);
  if (quality.passed) {
    clearRepairState(repairState);
    return {};
  }

  const key = repairAttemptKey(message, text, quality.issues);
  const followUp = queueRepairForAttempt(repairState, key, repairPrompt(quality));

  return {
    message: {
      ...message,
      content: [{ type: "text", text: GUARD_REPAIR_STATUS_TEXT }],
      stopReason: "stop",
    },
    followUp,
  };
}
