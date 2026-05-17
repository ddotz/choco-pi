import { describe, expect, it } from "vitest";
import { guardWritePath, type ActiveLaneContext } from "../extensions/choco-autopilot/write-scope-guard";

function lane(overrides: Partial<ActiveLaneContext> = {}): ActiveLaneContext {
  return {
    groupId: "group-a",
    laneId: "lane-1",
    repoRoot: "/repo",
    ownedFiles: ["tests"],
    ownedDomains: [],
    executionStrategy: "worktree",
    readOnly: false,
    ...overrides,
  };
}

describe("write scope guard", () => {
  it("allows writes inside an owned directory", () => {
    expect(guardWritePath(lane(), "/repo/tests/a.ts")).toMatchObject({ allowed: true });
  });

  it("blocks writes outside the owned scope", () => {
    const result = guardWritePath(lane({ ownedFiles: ["tests/a.ts"] }), "/repo/src/a.ts");

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("outside active lane write scope");
  });

  it("blocks every write in read-only lanes", () => {
    const result = guardWritePath(lane({ readOnly: true }), "/repo/tests/a.ts");

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("read-only lane");
  });

  it("no-ops when there is no active lane", () => {
    expect(guardWritePath(undefined, "/repo/src/a.ts")).toMatchObject({ allowed: true });
  });

  it("allows glob-owned files", () => {
    expect(guardWritePath(lane({ ownedFiles: ["tests/*.test.ts"] }), "/repo/tests/foo.test.ts")).toMatchObject({ allowed: true });
  });
});
