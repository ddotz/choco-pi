import { describe, expect, it } from "vitest";
import {
  deriveRequirementLock,
  reconcileRequirementLockWithDelta,
  requirementLockCompletionBlock,
  requirementLockFromTurn,
} from "../extensions/choco-autopilot/requirement-lock";

const baseSpec = {
  objective: "Ship export",
  scope: ["export screen"],
  acceptanceCriteria: ["CSV export works"],
  testStrategy: ["vitest"],
  risks: [],
  updatedAt: "2026-05-31T00:00:00.000Z",
};

describe("requirement lock", () => {
  it("blocks completion when a MUST acceptance item has no verification evidence", () => {
    const lock = deriveRequirementLock("session-a", baseSpec);

    expect(requirementLockCompletionBlock(lock, "version sync passed")).toContain("REQ-AC-001");
  });

  it("allows completion when verification evidence names the requirement id", () => {
    const lock = deriveRequirementLock("session-a", baseSpec);

    expect(requirementLockCompletionBlock(lock, "REQ-AC-001 verified by vitest")).toBeUndefined();
  });

  it("allows completion when verification evidence contains the acceptance text", () => {
    const lock = deriveRequirementLock("session-a", baseSpec);

    expect(requirementLockCompletionBlock(lock, "CSV export works verified by e2e test")).toBeUndefined();
  });

  it("allows completion when a delta explicitly defers the acceptance item", () => {
    const lock = reconcileRequirementLockWithDelta(deriveRequirementLock("session-a", baseSpec), {
      description: "Defer CSV export works to a new loop.",
      handling: "deferred",
      proposedChanges: { acceptanceCriteria: ["CSV export works"] },
      createdAt: "2026-05-31T00:01:00.000Z",
    });

    expect(requirementLockCompletionBlock(lock, "base checks passed")).toBeUndefined();
  });

  it("keeps unrelated deferred deltas from satisfying the locked acceptance item", () => {
    const lock = reconcileRequirementLockWithDelta(deriveRequirementLock("session-a", baseSpec), {
      description: "Defer dark mode polish to a new loop.",
      handling: "deferred",
      proposedChanges: { acceptanceCriteria: ["dark mode polish works"] },
      createdAt: "2026-05-31T00:01:00.000Z",
    });

    expect(requirementLockCompletionBlock(lock, "base checks passed")).toContain("REQ-AC-001");
  });

  it("does not let in-scope deltas satisfy or defer an existing locked acceptance item", () => {
    const lock = reconcileRequirementLockWithDelta(deriveRequirementLock("session-a", baseSpec), {
      description: "Keep CSV export works in scope while adding audit logging.",
      handling: "in-scope",
      proposedChanges: { acceptanceCriteria: ["audit logging works"] },
      createdAt: "2026-05-31T00:01:00.000Z",
    });

    expect(requirementLockCompletionBlock(lock, "base checks passed")).toContain("REQ-AC-001");
  });

  it("blocks in-scope acceptance criteria added by a Spec Delta until they are verified", () => {
    const lock = requirementLockFromTurn("session-a", {
      workingSpec: {
        ...baseSpec,
        acceptanceCriteria: ["CSV export works", "Admin export works"],
      },
      deltas: [
        {
          description: "Add admin export to the accepted scope.",
          handling: "in-scope",
          proposedChanges: { acceptanceCriteria: ["Admin export works"] },
          createdAt: "2026-05-31T00:01:00.000Z",
        },
      ],
      snapshots: [],
    });

    expect(requirementLockCompletionBlock(lock, "REQ-AC-001 CSV export works verified by vitest")).toContain("REQ-AC-002");
  });
});
