import { describe, expect, it } from "vitest";
import { detectFeatureDeletionFromDiff } from "../extensions/choco-autopilot/feature-deletion-detector";

describe("feature deletion detector", () => {
  it("flags removed exported functions", () => {
    const result = detectFeatureDeletionFromDiff({
      changedFiles: ["src/export.ts"],
      diffText: "--- a/src/export.ts\n+++ b/src/export.ts\n@@\n-export function csvExport() { return true; }\n",
      deltas: [],
    });

    expect(result.blockingChanges).toEqual([
      expect.objectContaining({ changeKind: "export-removal", affectedName: "csvExport" }),
    ]);
  });

  it("flags removed tests", () => {
    const result = detectFeatureDeletionFromDiff({
      changedFiles: ["tests/export.test.ts"],
      diffText: "--- a/tests/export.test.ts\n+++ b/tests/export.test.ts\n@@\n-it(\"exports csv\", () => {})\n",
      deltas: [],
    });

    expect(result.blockingChanges).toEqual([expect.objectContaining({ changeKind: "test-removal" })]);
  });

  it("flags implementation placeholder markers and hidden rendering", () => {
    const result = detectFeatureDeletionFromDiff({
      changedFiles: ["src/Widget.tsx"],
      diffText: "--- a/src/Widget.tsx\n+++ b/src/Widget.tsx\n@@\n+// not implemented yet\n+return false && <Feature />\n",
      deltas: [],
    });

    expect(result.blockingChanges.map((item) => item.changeKind)).toEqual([
      "placeholder-added",
      "hidden-rendering",
    ]);
  });

  it("flags removed structural gates", () => {
    const result = detectFeatureDeletionFromDiff({
      changedFiles: ["extensions/choco-autopilot/policy.ts"],
      diffText: "--- a/extensions/choco-autopilot/policy.ts\n+++ b/extensions/choco-autopilot/policy.ts\n@@\n-structural_gate is required before completion\n",
      deltas: [],
    });

    expect(result.blockingChanges).toEqual([expect.objectContaining({ changeKind: "gate-removal" })]);
  });

  it("allows explained deletion when a Spec Delta names the removed symbol", () => {
    const result = detectFeatureDeletionFromDiff({
      changedFiles: ["src/export.ts"],
      diffText: "--- a/src/export.ts\n+++ b/src/export.ts\n@@\n-export function csvExport() { return true; }\n",
      deltas: [
        {
          description: "Remove obsolete csvExport after API migration.",
          handling: "in-scope",
          proposedChanges: {},
          createdAt: "2026-05-31T00:00:00.000Z",
        },
      ],
    });

    expect(result.blockingChanges).toEqual([]);
  });

  it("does not let unrelated deltas explain feature deletion", () => {
    const result = detectFeatureDeletionFromDiff({
      changedFiles: ["src/export.ts"],
      diffText: "--- a/src/export.ts\n+++ b/src/export.ts\n@@\n-export function csvExport() { return true; }\n",
      deltas: [
        {
          description: "Remove obsolete darkModeToggle after API migration.",
          handling: "in-scope",
          proposedChanges: {},
          createdAt: "2026-05-31T00:00:00.000Z",
        },
      ],
    });

    expect(result.blockingChanges).toEqual([
      expect.objectContaining({ changeKind: "export-removal", affectedName: "csvExport" }),
    ]);
  });
});
