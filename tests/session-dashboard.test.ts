import { describe, expect, it, vi } from "vitest";
import chocoAutopilot from "../extensions/choco-autopilot/index";
import { formatSessionDashboard } from "../extensions/choco-autopilot/session-dashboard";
import { createPiExtensionFixture } from "./helpers/pi-extension-fixture";

describe("session dashboard", () => {
  it("formats current session, todo, ledger, manifest, and worktree status", () => {
    const text = formatSessionDashboard({
      sessionId: "s1",
      cwd: "/repo",
      branch: "main",
      mode: "default",
      todos: "1 active / 2 pending",
      ledger: "Objective: ship",
      manifests: ["group-a: lane-1 verified"],
      worktrees: ["/repo main clean", "/wt feature dirty"],
    });

    expect(text).toContain("session: s1");
    expect(text).toContain("branch: main");
    expect(text).toContain("1 active / 2 pending");
    expect(text).toContain("group-a");
    expect(text).toContain("dirty");
  });

  it("registers /sessions and notifies plain text when no UI dashboard exists", async () => {
    const { commands } = createPiExtensionFixture(chocoAutopilot);
    const notify = vi.fn();

    expect(commands.has("sessions")).toBe(true);
    await commands.get("sessions")!.handler("", { cwd: "/repo", ui: { notify }, sessionManager: { getSessionId: () => "s1" } });

    expect(notify).toHaveBeenCalledWith(expect.stringContaining("session: s1"), "info");
  });
});
