import { describe, expect, it } from "vitest";
import { classifyMemoryCandidate, shouldStoreMemory } from "../extensions/choco-autopilot/memory";

describe("memory policy", () => {
  it("stores durable preferences, project rules, repeated mistakes, verification commands, and decisions", () => {
    expect(shouldStoreMemory(classifyMemoryCandidate("User preference: default to autopilot and Korean respectful tone"))).toBe(true);
    expect(shouldStoreMemory(classifyMemoryCandidate("Project rule: use pnpm, not npm"))).toBe(true);
    expect(shouldStoreMemory(classifyMemoryCandidate("Repeated mistake: asking routine clarification questions blocks progress"))).toBe(true);
    expect(shouldStoreMemory(classifyMemoryCandidate("Verification command: pnpm run check"))).toBe(true);
    expect(shouldStoreMemory(classifyMemoryCandidate("Decision: insane-search remains an external dependency"))).toBe(true);
  });

  it("rejects noisy one-off or oversized memory candidates", () => {
    expect(shouldStoreMemory(classifyMemoryCandidate("temporary log: test failed once during development"))).toBe(false);
    expect(shouldStoreMemory(classifyMemoryCandidate("casual chat: thanks"))).toBe(false);
    expect(shouldStoreMemory(classifyMemoryCandidate("x".repeat(6000)))).toBe(false);
  });
});
