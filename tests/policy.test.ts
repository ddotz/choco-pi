import { describe, expect, it } from "vitest";
import {
  AUTONOMOUS_PM_BASE,
  buildAutopilotSystemPrompt,
  classifyExecutionIntensity,
  shouldAskUser,
} from "../extensions/ddotz-autopilot/policy";
import { DEFAULT_WORK_MODE, parseExecutionIntensity, parseWorkMode } from "../extensions/ddotz-autopilot/mode";

describe("ddotz autonomous PM policy", () => {
  it("keeps autonomous PM as the base philosophy, not a selectable work mode", () => {
    expect(AUTONOMOUS_PM_BASE).toBe(true);
    expect(DEFAULT_WORK_MODE).toBe("default");
    expect(parseWorkMode("autopilot")).toBeUndefined();
    expect(parseWorkMode("coding")).toBe("coding");
    expect(parseWorkMode("report")).toBe("report");
    expect(parseWorkMode("web-analysis")).toBe("web-analysis");
    expect(parseWorkMode("adoption-analysis")).toBe("adoption-analysis");
  });

  it("separates execution intensity from work mode", () => {
    expect(classifyExecutionIntensity("이 함수 이름만 바꿔줘")).toBe("micro");
    expect(classifyExecutionIntensity("로그인 버그 고치고 테스트까지 돌려줘")).toBe("standard");
    expect(classifyExecutionIntensity("역할 나눠서 전체 리팩터링 끝까지 진행하고 리뷰까지 해줘")).toBe("deep");
    expect(parseExecutionIntensity("heavy")).toBe("deep");
    expect(parseExecutionIntensity("autopilot-heavy")).toBe("deep");
  });

  it("prevents routine clarification questions and only allows hard blockers or adoption decisions", () => {
    expect(shouldAskUser({ kind: "routine-choice", reversible: true, hasReasonableDefault: true })).toBe(false);
    expect(shouldAskUser({ kind: "deployment", reversible: false, hasReasonableDefault: false })).toBe(true);
    expect(shouldAskUser({ kind: "secret-or-account", reversible: false, hasReasonableDefault: false })).toBe(true);
    expect(shouldAskUser({ kind: "external-data-transfer", reversible: false, hasReasonableDefault: false })).toBe(true);
    expect(shouldAskUser({ kind: "external-adoption-decision", reversible: true, hasReasonableDefault: true })).toBe(true);
    expect(shouldAskUser({ kind: "contradictory-goal", reversible: true, hasReasonableDefault: false })).toBe(true);
  });

  it("injects autonomous base plus domain-specific work mode, intensity, context, memory, and source tracking", () => {
    const prompt = buildAutopilotSystemPrompt({
      workMode: "coding",
      executionIntensity: "deep",
      cwd: "/repo",
      ledgerSummary: "Objective: ship",
      dueSourceSummary: "- can1357/oh-my-pi changed since last check",
    });

    expect(prompt).toContain("ddotz-pi autonomous PM/development-team base");
    expect(prompt).toContain("Work mode: coding");
    expect(prompt).toContain("Execution intensity: deep");
    expect(prompt).toContain("Do not ask the user for routine implementation choices");
    expect(prompt).toContain("self-review");
    expect(prompt).toContain("verify with observable evidence");
    expect(prompt).toContain("Context Ledger");
    expect(prompt).toContain("insane-search");
    expect(prompt).toContain("Do not reimplement insane-search");
    expect(prompt).toContain("External Source Tracking");
    expect(prompt).not.toContain("Mode: autopilot");
  });
});
