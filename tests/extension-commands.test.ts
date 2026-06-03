import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import chocoAutopilot, { updateState } from "../extensions/choco-autopilot/index";
import { registerEffortCommand } from "../extensions/choco-autopilot/effort";

interface RegisteredCommand {
  handler: (
    args: string,
    ctx: {
      cwd?: string;
      ui: { notify: ReturnType<typeof vi.fn>; select?: ReturnType<typeof vi.fn> };
      model?: unknown;
      sessionManager?: { getSessionId: () => string };
    },
  ) => Promise<void>;
  getArgumentCompletions?: (prefix: string) => Array<{ value: string; label: string }> | null;
}

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<void> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "choco-pi-test-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
}

function registeredCommands(overrides: Record<string, unknown> = {}): Map<string, RegisteredCommand> {
  const commands = new Map<string, RegisteredCommand>();
  chocoAutopilot({
    on: vi.fn(),
    registerCommand: (name: string, definition: RegisteredCommand) => {
      commands.set(name, definition);
    },
    registerTool: vi.fn(),
    sendUserMessage: vi.fn(),
    exec: vi.fn(),
    getFlag: vi.fn(),
    getThinkingLevel: vi.fn(() => "medium"),
    setThinkingLevel: vi.fn(),
    ...overrides,
  } as never);
  return commands;
}

