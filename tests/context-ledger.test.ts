import { describe, expect, it } from "vitest";
import {
  createEmptyLedger,
  recordAssumption,
  recordDecision,
  recordVerification,
  summarizeLedger,
} from "../extensions/ddotz-autopilot/context-ledger";

describe("context ledger", () => {
  it("keeps long-running autonomous work compact and resumable", () => {
    let ledger = createEmptyLedger("Build ddotz-pi");
    ledger = recordAssumption(ledger, "Default mode is autopilot unless explicitly changed.");
    ledger = recordDecision(ledger, "Use external insane-search rather than vendoring it.");
    ledger = recordVerification(ledger, "pnpm run check", "pending");

    const summary = summarizeLedger(ledger, { maxItemsPerSection: 5 });

    expect(summary).toContain("Objective: Build ddotz-pi");
    expect(summary).toContain("Assumptions");
    expect(summary).toContain("Decisions");
    expect(summary).toContain("Verification");
    expect(summary.length).toBeLessThan(2000);
  });
});
