import { describe, expect, it } from "vitest";
import {
  buildCompletionBoundaryGuidance,
  classifyFollowUp,
  shouldContinueAutonomousWork,
} from "../extensions/choco-autopilot/completion-boundary";

describe("completion boundary", () => {
  it("stops when the requested outcome is done and verification passed", () => {
    expect(
      shouldContinueAutonomousWork({
        requestedOutcomeSatisfied: true,
        verificationPassed: true,
        criticalIssuesRemaining: false,
        approvalBoundaryHit: false,
        followUpKind: "nice-to-have",
      }),
    ).toBe(false);
  });

  it("continues only for unmet outcome, failed verification, or critical issues", () => {
    expect(
      shouldContinueAutonomousWork({
        requestedOutcomeSatisfied: false,
        verificationPassed: true,
        criticalIssuesRemaining: false,
        approvalBoundaryHit: false,
        followUpKind: "in-scope-required",
      }),
    ).toBe(true);
    expect(
      shouldContinueAutonomousWork({
        requestedOutcomeSatisfied: true,
        verificationPassed: false,
        criticalIssuesRemaining: false,
        approvalBoundaryHit: false,
        followUpKind: "in-scope-required",
      }),
    ).toBe(true);
    expect(
      shouldContinueAutonomousWork({
        requestedOutcomeSatisfied: true,
        verificationPassed: true,
        criticalIssuesRemaining: true,
        approvalBoundaryHit: false,
        followUpKind: "in-scope-required",
      }),
    ).toBe(true);
  });

  it("stops at approval boundaries instead of continuing blindly", () => {
    expect(
      shouldContinueAutonomousWork({
        requestedOutcomeSatisfied: false,
        verificationPassed: false,
        criticalIssuesRemaining: true,
        approvalBoundaryHit: true,
        followUpKind: "in-scope-required",
      }),
    ).toBe(false);
  });

  it("classifies follow-ups so optional expansion does not become endless work", () => {
    expect(classifyFollowUp("fix the failing test introduced by this change")).toBe("in-scope-required");
    expect(classifyFollowUp("also redesign the whole dashboard someday")).toBe("new-scope");
    expect(classifyFollowUp("nice to have: add animation polish later")).toBe("nice-to-have");
  });

  it("injects explicit stop rules", () => {
    const guidance = buildCompletionBoundaryGuidance();
    expect(guidance).toContain("Stop when the requested outcome is satisfied");
    expect(guidance).toContain("Do not convert nice-to-have or new-scope ideas into active work");
    expect(guidance).toContain("Report follow-ups explicitly");
  });
});
