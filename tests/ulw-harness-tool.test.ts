import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import chocoAutopilot from "../extensions/choco-autopilot/index";

interface RegisteredTool {
  name: string;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    ctx: { cwd: string; sessionManager?: { getSessionId: () => string } },
  ) => Promise<{ content: Array<{ type: string; text: string }>; details?: unknown }>;
}

interface RegisteredCommand {
  handler: (
    args: string,
    ctx: { cwd: string; ui: { notify: ReturnType<typeof vi.fn> }; sessionManager?: { getSessionId: () => string } },
  ) => Promise<void>;
}

let tempAgentDir: string | undefined;
let tempCwd: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  if (tempCwd) await rm(tempCwd, { recursive: true, force: true });
  tempAgentDir = undefined;
  tempCwd = undefined;
});

async function useTempPaths(): Promise<{ agentDir: string; cwd: string }> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "choco-pi-ulw-agent-"));
  tempCwd = await mkdtemp(join(tmpdir(), "choco-pi-ulw-cwd-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
  return { agentDir: tempAgentDir, cwd: tempCwd };
}

function registeredHarness(exec = vi.fn()): { tools: Map<string, RegisteredTool>; commands: Map<string, RegisteredCommand> } {
  const tools = new Map<string, RegisteredTool>();
  const commands = new Map<string, RegisteredCommand>();
  chocoAutopilot({
    on: vi.fn(),
    registerCommand: (name: string, command: RegisteredCommand) => commands.set(name, command),
    registerTool: (tool: RegisteredTool) => tools.set(tool.name, tool),
    sendUserMessage: vi.fn(),
    sendMessage: vi.fn(),
    exec,
    getFlag: vi.fn(),
  } as never);
  return { tools, commands };
}

function registeredTools(exec = vi.fn()): Map<string, RegisteredTool> {
  return registeredHarness(exec).tools;
}

function ctx(cwd: string): { cwd: string; sessionManager: { getSessionId: () => string } } {
  return { cwd, sessionManager: { getSessionId: () => "s1" } };
}

describe("ulw_harness tool", () => {
  it("registers /ulw as the explicit user-facing harness command", async () => {
    const { cwd } = await useTempPaths();
    const { commands } = registeredHarness();
    const notify = vi.fn();

    expect(commands.has("ulw")).toBe(true);

    await commands.get("ulw")!.handler("start Port ULW command", { cwd, ui: { notify }, sessionManager: { getSessionId: () => "s1" } });
    await commands.get("ulw")!.handler("status", { cwd, ui: { notify }, sessionManager: { getSessionId: () => "s1" } });

    expect(notify.mock.calls.map((call) => call[0]).join("\n")).toContain("Port ULW command");
  });

  it("writes markdown context and returns it through status", async () => {
    const { cwd } = await useTempPaths();
    const tool = registeredTools().get("ulw_harness");

    expect(tool).toBeDefined();

    await tool!.execute("start-1", {
      action: "start",
      objective: "Port ULW harness",
      successCriteria: ["route explicit ulw", "persist markdown context"],
      plan: ["write failing tests", "implement minimal tool"],
      nextActions: ["run targeted vitest"],
    }, undefined, undefined, ctx(cwd));

    const contextPath = join(cwd, ".pi", "ulw", "s1", "context.md");
    const context = await readFile(contextPath, "utf8");
    const status = await tool!.execute("status-1", { action: "status" }, undefined, undefined, ctx(cwd));

    expect(context).toContain("# ULW Harness Context");
    expect(context).toContain("Objective: Port ULW harness");
    expect(context).toContain("- route explicit ulw");
    expect(context).toContain("- run targeted vitest");
    expect(status.content[0].text).toContain("Port ULW harness");
  });

  it("captures tmux-managed command output, writes transcript, and records cleanup", async () => {
    const { cwd } = await useTempPaths();
    await mkdir(cwd, { recursive: true });
    const exec = vi.fn()
      .mockResolvedValueOnce({ code: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ code: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ code: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ code: 0, stdout: "QA PASS\n__CHOCO_ULW_EXIT_TMUX_1__:0\n", stderr: "" })
      .mockResolvedValueOnce({ code: 0, stdout: "", stderr: "" });
    const tool = registeredTools(exec).get("ulw_harness")!;

    const result = await tool.execute("tmux-1", {
      action: "tmux-test",
      command: "printf QA-PASS",
      label: "router smoke",
    }, undefined, undefined, ctx(cwd));

    const evidencePath = join(cwd, ".pi", "ulw", "s1", "evidence", "router-smoke.txt");
    const transcript = await readFile(evidencePath, "utf8");
    const ledger = await readFile(join(cwd, ".pi", "ulw", "s1", "ledger.md"), "utf8");

    expect(exec).toHaveBeenNthCalledWith(1, "tmux", ["new-session", "-d", "-s", "choco-ulw-s1-tmux-1", "-c", cwd], expect.objectContaining({ timeout: 2000 }));
    expect(exec).toHaveBeenNthCalledWith(2, "tmux", ["send-keys", "-t", "choco-ulw-s1-tmux-1", "-l", expect.stringContaining("printf QA-PASS")], expect.objectContaining({ timeout: 2000 }));
    expect(exec.mock.calls[1][1][4]).toContain("__CHOCO_ULW_EXIT_TMUX_1__");
    expect(exec).toHaveBeenNthCalledWith(3, "tmux", ["send-keys", "-t", "choco-ulw-s1-tmux-1", "Enter"], expect.objectContaining({ timeout: 2000 }));
    expect(exec).toHaveBeenNthCalledWith(4, "tmux", ["capture-pane", "-p", "-t", "choco-ulw-s1-tmux-1", "-S", "-", "-E", "-"], expect.objectContaining({ timeout: 5000 }));
    expect(exec).toHaveBeenNthCalledWith(5, "tmux", ["kill-session", "-t", "choco-ulw-s1-tmux-1"], expect.objectContaining({ timeout: 2000 }));
    expect(transcript).toContain("QA PASS");
    expect(ledger).toContain("cleanup: tmux kill-session -t choco-ulw-s1-tmux-1");
    expect(result.details).toMatchObject({ result: { ok: true, action: "tmux-test", evidencePath } });
  });

  it("waits for delayed tmux command completion before capturing final evidence", async () => {
    const { cwd } = await useTempPaths();
    const exec = vi.fn()
      .mockResolvedValueOnce({ code: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ code: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ code: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ code: 0, stdout: "still running\n", stderr: "" })
      .mockResolvedValueOnce({ code: 0, stdout: "still running\nQA PASS\n__CHOCO_ULW_EXIT_TMUX_DELAY__:0\n", stderr: "" })
      .mockResolvedValueOnce({ code: 0, stdout: "", stderr: "" });
    const tool = registeredTools(exec).get("ulw_harness")!;

    const result = await tool.execute("tmux-delay", {
      action: "tmux-test",
      command: "sleep 1; printf QA-PASS",
      label: "delayed qa",
    }, undefined, undefined, ctx(cwd));

    const transcript = await readFile(join(cwd, ".pi", "ulw", "s1", "evidence", "delayed-qa.txt"), "utf8");

    expect(exec.mock.calls.filter((call) => call[1][0] === "capture-pane")).toHaveLength(2);
    expect(transcript).toContain("QA PASS");
    expect(result.details).toMatchObject({ result: { ok: true, action: "tmux-test" } });
  });

  it("returns a failed result and cleanup receipt for nonzero tmux command exits", async () => {
    const { cwd } = await useTempPaths();
    const exec = vi.fn()
      .mockResolvedValueOnce({ code: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ code: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ code: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ code: 0, stdout: "QA FAIL\n__CHOCO_ULW_EXIT_TMUX_FAIL__:2\n", stderr: "" })
      .mockResolvedValueOnce({ code: 0, stdout: "", stderr: "" });
    const tool = registeredTools(exec).get("ulw_harness")!;

    const result = await tool.execute("tmux-fail", {
      action: "tmux-test",
      command: "printf QA-FAIL; exit 2",
      label: "failing qa",
    }, undefined, undefined, ctx(cwd));

    const evidencePath = join(cwd, ".pi", "ulw", "s1", "evidence", "failing-qa.txt");
    const transcript = await readFile(evidencePath, "utf8");
    const ledger = await readFile(join(cwd, ".pi", "ulw", "s1", "ledger.md"), "utf8");

    expect(transcript).toContain("QA FAIL");
    expect(ledger).toContain("exit code: 2");
    expect(ledger).toContain("cleanup: tmux kill-session -t choco-ulw-s1-tmux-fail");
    expect(result.content[0].text).toContain("failed");
    expect(result.details).toMatchObject({ result: { ok: false, action: "tmux-test", reason: "exit code: 2", evidencePath } });
  });

  it("times out tmux commands without a completion marker and records cleanup", async () => {
    const { cwd } = await useTempPaths();
    const exec = vi.fn(async (_command: string, args: string[]) => {
      if (args[0] === "capture-pane") return { code: 0, stdout: "still running\n", stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    });
    const tool = registeredTools(exec).get("ulw_harness")!;

    const result = await tool.execute("tmux-timeout", {
      action: "tmux-test",
      command: "sleep 60",
      label: "timeout qa",
      timeoutMs: 1,
    }, undefined, undefined, ctx(cwd));

    const evidencePath = join(cwd, ".pi", "ulw", "s1", "evidence", "timeout-qa.txt");
    const transcript = await readFile(evidencePath, "utf8");
    const ledger = await readFile(join(cwd, ".pi", "ulw", "s1", "ledger.md"), "utf8");

    expect(exec.mock.calls.some((call) => call[1][0] === "kill-session")).toBe(true);
    expect(transcript).toContain("still running");
    expect(ledger).toContain("timed out waiting for tmux completion marker");
    expect(ledger).toContain("cleanup: tmux kill-session -t choco-ulw-s1-tmux-timeout");
    expect(result.details).toMatchObject({
      result: {
        ok: false,
        action: "tmux-test",
        reason: expect.stringContaining("timed out waiting for tmux completion marker"),
        evidencePath,
      },
    });
  });
});
