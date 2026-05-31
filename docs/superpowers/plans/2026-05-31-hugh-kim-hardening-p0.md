# Hugh Kim Hardening P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement P0 Requirement Lock and Feature Deletion Detector so choco-pi cannot report completion when accepted MUST requirements are unresolved or suspicious feature deletion is unexplained.

**Architecture:** Add two small, testable modules under `extensions/choco-autopilot`: `requirement-lock.ts` bridges `spec_gate` to `structural_gate` with session-scoped lock state, and `feature-deletion-detector.ts` parses git diffs for deterministic high-risk deletion patterns. `dynamic-sdd.ts` updates locks on spec start/delta; `structural-gate.ts` blocks final completion through these modules.

**Tech Stack:** TypeScript, Vitest, existing choco-pi Pi extension APIs, git diff via `execGit`.

---

## File map

- Create `extensions/choco-autopilot/requirement-lock.ts`: lock item derivation, delta reconciliation, verification matching, completion blocker formatting.
- Create `extensions/choco-autopilot/feature-deletion-detector.ts`: pure diff scanner plus optional git dirty diff helper.
- Modify `extensions/choco-autopilot/dynamic-sdd.ts`: call requirement lock update/clear when `spec_gate` starts, records deltas, or clears.
- Modify `extensions/choco-autopilot/structural-gate.ts`: call requirement lock blocker and feature deletion blocker before marking completion passed.
- Create `tests/requirement-lock.test.ts`: unit tests for lock derivation/reconciliation/completion blocking.
- Create `tests/feature-deletion-detector.test.ts`: unit tests for diff detection and delta explanation.
- Modify `tests/structural-gate.test.ts`: integration tests through registered tools.

## Task 1: RED tests for Requirement Lock

**Files:**
- Create: `tests/requirement-lock.test.ts`
- Modify: `tests/structural-gate.test.ts`

- [ ] **Step 1: Add unit tests for lock behavior**

```ts
import { describe, expect, it } from "vitest";
import { deriveRequirementLock, requirementLockCompletionBlock, reconcileRequirementLockWithDelta } from "../extensions/choco-autopilot/requirement-lock";

describe("requirement lock", () => {
  it("blocks completion when a MUST acceptance item has no verification evidence", () => {
    const lock = deriveRequirementLock("session-a", {
      objective: "Ship export",
      scope: ["export screen"],
      acceptanceCriteria: ["CSV export works"],
      testStrategy: ["vitest"],
      risks: [],
      updatedAt: "2026-05-31T00:00:00.000Z",
    });

    expect(requirementLockCompletionBlock(lock, "version sync passed")).toContain("REQ-AC-001");
  });

  it("allows completion when verification evidence names the requirement id", () => {
    const lock = deriveRequirementLock("session-a", {
      objective: "Ship export",
      scope: ["export screen"],
      acceptanceCriteria: ["CSV export works"],
      testStrategy: ["vitest"],
      risks: [],
      updatedAt: "2026-05-31T00:00:00.000Z",
    });

    expect(requirementLockCompletionBlock(lock, "REQ-AC-001 verified by vitest")).toBeUndefined();
  });

  it("allows completion when a delta explicitly defers the acceptance item", () => {
    let lock = deriveRequirementLock("session-a", {
      objective: "Ship export",
      scope: ["export screen"],
      acceptanceCriteria: ["CSV export works"],
      testStrategy: ["vitest"],
      risks: [],
      updatedAt: "2026-05-31T00:00:00.000Z",
    });
    lock = reconcileRequirementLockWithDelta(lock, {
      description: "Defer CSV export works to a new loop.",
      handling: "deferred",
      proposedChanges: { acceptanceCriteria: ["CSV export works"] },
      createdAt: "2026-05-31T00:01:00.000Z",
    });

    expect(requirementLockCompletionBlock(lock, "base checks passed")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/requirement-lock.test.ts`

Expected: FAIL because `requirement-lock.ts` does not exist.

## Task 2: GREEN implementation for Requirement Lock

**Files:**
- Create: `extensions/choco-autopilot/requirement-lock.ts`
- Modify: `extensions/choco-autopilot/dynamic-sdd.ts`
- Modify: `extensions/choco-autopilot/structural-gate.ts`

- [ ] **Step 1: Implement lock module**

Create types for lock items, `deriveRequirementLock`, `reconcileRequirementLockWithDelta`, `requirementLockCompletionBlock`, and session-scoped helpers `setRequirementLockForSession`, `clearRequirementLockForSession`, `requirementLockCompletionBlockForSession`.

