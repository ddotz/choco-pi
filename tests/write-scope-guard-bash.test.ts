import { describe, expect, it } from "vitest";
import { detectBashScopeViolations, type ActiveLaneContext } from "../extensions/choco-autopilot/write-scope-guard";

const lane: ActiveLaneContext = {
  groupId: "group-a",
  laneId: "lane-1",
  repoRoot: "/repo",
  ownedFiles: ["src/owned.ts"],
  ownedDomains: [],
  executionStrategy: "worktree",
  readOnly: false,
};

describe("write scope guard bash post-diff", () => {
  it("allows bash changes that stay inside the owned scope", () => {
    const result = detectBashScopeViolations(lane, [], ["src/owned.ts"]);

    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("records violations for bash changes outside the owned scope", () => {
    const result = detectBashScopeViolations(lane, [], ["src/owned.ts", "src/outside.ts"]);

    expect(result.allowed).toBe(false);
    expect(result.violations).toEqual(["src/outside.ts"]);
  });

  it("blocks bash when outside-scope files are already dirty before execution", () => {
    const result = detectBashScopeViolations(lane, ["src/outside.ts"], ["src/outside.ts", "src/owned.ts"]);

    expect(result.allowed).toBe(false);
    expect(result.violations).toEqual(["src/outside.ts"]);
    expect(result.reason).toContain("outside-scope dirty files exist before bash");
  });
});
