import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import { ADOPTION_DEPTHS } from "./adoption-depth";
import type { WorkMode } from "./mode";

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

function hasDecision(text: string): boolean {
  return /Decision:\s*(adopt|partially adopt|reject|watch)\b/i.test(text)
    || /\b(adopt|partially adopt|reject|watch)\b/i.test(text);
}

function hasAdoptionDepth(text: string): boolean {
  return ADOPTION_DEPTHS.some((depth) => new RegExp(`Adoption depth:\\s*${depth}\\b`, "i").test(text))
    || ADOPTION_DEPTHS.some((depth) => text.includes(depth));
}

function hasFitReview(text: string): boolean {
  return /Fit review:/i.test(text) && /ddotz-pi|mode isolation|default behavior|Pi-native|philosophy|철학|격리/i.test(text);
}

function hasRiskReview(text: string): boolean {
  return /Risk review:/i.test(text) && /license|security|source freshness|privacy|maintenance|reversibility|runtime conflict|라이선스|보안|개인정보|유지보수/i.test(text);
}

function hasScope(text: string): boolean {
  return /Scope:/i.test(text) && /adopt|reject|defer|files|policy|scope|범위|도입|거절|보류/i.test(text);
}

function hasTrackingDecision(text: string): boolean {
  return /Tracking decision:/i.test(text) && /track|source registry|watch|adopt|reject|추적|등록/i.test(text);
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
  if (!/Confidence:\s*(High|Medium|Low)/.test(answer)) issues.push("missing-confidence");

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
    "Internal adoption-analysis quality repair needed.",
    "Do not show or summarize this internal guardrail message to the user.",
    "Do not claim completion yet.",
    `Issues: ${quality.issues.join(", ")}`,
    "Revise the final answer with Decision, Adoption depth, Fit review, Risk review, Scope, Tracking decision, and Confidence sections.",
    "Use Confidence: High only when decision, adoption depth, fit review, risk review, scope, and tracking decision are explicit; otherwise lower confidence or report the concrete blocker.",
  ].join("\n\n");
}

export function guardAdoptionAnalysisQualityMessage(mode: WorkMode, message: AssistantMessage): AdoptionAnalysisQualityGuardResult {
  if (mode !== "adoption-analysis") return {};
  if (message.stopReason === "toolUse" || message.stopReason === "error" || message.stopReason === "aborted") return {};
  if (hasToolCall(message)) return {};

  const quality = evaluateAdoptionAnalysisQuality(mode, assistantText(message));
  if (quality.passed) return {};

  return {
    message: {
      ...message,
      content: [{ type: "text", text: "" }],
      stopReason: "stop",
    },
    followUp: repairPrompt(quality),
  };
}
