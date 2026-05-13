import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import chocoAutopilot from "../extensions/choco-autopilot/index";

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown | Promise<unknown>;

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  delete process.env.CHOCO_PI_IMPROVEMENT_MODE;
  delete process.env.CHOCO_PI_IMPROVEMENT_PROFILE;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<void> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "choco-pi-home-memory-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
}

function setupAutopilot(): { handlers: Map<string, EventHandler[]>; commands: Map<string, { handler: EventHandler }> } {
  const handlers = new Map<string, EventHandler[]>();
  const commands = new Map<string, { handler: EventHandler }>();
  chocoAutopilot({
    on: (event: string, handler: EventHandler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerCommand: (name: string, command: { handler: EventHandler }) => commands.set(name, command),
    registerTool: vi.fn(),
    sendUserMessage: vi.fn(),
    sendMessage: vi.fn(),
    exec: vi.fn(),
    getFlag: vi.fn(),
  } as never);
  return { handlers, commands };
}

function ctx(cwd: string): Record<string, unknown> {
  return {
    cwd,
    hasUI: false,
    sessionManager: { getSessionId: () => `session-${cwd}` },
    ui: { notify: vi.fn(), setStatus: vi.fn(), theme: { fg: (_name: string, text: string) => text } },
  };
}

describe("home readonly global memory", () => {
  it("injects global memories as readonly recall when cwd is home", async () => {
    await useTempAgentDir();
    const { handlers, commands } = setupAutopilot();
    const notify = vi.fn();

    await commands.get("memory")!.handler("save User preference: home can read global memory" as never, { ...ctx("/repo"), ui: { notify } });

    const beforeHandlers = handlers.get("before_agent_start")!;
    const before = beforeHandlers[beforeHandlers.length - 1]!;
    const result = await before({ systemPrompt: "base", prompt: "메모리 확인" }, ctx(homedir())) as { systemPrompt: string };

    expect(result.systemPrompt).toContain("Global Memory Recall");
    expect(result.systemPrompt).toContain("Scope: readonly");
    expect(result.systemPrompt).toContain("User preference: home can read global memory");
  });

  it("blocks memory saves from home readonly scope", async () => {
    await useTempAgentDir();
    const { commands } = setupAutopilot();
    const notify = vi.fn();

    await commands.get("memory")!.handler("save User preference: should not be saved from home" as never, { ...ctx(homedir()), ui: { notify } });
    await commands.get("memory")!.handler("list" as never, { ...ctx(homedir()), ui: { notify } });

    expect(notify.mock.calls[0][0]).toContain("readonly");
    expect(notify.mock.calls.at(-1)?.[0]).not.toContain("should not be saved from home");
  });

  it("allows memory saves from home when an explicit profile scope is selected", async () => {
    await useTempAgentDir();
    process.env.CHOCO_PI_IMPROVEMENT_MODE = "auto";
    process.env.CHOCO_PI_IMPROVEMENT_PROFILE = "personal";
    const { commands } = setupAutopilot();
    const notify = vi.fn();

    await commands.get("memory")!.handler("save User preference: explicit profile can save from home" as never, { ...ctx(homedir()), ui: { notify } });
    await commands.get("memory")!.handler("list" as never, { ...ctx(homedir()), ui: { notify } });

    expect(notify.mock.calls[0][0]).toContain("Saved memory");
    expect(notify.mock.calls.at(-1)?.[0]).toContain("explicit profile can save from home");
  });
});
