import { describe, expect, it } from "vitest";
import { isMajorTask, buildTechnicalDebtCleanupGuidance } from "../extensions/choco-autopilot/technical-debt";

describe("technical debt cleanup policy", () => {
  it("lets autopilot classify major tasks without asking the user", () => {
    expect(isMajorTask({ changedFiles: ["extensions/a.ts", "extensions/b.ts"], reloadRequired: true })).toBe(true);
    expect(isMajorTask({ changedFiles: ["README.md"], docsOnly: true })).toBe(false);
    expect(isMajorTask({ changedFiles: ["extensions/choco-autopilot/index.ts"], persistenceChanged: true })).toBe(true);
  });

  it("requires cleanup after verification while keeping scope bounded", () => {
    const guidance = buildTechnicalDebtCleanupGuidance();
    expect(guidance).toContain("After verification passes on a major task");
    expect(guidance).toContain("re-run verification after cleanup");
    expect(guidance).toContain("Do not turn cleanup into new features");
    expect(guidance).toContain("approval boundary");
  });
});
