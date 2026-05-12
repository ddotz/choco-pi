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

export type ReportQualityIssue =
  | "missing-executive-summary"
  | "missing-evidence-notes"
  | "missing-main-report"
  | "missing-critical-review"
  | "missing-confidence";

export interface ReportQualityResult {
  required: boolean;
  passed: boolean;
  issues: ReportQualityIssue[];
}

export interface ReportQualityGuardResult {
  message?: AssistantMessage;
  followUp?: string;
}

export interface ReportRepairState extends GuardRepairState {}

function firstSectionContent(text: string, labels: string[]): string {
  for (const label of labels) {
    const content = sectionContent(text, label);
    if (content.trim()) return content;
  }
  return "";
}

function hasExecutiveSummary(text: string): boolean {
  return firstSectionContent(text, ["Executive summary", "요약", "핵심 요약"]).trim().length > 0;
}

function hasEvidenceNotes(text: string): boolean {
  const content = firstSectionContent(text, ["Evidence notes", "Evidence ledger", "근거", "증거", "출처"]);
  return /\S/.test(content) && /https?:\/\/|retrieved|published|updated|source|user material|access quality|출처|근거|원문|자료|사용자\s*자료/i.test(content);
}

function hasMainReport(text: string): boolean {
  return firstSectionContent(text, ["Main report", "Report", "본문", "보고서"]).trim().length > 0;
}

function hasCriticalReview(text: string): boolean {
  return firstSectionContent(text, ["Critical review", "비판적 검토", "한계"]).trim().length > 0;
}

function hasConfidence(text: string): boolean {
  return /\b(High|Medium|Low)\b/.test(firstSectionContent(text, ["Confidence", "신뢰도"]));
}

function appearsToBeReportAnswer(text: string): boolean {
  return [
    "Executive summary",
    "Evidence notes",
    "Evidence ledger",
    "Main report",
    "Critical review",
    "요약",
    "핵심 요약",
    "근거",
    "증거",
    "출처",
    "본문",
    "보고서",
    "비판적 검토",
    "한계",
  ].some((label) => sectionContent(text, label).trim().length > 0);
}

export function evaluateReportQuality(mode: WorkMode, answer: string): ReportQualityResult {
  if (mode !== "report") return { required: false, passed: true, issues: [] };

  const issues: ReportQualityIssue[] = [];
  if (!hasExecutiveSummary(answer)) issues.push("missing-executive-summary");
  if (!hasEvidenceNotes(answer)) issues.push("missing-evidence-notes");
  if (!hasMainReport(answer)) issues.push("missing-main-report");
  if (!hasCriticalReview(answer)) issues.push("missing-critical-review");
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

function repairPrompt(quality: ReportQualityResult): string {
  return [
    "내부 report 품질 보강이 필요합니다.",
    "이 내부 guardrail 메시지를 사용자에게 보여주거나 요약하지 마세요.",
    "아직 완료를 주장하지 마세요.",
    "최종 사용자 답변은 반드시 한국어 존댓말로 작성하세요. 사용자가 다른 언어를 명시한 경우에만 그 언어를 따르세요.",
    "원래 사용자 요청 언어와 출력 형식을 유지하고, 이전 차단/보강 과정을 언급하지 마세요.",
    `Issues: ${quality.issues.join(", ")}`,
    "Executive summary, Evidence notes, Main report, Critical review, Confidence 섹션으로 최종 답변을 다시 작성하세요.",
    "Confidence: High는 evidence notes와 critical review가 명시적일 때만 사용하세요. 아니면 confidence를 낮추거나 구체적인 evidence blocker를 보고하세요.",
  ].join("\n\n");
}

export function guardReportQualityMessage(
  mode: WorkMode,
  message: AssistantMessage,
  repairState?: ReportRepairState,
): ReportQualityGuardResult {
  if (mode !== "report") return {};
  if (message.stopReason === "toolUse" || message.stopReason === "error" || message.stopReason === "aborted") return {};
  if (hasToolCall(message)) return {};

  const text = assistantText(message);
  if (!appearsToBeReportAnswer(text)) return {};

  const quality = evaluateReportQuality(mode, text);
  if (quality.passed) {
    clearRepairState(repairState);
    return {};
  }

  const key = repairAttemptKey(message, text, quality.issues);
  const followUp = queueRepairForAttempt(repairState, key, repairPrompt(quality));
  if (!followUp) return {};

  return {
    message: {
      ...message,
      content: [{ type: "text", text: GUARD_REPAIR_STATUS_TEXT }],
      stopReason: "stop",
    },
    followUp,
  };
}
