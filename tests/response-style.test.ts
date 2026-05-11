import { describe, expect, it } from "vitest";
import {
  buildResponseStyleGuidance,
  formatConfidenceLabel,
  shouldFoldOperationDetails,
} from "../extensions/ddotz-autopilot/response-style";

describe("response style", () => {
  it("keeps reports sectioned but concise", () => {
    const guidance = buildResponseStyleGuidance();
    expect(guidance).toContain("Keep final reports concise");
    expect(guidance).toContain("maximum 4 short bullets");
    expect(guidance).toContain("avoid long process narration");
    expect(guidance).toContain("Do not use HTML tags");
  });

  it("requires TDD and bug-fix reports to include red root-cause fix and green evidence", () => {
    const guidance = buildResponseStyleGuidance();
    expect(guidance).toContain("RED");
    expect(guidance).toContain("Root cause");
    expect(guidance).toContain("Fix");
    expect(guidance).toContain("GREEN");
  });

  it("keeps user-facing replies in respectful Korean by default without praise openers or opt-in endings", () => {
    const guidance = buildResponseStyleGuidance();
    expect(guidance).toContain("Korean by default");
    expect(guidance).toContain("respectful Korean");
    expect(guidance).toContain("존댓말");
    expect(guidance).toContain("Do not use praise or validation openers");
    expect(guidance).toContain("좋은 질문이에요");
    expect(guidance).toContain("Do not end replies with suggestion-led opt-in phrasing");
    expect(guidance).toContain("원하면");
  });

  it("folds noisy code operation details by default", () => {
    expect(shouldFoldOperationDetails("code-create")).toBe(true);
    expect(shouldFoldOperationDetails("code-modify")).toBe(true);
    expect(shouldFoldOperationDetails("code-delete")).toBe(true);
    expect(shouldFoldOperationDetails("final-summary")).toBe(false);
  });

  it("uses English confidence labels with high-contrast ANSI background colors", () => {
    expect(formatConfidenceLabel("high")).toContain("High");
    expect(formatConfidenceLabel("medium")).toContain("Medium");
    expect(formatConfidenceLabel("low")).toContain("Low");
    expect(formatConfidenceLabel("high")).toContain("\u001b[42m");
    expect(formatConfidenceLabel("medium")).toContain("\u001b[43m");
    expect(formatConfidenceLabel("low")).toContain("\u001b[41m");
    expect(formatConfidenceLabel("high")).toContain("\u001b[37m");
    expect(formatConfidenceLabel("medium")).not.toContain("중간");
  });
});
