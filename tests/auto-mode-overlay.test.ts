import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import ddotzAutopilot from "../extensions/ddotz-autopilot/index";

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown | Promise<unknown>;

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<void> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "ddotz-pi-overlay-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
}

function setupAutopilot(): { handlers: Map<string, EventHandler[]>; commands: Map<string, { handler: EventHandler }> } {
  const handlers = new Map<string, EventHandler[]>();
  const commands = new Map<string, { handler: EventHandler }>();
  ddotzAutopilot({
    on: (event: string, handler: EventHandler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
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

function ctx(sessionId: string): Record<string, unknown> {
  return {
    cwd: "/repo",
    hasUI: false,
    sessionManager: { getSessionId: () => sessionId },
    ui: { notify: vi.fn(), setStatus: vi.fn(), theme: { fg: (_name: string, text: string) => text } },
  };
}

describe("auto mode overlay", () => {
  it("applies a web-analysis effective mode for a matching turn without changing persistent mode", async () => {
    await useTempAgentDir();
    const { handlers, commands } = setupAutopilot();
    const beforeHandlers = handlers.get("before_agent_start")!;
    const before = beforeHandlers[beforeHandlers.length - 1]!;

    const result = await before({ systemPrompt: "base", prompt: "https://example.com 분석해줘" }, ctx("session-a")) as { systemPrompt: string };

    expect(result.systemPrompt).toContain("Persistent work mode: default");
    expect(result.systemPrompt).toContain("Effective work mode for this turn: web-analysis");
    expect(result.systemPrompt).toContain("Web Analysis Mode");

    const notify = vi.fn();
    await commands.get("mode")!.handler("status" as never, { ...ctx("session-a"), ui: { notify } });
    expect(notify).toHaveBeenCalledWith("mode: default", "info");
  });

  it("applies a report effective mode for report-writing turns without changing persistent mode", async () => {
    await useTempAgentDir();
    const { handlers, commands } = setupAutopilot();
    const beforeHandlers = handlers.get("before_agent_start")!;
    const before = beforeHandlers[beforeHandlers.length - 1]!;

    const result = await before({ systemPrompt: "base", prompt: "보고서 작성해줘" }, ctx("session-report")) as { systemPrompt: string };

    expect(result.systemPrompt).toContain("Persistent work mode: default");
    expect(result.systemPrompt).toContain("Effective work mode for this turn: report");
    expect(result.systemPrompt).toContain("Report Mode");

    const notify = vi.fn();
    await commands.get("mode")!.handler("status" as never, { ...ctx("session-report"), ui: { notify } });
    expect(notify).toHaveBeenCalledWith("mode: default", "info");
  });

  it("applies a coding effective mode for implementation turns without changing persistent mode", async () => {
    await useTempAgentDir();
    const { handlers, commands } = setupAutopilot();
    const beforeHandlers = handlers.get("before_agent_start")!;
    const before = beforeHandlers[beforeHandlers.length - 1]!;

    const result = await before({ systemPrompt: "base", prompt: "버그 수정하고 테스트까지 돌려줘" }, ctx("session-coding")) as { systemPrompt: string };

    expect(result.systemPrompt).toContain("Persistent work mode: default");
    expect(result.systemPrompt).toContain("Effective work mode for this turn: coding");
    expect(result.systemPrompt).toContain("Coding Mode");

    const notify = vi.fn();
    await commands.get("mode")!.handler("status" as never, { ...ctx("session-coding"), ui: { notify } });
    expect(notify).toHaveBeenCalledWith("mode: default", "info");
  });

  it("keeps local implementation analysis in default instead of web-analysis", async () => {
    await useTempAgentDir();
    const { handlers } = setupAutopilot();
    const beforeHandlers = handlers.get("before_agent_start")!;
    const before = beforeHandlers[beforeHandlers.length - 1]!;

    const result = await before({ systemPrompt: "base", prompt: "모드 구현 분석하고 critic 작성해" }, ctx("session-local-analysis")) as { systemPrompt: string };

    expect(result.systemPrompt).toContain("Effective work mode for this turn: default");
    expect(result.systemPrompt).not.toContain("Web Analysis Mode");
  });

  it("routes documentation file edits to coding instead of report", async () => {
    await useTempAgentDir();
    const { handlers } = setupAutopilot();
    const beforeHandlers = handlers.get("before_agent_start")!;
    const before = beforeHandlers[beforeHandlers.length - 1]!;

    const result = await before({ systemPrompt: "base", prompt: "README 문서 오타 수정해" }, ctx("session-doc-edit")) as { systemPrompt: string };

    expect(result.systemPrompt).toContain("Effective work mode for this turn: coding");
    expect(result.systemPrompt).toContain("Coding Mode");
    expect(result.systemPrompt).not.toContain("Report Mode");
  });

  it("keeps local repo analysis in default instead of adoption-analysis", async () => {
    await useTempAgentDir();
    const { handlers } = setupAutopilot();
    const beforeHandlers = handlers.get("before_agent_start")!;
    const before = beforeHandlers[beforeHandlers.length - 1]!;

    const result = await before({ systemPrompt: "base", prompt: "이 repo 구조 분석해" }, ctx("session-local-repo")) as { systemPrompt: string };

    expect(result.systemPrompt).toContain("Effective work mode for this turn: default");
    expect(result.systemPrompt).not.toContain("Adoption Analysis Mode");
  });
});