- [ ] **Step 2: Wire dynamic SDD**

In `recordSpecGateAction`, after `start` and `delta`, update the session lock. On `clear`, clear the lock.

- [ ] **Step 3: Wire structural gate**

In `recordStructuralGateReview`, before `turn.passed = true`, call `requirementLockCompletionBlockForSession(sessionId, review.verificationEvidence)` and reject completion when it returns a reason.

- [ ] **Step 4: Run GREEN**

Run: `pnpm vitest run tests/requirement-lock.test.ts tests/dynamic-sdd.test.ts tests/structural-gate.test.ts`

Expected: PASS.

## Task 3: RED tests for Feature Deletion Detector

**Files:**
- Create: `tests/feature-deletion-detector.test.ts`

- [ ] **Step 1: Add detector tests**

```ts
import { describe, expect, it } from "vitest";
import { detectFeatureDeletionFromDiff } from "../extensions/choco-autopilot/feature-deletion-detector";

describe("feature deletion detector", () => {
  it("flags removed exported functions", () => {
    const result = detectFeatureDeletionFromDiff({
      changedFiles: ["src/export.ts"],
      diffText: "--- a/src/export.ts\n+++ b/src/export.ts\n@@\n-export function csvExport() { return true; }\n",
      deltas: [],
    });

    expect(result.blockingChanges).toEqual([expect.objectContaining({ changeKind: "export-removal", affectedName: "csvExport" })]);
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

    expect(result.blockingChanges.map((item) => item.changeKind)).toEqual(["placeholder-added", "hidden-rendering"]);
  });

  it("allows explained deletion when a Spec Delta names the removed symbol", () => {
    const result = detectFeatureDeletionFromDiff({
      changedFiles: ["src/export.ts"],
      diffText: "--- a/src/export.ts\n+++ b/src/export.ts\n@@\n-export function csvExport() { return true; }\n",
      deltas: [{ description: "Remove obsolete csvExport after API migration.", handling: "in-scope", proposedChanges: {}, createdAt: "2026-05-31T00:00:00.000Z" }],
    });

    expect(result.blockingChanges).toEqual([]);
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/feature-deletion-detector.test.ts`

Expected: FAIL because `feature-deletion-detector.ts` does not exist.

## Task 4: GREEN implementation for Feature Deletion Detector

**Files:**
- Create: `extensions/choco-autopilot/feature-deletion-detector.ts`
- Modify: `extensions/choco-autopilot/structural-gate.ts`

- [ ] **Step 1: Implement pure detector**

Parse unified diff line-by-line, track current file from `+++ b/<path>`, and emit named `FeatureChange` records for export removal, test removal, placeholder additions, hidden rendering, tool/command/gate removal.

- [ ] **Step 2: Add Spec Delta reconciliation**

Treat a change as explained only when delta text or proposed changes mention the affected symbol, file path, or change kind.

- [ ] **Step 3: Add git dirty diff helper**

Use `execGit(cwd, ["diff", "--", "."])` and `execGit(cwd, ["diff", "--cached", "--", "."])`, combine output, and return no blockers when repo has no diff or git is unavailable.

- [ ] **Step 4: Wire structural gate**

Before completion passes, call `featureDeletionCompletionBlock(ctx.cwd, activeDeltas)` in the structural gate tool execute path when `readyToComplete` is true.

- [ ] **Step 5: Run GREEN**

Run: `pnpm vitest run tests/feature-deletion-detector.test.ts tests/structural-gate.test.ts`

Expected: PASS.

## Task 5: Integration verification and cleanup

**Files:**
- Modify docs only if runtime behavior needs user-facing explanation.

- [ ] **Step 1: Run full quality gate**

Run: `pnpm run check`

Expected: version sync OK, lint 0 errors, typecheck OK, all tests pass.

- [ ] **Step 2: Technical debt cleanup**

Review new modules for duplicate normalization helpers, overbroad regex, and confusing failure text. Keep changes in P0 scope.

- [ ] **Step 3: Re-run full quality gate**

Run: `pnpm run check`

Expected: all checks pass.

- [ ] **Step 4: Runtime reload**

Run `reload_runtime` because choco-pi extension code changed.

- [ ] **Step 5: Commit and push**

Run:

```bash
git status --short --untracked-files=all
git add extensions/choco-autopilot tests docs/superpowers/plans/2026-05-31-hugh-kim-hardening-p0.md
git commit -m "feat: add requirement lock completion hardening"
git push origin HEAD
```

Expected: branch push succeeds and working tree is clean.
