import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import { GUARD_REPAIR_STATUS_TEXT } from "./guard-repair-status";
import type { WorkMode } from "./mode";
import { sectionContent } from "./quality-section";

export type WebResearchQualityIssue =
  | "missing-evidence-or-provenance"
  | "missing-critical-review"
  | "missing-confidence"
  | "high-confidence-with-thin-evidence";

export interface WebResearchQualityResult {
  required: boolean;
  passed: boolean;
  issues: WebResearchQualityIssue[];
  evidenceCount: number;
}

export interface WebResearchQualityGuardResult {
  message?: AssistantMessage;
  followUp?: string;
}

export interface WebResearchRepairState {
  repairQueued: boolean;
}

function countUniqueUrls(text: string): number {
  return new Set(text.match(/https?:\/\/\S+/g) ?? []).size;
}

function countEvidenceLines(text: string): number {
  return text
    .split("\n")
    .filter((line) => /published|updated|retrieved|full text|metadata|doi:|access quality/i.test(line))
    .length;
}

function evidenceCount(text: string): number {
  return Math.max(countUniqueUrls(text), countEvidenceLines(text));
}

function appearsToBeWebResearchAnswer(text: string): boolean {
  return ["Conclusion", "Evidence", "Critical review"]
    .some((label) => sectionContent(text, label).length > 0);
}

export function evaluateWebResearchQuality(mode: WorkMode, answer: string): WebResearchQualityResult {
  if (mode !== "web-analysis") return { required: false, passed: true, issues: [], evidenceCount: 0 };

  const issues: WebResearchQualityIssue[] = [];
  const evidence = evidenceCount(answer);
  const hasCriticalReview = /\S/.test(sectionContent(answer, "Critical review")) || /비판|한계|caveat|conflict|충돌|불확실/i.test(answer);
  const confidence = sectionContent(answer, "Confidence");
  const hasConfidence = /\b(High|Medium|Low)\b/.test(confidence);
  const claimsHigh = /\bHigh\b/.test(confidence);

  if (evidence === 0) issues.push("missing-evidence-or-provenance");
  if (!hasCriticalReview) issues.push("missing-critical-review");
  if (!hasConfidence) issues.push("missing-confidence");
  if (claimsHigh && evidence < 2) issues.push("high-confidence-with-thin-evidence");

  return { required: true, passed: issues.length === 0, issues, evidenceCount: evidence };
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

function repairPrompt(quality: WebResearchQualityResult): string {
  return [
    "내부 web-analysis 품질 보강이 필요합니다.",
    "이 내부 guardrail 메시지를 사용자에게 보여주거나 요약하지 마세요.",
    "아직 완료를 주장하지 마세요.",
    "최종 사용자 답변은 반드시 한국어 존댓말로 작성하세요. 사용자가 다른 언어를 명시한 경우에만 그 언어를 따르세요.",
    "원래 사용자 요청 언어와 출력 형식을 유지하고, 이전 차단/보강 과정을 언급하지 마세요.",
    `Issues: ${quality.issues.join(", ")}`,
    `Evidence count detected: ${quality.evidenceCount}`,
    "Conclusion, Evidence, Critical review, Confidence 섹션으로 최종 답변을 다시 작성하세요. Confidence: High는 관련 provenance가 2개 이상이고 critical review가 있을 때만 사용하세요. 아니면 confidence를 낮추거나 구체적인 evidence blocker를 보고하세요.",
  ].join("\n\n");
}

export function guardWebResearchQualityMessage(
  mode: WorkMode,
  message: AssistantMessage,
  repairState?: WebResearchRepairState,
): WebResearchQualityGuardResult {
  if (mode !== "web-analysis") return {};
  if (message.stopReason === "toolUse" || message.stopReason === "error" || message.stopReason === "aborted") return {};
  if (hasToolCall(message)) return {};

  const text = assistantText(message);
  if (!appearsToBeWebResearchAnswer(text)) return {};

  const quality = evaluateWebResearchQuality(mode, text);
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
