import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import { ADOPTION_DEPTHS } from "./adoption-depth";
import { GUARD_REPAIR_STATUS_TEXT } from "./guard-repair-status";
import type { WorkMode } from "./mode";
import { sectionContent, sectionHas } from "./quality-section";

export type AdoptionAnalysisQualityIssue =
  | "missing-decision"
  | "missing-adoption-depth"
  | "missing-fit-review"
  | "missing-risk-review"
  | "missing-scope"
  | "missing-tracking-decision"
  | "missing-confidence";

export interface AdoptionAnalysisQualityResult {
  required: boolean;
  passed: boolean;
  issues: AdoptionAnalysisQualityIssue[];
}

export interface AdoptionAnalysisQualityGuardResult {
  message?: AssistantMessage;
  followUp?: string;
}

export interface AdoptionAnalysisRepairState {
  repairQueued: boolean;
}

function hasDecision(text: string): boolean {
  return /\b(partially adopt|adopt|reject|watch)\b/i.test(sectionContent(text, "Decision"));
}

function hasAdoptionDepth(text: string): boolean {
  const depthPattern = ADOPTION_DEPTHS.join("|");
  return new RegExp(`\\b(${depthPattern})\\b`, "i").test(sectionContent(text, "Adoption depth"));
}

function hasFitReview(text: string): boolean {
  return sectionHas(text, "Fit review", /ddotz-pi|mode isolation|default behavior|Pi-native|philosophy|철학|격리/i);
}

function hasRiskReview(text: string): boolean {
  return sectionHas(text, "Risk review", /license|security|source freshness|privacy|maintenance|reversibility|runtime conflict|라이선스|보안|개인정보|유지보수/i);
}

function hasScope(text: string): boolean {
  return sectionHas(text, "Scope", /adopt|reject|defer|files|policy|scope|범위|도입|거절|보류/i);
}

function hasTrackingDecision(text: string): boolean {
  return sectionHas(text, "Tracking decision", /track|source registry|watch|adopt|reject|추적|등록/i);
}

function hasConfidence(text: string): boolean {
  return /\b(High|Medium|Low)\b/.test(sectionContent(text, "Confidence"));
}

function appearsToBeAdoptionAnalysisAnswer(text: string): boolean {
  return ["Decision", "Adoption depth", "Fit review", "Risk review", "Scope", "Tracking decision"]
    .some((label) => sectionContent(text, label).length > 0);
}

export function evaluateAdoptionAnalysisQuality(mode: WorkMode, answer: string): AdoptionAnalysisQualityResult {
  if (mode !== "adoption-analysis") return { required: false, passed: true, issues: [] };

  const issues: AdoptionAnalysisQualityIssue[] = [];
  if (!hasDecision(answer)) issues.push("missing-decision");
  if (!hasAdoptionDepth(answer)) issues.push("missing-adoption-depth");
  if (!hasFitReview(answer)) issues.push("missing-fit-review");
  if (!hasRiskReview(answer)) issues.push("missing-risk-review");
  if (!hasScope(answer)) issues.push("missing-scope");
  if (!hasTrackingDecision(answer)) issues.push("missing-tracking-decision");
  if (!hasConfidence(answer)) issues.push("missing-confidence");

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

function repairPrompt(quality: AdoptionAnalysisQualityResult): string {
  return [
    "내부 adoption-analysis 품질 보강이 필요합니다.",
    "이 내부 guardrail 메시지를 사용자에게 보여주거나 요약하지 마세요.",
    "아직 완료를 주장하지 마세요.",
    "최종 사용자 답변은 반드시 한국어 존댓말로 작성하세요. 사용자가 다른 언어를 명시한 경우에만 그 언어를 따르세요.",
    "원래 사용자 요청 언어와 출력 형식을 유지하고, 이전 차단/보강 과정을 언급하지 마세요.",
    `Issues: ${quality.issues.join(", ")}`,
    "Decision, Adoption depth, Fit review, Risk review, Scope, Tracking decision, Confidence 섹션으로 최종 답변을 다시 작성하세요.",
    "Confidence: High는 decision, adoption depth, fit review, risk review, scope, tracking decision이 명시적일 때만 사용하세요. 아니면 confidence를 낮추거나 구체적인 blocker를 보고하세요.",
  ].join("\n\n");
}

export function guardAdoptionAnalysisQualityMessage(
  mode: WorkMode,
  message: AssistantMessage,
  repairState?: AdoptionAnalysisRepairState,
): AdoptionAnalysisQualityGuardResult {
  if (mode !== "adoption-analysis") return {};
  if (message.stopReason === "toolUse" || message.stopReason === "error" || message.stopReason === "aborted") return {};
  if (hasToolCall(message)) return {};

  const text = assistantText(message);
  if (!appearsToBeAdoptionAnalysisAnswer(text)) return {};

  const quality = evaluateAdoptionAnalysisQuality(mode, text);
  if (quality.passed) {
    if (repairState) repairState.repairQueued = false;
    return {};
  }

  const followUp = repairState?.repairQueued ? undefined : repairPrompt(quality);
  if (repairState) repairState.repairQueued = true;

  return {
    message: {
      ...message,
      content: [{ type: "text", text: GUARD_REPAIR_STATUS_TEXT }],
      stopReason: "stop",
    },
    followUp,
  };
}
