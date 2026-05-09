import { describe, expect, it } from "vitest";
import {
  AUTOPILOT_MODE,
  buildAutopilotSystemPrompt,
  classifyAutopilotWeight,
  shouldAskUser,
} from "../extensions/ddotz-autopilot/policy";

describe("ddotz autopilot policy", () => {
  it("defaults to autopilot mode", () => {
    expect(AUTOPILOT_MODE).toBe("autopilot");
  });

  it("classifies routine prompts without making the whole environment heavy", () => {
    expect(classifyAutopilotWeight("이 함수 이름만 바꿔줘")).toBe("micro");
    expect(classifyAutopilotWeight("로그인 버그 고치고 테스트까지 돌려줘")).toBe("standard");
    expect(classifyAutopilotWeight("역할 나눠서 전체 리팩터링 끝까지 진행하고 리뷰까지 해줘")).toBe("heavy");
  });

  it("prevents routine clarification questions and only allows hard blockers", () => {
    expect(shouldAskUser({ kind: "routine-choice", reversible: true, hasReasonableDefault: true })).toBe(false);
    expect(shouldAskUser({ kind: "deployment", reversible: false, hasReasonableDefault: false })).toBe(true);
    expect(shouldAskUser({ kind: "secret-or-account", reversible: false, hasReasonableDefault: false })).toBe(true);
    expect(shouldAskUser({ kind: "external-data-transfer", reversible: false, hasReasonableDefault: false })).toBe(true);
    expect(shouldAskUser({ kind: "contradictory-goal", reversible: true, hasReasonableDefault: false })).toBe(true);
  });

  it("injects autonomous execution, self-review, context, memory, and external insane-search rules", () => {
    const prompt = buildAutopilotSystemPrompt({ mode: "autopilot", cwd: "/repo", ledgerSummary: "Objective: ship" });

    expect(prompt).toContain("ddotz-pi autonomous PM/development-team mode");
    expect(prompt).toContain("Do not ask the user for routine implementation choices");
    expect(prompt).toContain("self-review");
    expect(prompt).toContain("verify with observable evidence");
    expect(prompt).toContain("Context Ledger");
    expect(prompt).toContain("insane-search");
    expect(prompt).toContain("Do not reimplement insane-search");
  });
});
