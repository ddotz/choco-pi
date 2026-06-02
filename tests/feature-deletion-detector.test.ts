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

  it("does not flag modified exports when the same symbol is re-added in the same file", () => {
    const result = detectFeatureDeletionFromDiff({
      changedFiles: ["extensions/choco-autopilot/version.ts"],
      diffText: "--- a/extensions/choco-autopilot/version.ts\n+++ b/extensions/choco-autopilot/version.ts\n@@\n-export const CHOCO_PI_VERSION = \"0.18.2\" as const;\n+export const CHOCO_PI_VERSION = \"0.18.3\" as const;\n",
      deltas: [],
    });

    expect(result.blockingChanges).toEqual([]);
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

  it("flags large implementation deletions", () => {
    const removedLines = Array.from({ length: 60 }, (_, index) => `-export const value${index} = ${index};`).join("\n");
    const result = detectFeatureDeletionFromDiff({
      changedFiles: ["src/large-module.ts"],
      diffText: `--- a/src/large-module.ts\n+++ b/src/large-module.ts\n@@\n${removedLines}\n`,
      deltas: [],
    });

    expect(result.blockingChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ changeKind: "large-deletion", filePath: "src/large-module.ts" }),
    ]));
  });

  it("ignores placeholder and hidden-rendering fixture strings added in tests", () => {
    const result = detectFeatureDeletionFromDiff({
      changedFiles: ["tests/widget.test.ts"],
      diffText: "--- a/tests/widget.test.ts\n+++ b/tests/widget.test.ts\n@@\n+// not implemented yet\n+return false && <Feature />\n",
      deltas: [],
    });

    expect(result.blockingChanges).toEqual([]);
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
