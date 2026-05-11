import { describe, expect, it } from "vitest";
import {
  resolveEffectiveWorkMode,
  sessionIdFromContext,
  sessionScopedKey,
} from "../extensions/ddotz-autopilot/session-scope";

describe("session-scoped autopilot state", () => {
  it("keys ledgers by cwd and session id so same-folder sessions do not collide", () => {
    expect(sessionScopedKey("/repo", "session-a")).not.toBe(sessionScopedKey("/repo", "session-b"));
    expect(sessionScopedKey("/repo", "session-a")).toBe(sessionScopedKey("/repo", "session-a"));
  });

  it("reads the Pi session id from ctx.sessionManager", () => {
    const ctx = { sessionManager: { getSessionId: () => "abc123" } };
    expect(sessionIdFromContext(ctx)).toBe("abc123");
  });

  it("applies implemented inferred modes as a temporary effective overlay only from default", () => {
    expect(resolveEffectiveWorkMode({ persistentMode: "default", suggestedMode: "web-analysis" })).toMatchObject({
      persistentMode: "default",
      effectiveMode: "web-analysis",
      automatic: true,
    });
    expect(resolveEffectiveWorkMode({ persistentMode: "default", suggestedMode: "adoption-analysis" })).toMatchObject({
      effectiveMode: "adoption-analysis",
      automatic: true,
    });
    expect(resolveEffectiveWorkMode({ persistentMode: "default", suggestedMode: "report" })).toMatchObject({
      effectiveMode: "report",
      automatic: true,
    });
    expect(resolveEffectiveWorkMode({ persistentMode: "default", suggestedMode: "coding" })).toMatchObject({
      effectiveMode: "default",
      automatic: false,
    });
    expect(resolveEffectiveWorkMode({ persistentMode: "adoption-analysis", suggestedMode: "web-analysis" })).toMatchObject({
      effectiveMode: "adoption-analysis",
      automatic: false,
    });
  });
});
