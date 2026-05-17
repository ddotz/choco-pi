import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import chocoAutopilot, { updateState } from "../extensions/choco-autopilot/index";
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

  it("reports the actual persistent/effective mode from choco state", async () => {
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    const agentDir = await mkdtemp(join(tmpdir(), "choco-pi-sessions-state-"));
    process.env.PI_CODING_AGENT_DIR = agentDir;
    try {
      const { commands } = createPiExtensionFixture(chocoAutopilot);
      const notify = vi.fn();
      await updateState((state) => {
        state.runtime = { workMode: "default", executionIntensity: "standard", updatedAt: "2026-05-17T00:00:00.000Z" };
        state.sessions.s1 = {
          effectiveWorkMode: "coding",
          automaticMode: true,
          executionIntensity: "deep",
          updatedAt: "2026-05-17T00:00:00.000Z",
        };
      });

      await commands.get("sessions")!.handler("", { cwd: agentDir, ui: { notify }, sessionManager: { getSessionId: () => "s1" } });

      expect(notify).toHaveBeenCalledWith(expect.stringContaining("mode: default->coding/deep"), "info");
    } finally {
      if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
      await rm(agentDir, { recursive: true, force: true });
    }
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
