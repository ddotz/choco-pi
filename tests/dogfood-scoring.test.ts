import { describe, expect, it } from "vitest";
import { repeatedDogfoodPatterns, scoreDogfoodCase } from "../extensions/choco-autopilot/dogfood-scoring";
import type { DogfoodCase } from "../extensions/choco-autopilot/dogfood-types";

function baseCase(overrides: Partial<DogfoodCase> = {}): DogfoodCase {
  return {
    id: "case-1",
    week: "2026-W20",
    startedAt: "2026-05-11T00:00:00.000Z",
    promptHash: "abc",
    promptSummary: "coding task",
    cwdHash: "cwd",
    projectLabel: "repo",
    workMode: "default",
    executionIntensity: "standard",
    taskType: "coding",
    toolCounts: {},
    verification: { required: true, passed: true, failedCommands: [], passedCommands: ["pnpm run test"] },
    gates: { structuralRequired: true, structuralPassed: true, loopTransitions: 1, repairQueued: false },
    userSteeringSignals: [],
    outcome: "review",
    outcomeConfidence: "Low",
    ruleReasons: [],
    ...overrides,
  };
}

describe("dogfood scoring", () => {
  it("scores a verified gate-passing case as clean", () => {
    const scored = scoreDogfoodCase(baseCase());
    expect(scored.outcome).toBe("clean");
    expect(scored.outcomeConfidence).toBe("High");
    expect(scored.ruleReasons).toContain("verification passed");
    expect(scored.ruleReasons).toContain("required structural gate passed");
  });

  it("scores recovered repair or failed-then-passed verification as assisted", () => {
    const scored = scoreDogfoodCase(baseCase({
      gates: { structuralRequired: true, structuralPassed: true, loopTransitions: 1, repairQueued: true },
      verification: { required: true, passed: true, failedCommands: ["pnpm run test"], passedCommands: ["pnpm run test"] },
    }));
    expect(scored.outcome).toBe("assisted");
    expect(scored.repeatedPatternKey).toBe("coding:repair-or-recovery");
  });

  it("scores failed verification or failed required gate as miss", () => {
    const scored = scoreDogfoodCase(baseCase({
      verification: { required: true, passed: false, failedCommands: ["pnpm run test"], passedCommands: [] },
      gates: { structuralRequired: true, structuralPassed: false, loopTransitions: 0, repairQueued: false },
    }));
    expect(scored.outcome).toBe("miss");
    expect(scored.outcomeConfidence).toBe("High");
    expect(scored.repeatedPatternKey).toBe("coding:verification-or-gate-failed");
  });

  it("keeps unclear cases in review", () => {
    const scored = scoreDogfoodCase(baseCase({
      verification: { required: false, passed: false, failedCommands: [], passedCommands: [] },
      gates: { structuralRequired: false, structuralPassed: false, loopTransitions: 0, repairQueued: false },
    }));
    expect(scored.outcome).toBe("review");
    expect(scored.outcomeConfidence).toBe("Medium");
  });

  it("detects repeated assisted and miss patterns", () => {
    const cases = [
      scoreDogfoodCase(baseCase({ id: "a", taskType: "coding", gates: { structuralRequired: true, structuralPassed: true, loopTransitions: 1, repairQueued: true } })),
      scoreDogfoodCase(baseCase({ id: "b", taskType: "coding", gates: { structuralRequired: true, structuralPassed: true, loopTransitions: 1, repairQueued: true } })),
      scoreDogfoodCase(baseCase({ id: "c", taskType: "coding", gates: { structuralRequired: true, structuralPassed: true, loopTransitions: 1, repairQueued: true } })),
    ];
    expect(repeatedDogfoodPatterns(cases, 3)).toEqual([
      expect.objectContaining({ key: "coding:repair-or-recovery", outcome: "assisted", count: 3 }),
    ]);
  });
});
