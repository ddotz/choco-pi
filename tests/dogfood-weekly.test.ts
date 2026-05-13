import { describe, expect, it } from "vitest";
import { buildDogfoodWeeklyReport, formatDogfoodWeeklyReport } from "../extensions/choco-autopilot/dogfood-weekly";
import type { DogfoodCase } from "../extensions/choco-autopilot/dogfood-types";

function dogCase(id: string, outcome: DogfoodCase["outcome"], pattern?: string, flow: DogfoodCase["flow"] = { toolSequence: [], commandSequence: [] }): DogfoodCase {
  return {
    id,
    week: "2026-W20",
    startedAt: "2026-05-11T00:00:00.000Z",
    promptHash: id,
    promptSummary: "coding task",
    cwdHash: "cwd",
    projectLabel: "repo",
    workMode: "default",
    executionIntensity: "standard",
    taskType: "coding",
    toolCounts: {},
    scope: { kind: "project", memoryMode: "auto", projectId: "repo", projectRootHash: "cwd", projectLabel: "repo", capture: true },
    flow,
    verification: { required: true, passed: outcome !== "miss", failedCommands: outcome === "miss" ? ["pnpm run test"] : [], passedCommands: outcome !== "miss" ? ["pnpm run test"] : [] },
    gates: { structuralRequired: true, structuralPassed: outcome !== "miss", loopTransitions: 1, repairQueued: outcome === "assisted" },
    userSteeringSignals: [],
    outcome,
    outcomeConfidence: "High",
    ruleReasons: [outcome],
    repeatedPatternKey: pattern,
  };
}

describe("dogfood weekly report", () => {
  it("computes rates and blocks auto-improvement below sample threshold", () => {
    const report = buildDogfoodWeeklyReport("2026-W20", [dogCase("a", "clean"), dogCase("b", "assisted", "coding:repair-or-recovery")], new Date("2026-05-11T00:00:00Z"));
    expect(report.cleanHitRate).toBe(0.5);
    expect(report.autoImprovementAllowed).toBe(false);
    expect(report.autoImprovementReason).toContain("25 eligible cases");
  });

  it("formats legacy weekly reports without flow metadata", () => {
    const report = buildDogfoodWeeklyReport("2026-W20", [], new Date("2026-05-11T00:00:00Z")) as Partial<ReturnType<typeof buildDogfoodWeeklyReport>>;
    delete report.topFlows;

    expect(formatDogfoodWeeklyReport(report as ReturnType<typeof buildDogfoodWeeklyReport>)).toContain("top flows: none");
  });

  it("handles legacy cases without flow metadata", () => {
    const legacy = { ...dogCase("legacy", "clean") } as Partial<DogfoodCase>;
    delete legacy.flow;

    const report = buildDogfoodWeeklyReport("2026-W20", [legacy as DogfoodCase], new Date("2026-05-11T00:00:00Z"));

    expect(report.topFlows).toEqual([]);
    expect(formatDogfoodWeeklyReport(report)).toContain("top flows: none");
  });

  it("summarizes top sanitized flow signatures", () => {
    const cases = [
      dogCase("a", "assisted", "coding:repair-or-recovery", { toolSequence: ["grep", "read", "edit", "bash"], commandSequence: ["test"] }),
      dogCase("b", "assisted", "coding:repair-or-recovery", { toolSequence: ["grep", "read", "edit", "bash"], commandSequence: ["test"] }),
      dogCase("c", "miss", "coding:verification-or-gate-failed", { toolSequence: ["read", "bash"], commandSequence: ["typecheck"] }),
    ];

    const report = buildDogfoodWeeklyReport("2026-W20", cases, new Date("2026-05-11T00:00:00Z"));
    expect(report.topFlows[0]).toMatchObject({ signature: "tools:grep>read>edit>bash | commands:test", count: 2 });
    expect(formatDogfoodWeeklyReport(report)).toContain("top flows");
  });

  it("allows auto-improvement when sample and repeated pattern thresholds pass", () => {
    const cases = Array.from({ length: 22 }, (_, index) => dogCase(`clean-${index}`, "clean"));
    cases.push(dogCase("a", "assisted", "coding:repair-or-recovery"));
    cases.push(dogCase("b", "assisted", "coding:repair-or-recovery"));
    cases.push(dogCase("c", "assisted", "coding:repair-or-recovery"));

    const report = buildDogfoodWeeklyReport("2026-W20", cases, new Date("2026-05-11T00:00:00Z"));
    expect(report.eligibleCases).toBe(25);
    expect(report.autoImprovementAllowed).toBe(true);
    expect(report.repeatedPatterns[0]).toMatchObject({ key: "coding:repair-or-recovery", count: 3 });
    expect(formatDogfoodWeeklyReport(report)).toContain("clean hit rate: 88.0%");
  });
});
