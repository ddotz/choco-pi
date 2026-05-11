import { describe, expect, it } from "vitest";
import { verificationCommandFromInput } from "../extensions/ddotz-autopilot/verification-command";

describe("verification command detection", () => {
  it("recognizes supported verification commands from bash input", () => {
    expect(verificationCommandFromInput({ command: " pnpm run test " })).toBe("pnpm run test");
    expect(verificationCommandFromInput({ command: "pnpm run version:check && pnpm run lint" })).toBe("pnpm run version:check && pnpm run lint");
    expect(verificationCommandFromInput({ command: "vitest run tests/dogfood.test.ts" })).toBe("vitest run tests/dogfood.test.ts");
    expect(verificationCommandFromInput({ command: "tsc --noEmit" })).toBe("tsc --noEmit");
  });

  it("rejects non-verification shell commands and malformed input", () => {
    expect(verificationCommandFromInput({ command: "echo hello" })).toBeUndefined();
    expect(verificationCommandFromInput({ command: "git status --short" })).toBeUndefined();
    expect(verificationCommandFromInput({ command: "" })).toBeUndefined();
    expect(verificationCommandFromInput(undefined)).toBeUndefined();
  });
});
