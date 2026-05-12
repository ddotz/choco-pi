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

export type DesignQualityIssue =
  | "missing-result"
  | "missing-verification"
  | "missing-notes"
  | "missing-confidence"
  | "missing-artifact-track"
  | "missing-visual-thesis"
  | "missing-korean-typography";

export interface DesignQualityResult {
  required: boolean;
  passed: boolean;
  issues: DesignQualityIssue[];
}

export interface DesignQualityGuardResult {
  message?: AssistantMessage;
  followUp?: string;
}

export interface DesignRepairState extends GuardRepairState {}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function headingSectionContent(text: string, label: string): string {
  const target = normalizeLabel(label);
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].trim().match(/^#{1,6}\s*(.+?)\s*$/);
    if (!match || normalizeLabel(match[1]) !== target) continue;
    const collected: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^#{1,6}\s+\S/.test(lines[cursor].trim())) break;
      collected.push(lines[cursor]);
    }
    return collected.join("\n").trim();
  }
  return "";
}

function firstSectionContent(text: string, labels: string[]): string {
  for (const label of labels) {
    const headingContent = headingSectionContent(text, label);
    if (headingContent.trim()) return headingContent;
    const content = sectionContent(text, label);
    if (content.trim()) return content;
  }
  return "";
}

function resultContent(text: string): string {
  return firstSectionContent(text, ["Result", "결과"]);
}

function verificationContent(text: string): string {
  return firstSectionContent(text, ["Verification", "검증"]);
}

function hasResult(text: string): boolean {
  return resultContent(text).trim().length > 0;
}

function hasVerification(text: string): boolean {
  const content = verificationContent(text);
  if (!content.trim()) return false;
  return /traceability|checked|검증|확인|근거|gstack|screenshot|스크린샷|responsive|breakpoint|DOM|console|simulator|device|blocker|QA/i.test(content);
}

function hasNotes(text: string): boolean {
  return firstSectionContent(text, ["Notes", "노트", "메모", "주의", "가정"]).trim().length > 0;
}

function hasConfidence(text: string): boolean {
  return /\b(High|Medium|Low)\b/.test(firstSectionContent(text, ["Confidence", "신뢰도"]));
}

function hasArtifactTrack(text: string): boolean {
  const content = resultContent(text);
  return /Artifact track|산출물\s*(종류|트랙)|Mobile web|모바일\s*웹|Mobile app|모바일\s*앱|Desktop web|데스크탑\s*웹|데스크톱\s*웹|Desktop app|데스크탑\s*앱|데스크톱\s*앱|Presentation slides|발표(?:용)?\s*슬라이드|slide deck|pitch deck/i.test(content);
}

const VISUAL_THESIS_DIMENSIONS = [
  /tone|톤/i,
  /typography|타이포그래피|폰트|서체/i,
  /color|색상|컬러|팔레트/i,
  /spacing|간격|여백|밀도/i,
  /surface|background|표면|배경|재질/i,
  /motion|모션|동작|animation|애니메이션/i,
  /differentiation|차별화|고유/i,
] as const;

function hasVisualThesis(text: string): boolean {
  const content = [
    firstSectionContent(text, ["Visual thesis", "비주얼 테제", "시각 방향", "디자인 방향"]),
    resultContent(text),
  ].join("\n");
  const hits = VISUAL_THESIS_DIMENSIONS.filter((pattern) => pattern.test(content)).length;
  const vagueOnly = /\b(modern|clean|polished|premium)\b|현대적|깔끔|프리미엄/i.test(content)
    && hits < 4;
  return hits >= 5 && !vagueOnly;
}

function hasKoreanTypography(text: string): boolean {
  const content = [
    firstSectionContent(text, ["Korean typography", "한국어 타이포그래피", "한글 타이포그래피"]),
    resultContent(text),
  ].join("\n");
  return /Pretendard|프리텐다드/i.test(content)
    && /word-break:\s*keep-all|keep-all|break-keep/i.test(content)
    && /text-wrap:\s*balance|balance/i.test(content)
    && /leading-tight|leading-snug|leading-none\s*(?:금지|avoid|not|never)|leading-none.*(?:금지|avoid|not|never)/i.test(content);
}

function appearsToBeDesignCompletion(text: string): boolean {
  return /\b(Result|Verification|Notes|Visual thesis|Artifact track):/i.test(text)
    || /^#{1,6}\s*(Result|Verification|Notes|결과|검증|노트|메모)\s*$/im.test(text)
    || /디자인\s*(방향|브리프|시안|개선안|완료)|UI\/UX|와이어프레임|레이아웃|비주얼\s*방향|발표(?:용)?\s*슬라이드|slide deck/i.test(text);
}

export function evaluateDesignQuality(mode: WorkMode, answer: string): DesignQualityResult {
  if (mode !== "design") return { required: false, passed: true, issues: [] };

  const issues: DesignQualityIssue[] = [];
  if (!hasResult(answer)) issues.push("missing-result");
  if (!hasVerification(answer)) issues.push("missing-verification");
  if (!hasNotes(answer)) issues.push("missing-notes");
  if (!hasConfidence(answer)) issues.push("missing-confidence");
  if (!hasArtifactTrack(answer)) issues.push("missing-artifact-track");
  if (!hasVisualThesis(answer)) issues.push("missing-visual-thesis");
  if (!hasKoreanTypography(answer)) issues.push("missing-korean-typography");

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

function repairPrompt(quality: DesignQualityResult): string {
  return [
    "내부 design 품질 보강이 필요합니다.",
    "이 내부 guardrail 메시지를 사용자에게 보여주거나 요약하지 마세요.",
    "아직 완료를 주장하지 마세요.",
    "최종 사용자 답변은 반드시 한국어 존댓말로 작성하세요. 사용자가 다른 언어를 명시한 경우에만 그 언어를 따르세요.",
    "원래 사용자 요청 언어와 출력 형식을 유지하고, 이전 차단/보강 과정을 언급하지 마세요.",
    `Issues: ${quality.issues.join(", ")}`,
    "Result, Verification, Notes, Confidence 섹션으로 최종 답변을 다시 작성하세요.",
    "Result에는 Artifact track(모바일웹/모바일앱/데스크탑웹/데스크탑앱/발표 슬라이드 중 하나), 구체적인 Visual thesis(톤, 타이포그래피, 색상, 간격, 표면/배경, 모션, 차별화), Korean typography/line-break 기준(Pretendard, word-break: keep-all, text-wrap: balance, leading-tight/snug 및 leading-none 금지)을 포함하세요.",
    "Verification에는 트랙별 QA 근거를 명시하세요. 웹/슬라이드는 gstack 또는 스크린샷/DOM 증거가 필요하고, 네이티브 앱은 시뮬레이터/디바이스 증거 또는 구체적 blocker가 필요합니다.",
    "Confidence: High는 산출물 트랙, anti-slop visual thesis, 한글 줄바꿈 기준, 검증 근거가 모두 명시적일 때만 사용하세요.",
  ].join("\n\n");
}

export function guardDesignQualityMessage(
  mode: WorkMode,
  message: AssistantMessage,
  repairState?: DesignRepairState,
): DesignQualityGuardResult {
  if (mode !== "design") return {};
  if (message.stopReason === "toolUse" || message.stopReason === "error" || message.stopReason === "aborted") return {};
  if (hasToolCall(message)) return {};

  const text = assistantText(message);
  if (!appearsToBeDesignCompletion(text)) return {};

  const quality = evaluateDesignQuality(mode, text);
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
