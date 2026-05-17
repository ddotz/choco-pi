import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("summarizes the real todo tool state schema", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "choco-pi-sessions-"));
    try {
      const { commands } = createPiExtensionFixture(chocoAutopilot);
      const notify = vi.fn();
      const todoDir = join(cwd, ".pi", "sessions", "s1");
      await mkdir(todoDir, { recursive: true });
      await writeFile(join(todoDir, "todos.json"), JSON.stringify({
        version: 1,
        nextId: 4,
        todos: [
          { id: 1, text: "active", status: "in_progress" },
          { id: 2, text: "pending", status: "pending" },
          { id: 3, text: "done", status: "done" },
        ],
      }), "utf8");

      await commands.get("sessions")!.handler("", { cwd, ui: { notify }, sessionManager: { getSessionId: () => "s1" } });

      expect(notify).toHaveBeenCalledWith(expect.stringContaining("todos: 1 active / 1 pending / 1 done"), "info");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
