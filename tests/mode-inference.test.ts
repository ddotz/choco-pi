import { describe, expect, it } from "vitest";
import { inferPlannedWorkModes } from "../extensions/choco-autopilot/mode";

describe("report mode inference", () => {
  it.each([
    ["보고서 작성해줘", ["report"]],
    ["시장 분석 보고서 작성해줘", ["web-analysis", "report"]],
    ["AI 검색 시장 리포트 써줘", ["web-analysis", "report"]],
    ["첨부 자료만 기반으로 보고서 작성해줘", ["report"]],
    ["웹 검색 없이 보고서 작성해줘", ["report"]],
    ["이 URL 기반 보고서 작성해줘: https://example.com", ["web-analysis", "report"]],
    ["외부 리서치까지 해서 보고서 작성해줘", ["web-analysis", "report"]],
    ["do not search, write a report from my materials", ["report"]],
    ["no external research report please", ["report"]],
    ["시장 전망 글 써줘", ["web-analysis", "report"]],
    ["회사 재무분석 보고서 작성해줘", ["web-analysis", "report"]],
    ["첨부 재무제표만 기반으로 회사 재무분석 보고서 작성해줘", ["report"]],
    ["README 글자 하나 수정해줘", ["coding"]],
  ] as const)("infers %j -> %j", (prompt, expected) => {
    expect(inferPlannedWorkModes(prompt)).toEqual(expected);
  });
});