describe("extension command names", () => {
  it("registers personal commands without the choco prefix", () => {
    const commands = registeredCommands();

    expect([...commands.keys()]).toEqual(expect.arrayContaining(["mode", "intensity", "effort", "source", "memory", "ledger"]));
    expect([...commands.keys()].filter((name) => name.startsWith("choco-"))).toEqual([]);
  });

  it("opens interactive mode selector when /mode is invoked without argument text", async () => {
    await useTempAgentDir();
    const commands = registeredCommands();
    const notify = vi.fn();

    const select = vi.fn().mockResolvedValue(undefined);

    await commands.get("mode")!.handler("", { ui: { notify, select } });

    expect(select).toHaveBeenCalledWith(
      expect.stringContaining("Current mode: default"),
      expect.arrayContaining([
        expect.stringContaining("default [implemented, current]"),
        expect.stringContaining("web-analysis [implemented]"),
        expect.stringContaining("adoption-analysis [implemented]"),
        expect.stringContaining("coding [implemented]"),
        expect.stringContaining("design [implemented]"),
      ]),
    );
    expect(select.mock.calls[0][1].join("\n")).toContain("Root all-purpose generalist mode");
    expect(select.mock.calls[0][1].join("\n")).not.toContain("without weakening guardrails");
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Mode unchanged: default"), "info");
  });

  it("switches mode from the interactive /mode selector", async () => {
    await useTempAgentDir();
    const commands = registeredCommands();
    const notify = vi.fn();
    const select = vi.fn().mockResolvedValue("web-analysis [implemented] — Implemented mode for retrieval-first external web research, source confidence scoring, and critical review.");

    await commands.get("mode")!.handler("", { ui: { notify, select } });
    await commands.get("mode")!.handler("status", { ui: { notify, select } });

    expect(notify).toHaveBeenCalledWith("mode: web-analysis", "info");
    expect(notify).toHaveBeenLastCalledWith(expect.stringContaining("mode: web-analysis"), "info");
  });

  it("reports effective session mode and automatic overlay in /mode status", async () => {
    await useTempAgentDir();
    const commands = registeredCommands();
    const notify = vi.fn();

    await updateState((state) => {
      state.runtime = { workMode: "default", executionIntensity: "standard", updatedAt: "2026-06-03T00:00:00.000Z" };
      state.sessions.s1 = {
        effectiveWorkMode: "coding",
        automaticMode: true,
        executionIntensity: "deep",
        updatedAt: "2026-06-03T00:00:01.000Z",
      };
    });

    await commands.get("mode")!.handler("status", {
      cwd: tempAgentDir,
      ui: { notify },
      sessionManager: { getSessionId: () => "s1" },
    });

    expect(notify).toHaveBeenCalledWith(
      [
        "mode: default -> coding",
        "persistent: default",
        "effective: coding",
        "sequence: coding",
        "intensity: standard -> deep (session)",
        "session: s1",
        "updated: 2026-06-03T00:00:01.000Z",
        "automatic overlay: yes",
      ].join("\n"),
      "info",
    );
  });

  it("allows switching to implemented web-analysis mode without changing command names", async () => {
    await useTempAgentDir();
    const commands = registeredCommands();
    const notify = vi.fn();

    await commands.get("mode")!.handler("set web-analysis", { ui: { notify } });
    await commands.get("mode")!.handler("status", { ui: { notify } });

    expect(notify).toHaveBeenCalledWith(expect.stringContaining("mode: web-analysis"), "info");
    expect([...commands.keys()].filter((name) => name.startsWith("choco-"))).toEqual([]);
  });

  it("switches from web-analysis back to default without planned-mode warnings", async () => {
    await useTempAgentDir();
    const commands = registeredCommands();
    const notify = vi.fn();

    await commands.get("mode")!.handler("set web-analysis", { ui: { notify } });
    await commands.get("mode")!.handler("set default", { ui: { notify } });
    await commands.get("mode")!.handler("status", { ui: { notify } });

    expect(notify).toHaveBeenCalledWith("mode: web-analysis", "info");
    expect(notify).toHaveBeenCalledWith("mode: default", "info");
    expect(notify).toHaveBeenLastCalledWith(expect.stringContaining("mode: default"), "info");
    expect(notify.mock.calls.flat().join("\n")).not.toContain("planned but not implemented");
  });

  it("reports effective session intensity source in /intensity status", async () => {
    await useTempAgentDir();
    const commands = registeredCommands();
    const notify = vi.fn();

    await updateState((state) => {
      state.runtime = { workMode: "default", executionIntensity: "standard", updatedAt: "2026-06-03T00:00:00.000Z" };
      state.sessions.s1 = {
        effectiveWorkMode: "report",
        automaticMode: true,
        executionIntensity: "deep",
        updatedAt: "2026-06-03T00:00:01.000Z",
      };
    });

    await commands.get("intensity")!.handler("status", {
      cwd: tempAgentDir,
      ui: { notify },
      sessionManager: { getSessionId: () => "s1" },
    });

    expect(notify).toHaveBeenCalledWith(
      [
        "intensity: standard -> deep (session)",
        "persistent: standard",
        "effective: deep",
        "effective mode: report",
        "session: s1",
        "updated: 2026-06-03T00:00:01.000Z",
        "automatic overlay: yes",
      ].join("\n"),
      "info",
    );
  });

  it("sets thinking effort with Claude-style explicit and alias values", async () => {
    let thinkingLevel = "medium";
    const setThinkingLevel = vi.fn((level: string) => {
      thinkingLevel = level;
    });
    const commands = registeredCommands({
      getThinkingLevel: vi.fn(() => thinkingLevel),
      setThinkingLevel,
    });
    const notify = vi.fn();
    const model = { id: "gpt-5.5", reasoning: true, thinkingLevelMap: { xhigh: "high" } };

    await commands.get("effort")!.handler("high", { ui: { notify }, model });
    await commands.get("effort")!.handler("max", { ui: { notify }, model });
    await commands.get("effort")!.handler("auto", { ui: { notify }, model });

    expect(setThinkingLevel).toHaveBeenNthCalledWith(1, "high");
    expect(setThinkingLevel).toHaveBeenNthCalledWith(2, "xhigh");
    expect(setThinkingLevel).toHaveBeenNthCalledWith(3, "medium");
    expect(notify).toHaveBeenCalledWith("effort: medium -> high", "info");
    expect(notify).toHaveBeenCalledWith("effort: high -> xhigh", "info");
    expect(notify).toHaveBeenCalledWith("effort: xhigh -> medium (auto)", "info");
  });

  it("rejects unsupported effort values and exposes argument completions", async () => {
    const setThinkingLevel = vi.fn();
    const commands = registeredCommands({ setThinkingLevel });
    const notify = vi.fn();
    const model = { id: "standard-reasoning", reasoning: true };

    await commands.get("effort")!.handler("xhigh", { ui: { notify }, model });

    expect(setThinkingLevel).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Unsupported effort 'xhigh'"), "error");
    expect(commands.get("effort")!.getArgumentCompletions!("")).toEqual([
      { value: "low", label: "low" },
      { value: "medium", label: "medium" },
      { value: "high", label: "high" },
      { value: "auto", label: "auto" },
    ]);
  });

  it("lists effort completions from the active model without synthetic max", async () => {
    const eventHandlers = new Map<string, Array<(event: unknown, ctx: { model?: unknown }) => void>>();
    const commands = new Map<string, RegisteredCommand>();
    registerEffortCommand({
      on: (name: string, handler: (event: unknown, ctx: { model?: unknown }) => void) => {
        eventHandlers.set(name, [...(eventHandlers.get(name) ?? []), handler]);
      },
      registerCommand: (name: string, definition: RegisteredCommand) => {
        commands.set(name, definition);
      },
      getThinkingLevel: vi.fn(() => "medium"),
      setThinkingLevel: vi.fn(),
    } as never);

    const gptModel = { id: "gpt-5.5", reasoning: true, thinkingLevelMap: { xhigh: "high" } };
    eventHandlers.get("session_start")?.forEach((handler) => handler({}, { model: gptModel }));

    const completions = commands.get("effort")!.getArgumentCompletions!("");

    expect(completions).toEqual([
      { value: "low", label: "low" },
      { value: "medium", label: "medium" },
      { value: "high", label: "high" },
      { value: "xhigh", label: "xhigh" },
      { value: "auto", label: "auto" },
    ]);
    expect(completions?.map((item) => item.value)).not.toContain("max");
  });

  it("supports watch decisions in the source command", async () => {
    await useTempAgentDir();
    const commands = registeredCommands();
    const notify = vi.fn();

    await commands.get("source")!.handler("add https://github.com/example/upstream-utility license unstable", { ui: { notify } });
    await commands.get("source")!.handler("watch github-example-upstream-utility Watch until license stabilizes", { ui: { notify } });
    await commands.get("source")!.handler("list", { ui: { notify } });

    expect(notify).toHaveBeenCalledWith("Marked watching: github-example-upstream-utility", "info");
    expect(notify).toHaveBeenLastCalledWith(expect.stringContaining("[watching]"), "info");
  });
});
