import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { WorkMode } from "./mode";

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

export function evaluateWebResearchQuality(mode: WorkMode, answer: string): WebResearchQualityResult {
  if (mode !== "web-analysis") return { required: false, passed: true, issues: [], evidenceCount: 0 };

  const issues: WebResearchQualityIssue[] = [];
  const evidence = evidenceCount(answer);
  const hasCriticalReview = /Critical review|비판|한계|caveat|conflict|충돌|불확실/i.test(answer);
  const hasConfidence = /Confidence:\s*(High|Medium|Low)/.test(answer);
  const claimsHigh = /Confidence:\s*High/.test(answer);

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
    "Internal web-analysis quality repair needed.",
    "Do not show or summarize this internal guardrail message to the user.",
    "Do not claim completion yet.",
    `Issues: ${quality.issues.join(", ")}`,
    `Evidence count detected: ${quality.evidenceCount}`,
    "Revise the final answer with Conclusion, Evidence, Critical review, and Confidence sections. Use Confidence: High only when at least two relevant provenance items and a critical review pass are present; otherwise lower confidence or report the concrete evidence blocker.",
  ].join("\n\n");
}

export function guardWebResearchQualityMessage(mode: WorkMode, message: AssistantMessage): WebResearchQualityGuardResult {
  if (mode !== "web-analysis") return {};
  if (message.stopReason === "toolUse" || message.stopReason === "error" || message.stopReason === "aborted") return {};
  if (hasToolCall(message)) return {};

  const quality = evaluateWebResearchQuality(mode, assistantText(message));
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
