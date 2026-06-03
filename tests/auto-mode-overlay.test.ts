import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import chocoAutopilot from "../extensions/choco-autopilot/index";

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown | Promise<unknown>;

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<void> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "choco-pi-overlay-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
}

function setupAutopilot(): { handlers: Map<string, EventHandler[]>; commands: Map<string, { handler: EventHandler }> } {
  const handlers = new Map<string, EventHandler[]>();
  const commands = new Map<string, { handler: EventHandler }>();
  chocoAutopilot({
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
    const status = notify.mock.calls[0][0] as string;
    expect(status).toContain("mode: default -> web-analysis");
    expect(status).toContain("persistent: default");
    expect(status).toContain("effective: web-analysis");
    expect(status).toContain("sequence: web-analysis");
    expect(status).toContain("session: session-a");
    expect(status).toContain("automatic overlay: yes");
  });

  it("keeps generic report-writing turns in report mode without automatic web-analysis overcollection", async () => {
    await useTempAgentDir();
    const { handlers, commands } = setupAutopilot();
    const beforeHandlers = handlers.get("before_agent_start")!;
    const before = beforeHandlers[beforeHandlers.length - 1]!;

    const result = await before({ systemPrompt: "base", prompt: "보고서 작성해줘" }, ctx("session-report")) as { systemPrompt: string };

    expect(result.systemPrompt).toContain("Persistent work mode: default");
    expect(result.systemPrompt).toContain("Effective work mode for this turn: report");
    expect(result.systemPrompt).not.toContain("Effective work mode sequence for this turn: web-analysis -> report");
    expect(result.systemPrompt).not.toContain("Web Analysis Mode");
    expect(result.systemPrompt).toContain("Report Mode");
    expect(result.systemPrompt).toContain("Protocol: report-research");
    expect(result.systemPrompt).toContain("report_research_gate");

    const notify = vi.fn();
    await commands.get("mode")!.handler("status" as never, { ...ctx("session-report"), ui: { notify } });
    const status = notify.mock.calls[0][0] as string;
    expect(status).toContain("mode: default -> report");
    expect(status).toContain("persistent: default");
    expect(status).toContain("effective: report");
    expect(status).toContain("sequence: report");
    expect(status).toContain("session: session-report");
    expect(status).toContain("automatic overlay: yes");
  });

  it("keeps explicit no-external-research report turns in report mode only", async () => {
    await useTempAgentDir();
    const { handlers } = setupAutopilot();
    const beforeHandlers = handlers.get("before_agent_start")!;
    const before = beforeHandlers[beforeHandlers.length - 1]!;

    const result = await before({ systemPrompt: "base", prompt: "첨부 자료만 기반으로 보고서 작성해줘. 외부 리서치 하지 마." }, ctx("session-report-boundary")) as { systemPrompt: string };

    expect(result.systemPrompt).toContain("Persistent work mode: default");
    expect(result.systemPrompt).toContain("Effective work mode for this turn: report");
    expect(result.systemPrompt).not.toContain("Effective work mode sequence for this turn: web-analysis -> report");
    expect(result.systemPrompt).not.toContain("Web Analysis Mode");
    expect(result.systemPrompt).toContain("Report Mode");
  });

  it("applies sequential web-analysis then report routing for research-backed report turns", async () => {
    await useTempAgentDir();
    const { handlers, commands } = setupAutopilot();
    const beforeHandlers = handlers.get("before_agent_start")!;
    const before = beforeHandlers[beforeHandlers.length - 1]!;

    const result = await before({ systemPrompt: "base", prompt: "자료 조사해서 보고서 작성해줘" }, ctx("session-sequential-report")) as { systemPrompt: string };

    expect(result.systemPrompt).toContain("Persistent work mode: default");
    expect(result.systemPrompt).toContain("Effective work mode for this turn: report");
    expect(result.systemPrompt).toContain("Effective work mode sequence for this turn: web-analysis -> report");
    expect(result.systemPrompt).toContain("Stage 1: web-analysis");
    expect(result.systemPrompt).toContain("Stage 2: report");
    expect(result.systemPrompt).toContain("Web Analysis Mode");
    expect(result.systemPrompt).toContain("Report Mode");

    const notify = vi.fn();
    await commands.get("mode")!.handler("status" as never, { ...ctx("session-sequential-report"), ui: { notify } });
    const status = notify.mock.calls[0][0] as string;
    expect(status).toContain("mode: default -> report");
    expect(status).toContain("persistent: default");
    expect(status).toContain("effective: report");
    expect(status).toContain("sequence: web-analysis -> report");
    expect(status).toContain("session: session-sequential-report");
    expect(status).toContain("automatic overlay: yes");
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
    const status = notify.mock.calls[0][0] as string;
    expect(status).toContain("mode: default -> coding");
    expect(status).toContain("persistent: default");
    expect(status).toContain("effective: coding");
    expect(status).toContain("sequence: coding");
    expect(status).toContain("session: session-coding");
    expect(status).toContain("automatic overlay: yes");
  });

  it("applies a design effective mode for design/UI/UX turns without changing persistent mode", async () => {
    await useTempAgentDir();
    const { handlers, commands } = setupAutopilot();
    const beforeHandlers = handlers.get("before_agent_start")!;
    const before = beforeHandlers[beforeHandlers.length - 1]!;

    const result = await before({ systemPrompt: "base", prompt: "대시보드 UI/UX 디자인 방향 잡아줘" }, ctx("session-design")) as { systemPrompt: string };

    expect(result.systemPrompt).toContain("Persistent work mode: default");
    expect(result.systemPrompt).toContain("Effective work mode for this turn: design");
    expect(result.systemPrompt).toContain("Design Mode");

    const notify = vi.fn();
    await commands.get("mode")!.handler("status" as never, { ...ctx("session-design"), ui: { notify } });
    const status = notify.mock.calls[0][0] as string;
    expect(status).toContain("mode: default -> design");
    expect(status).toContain("persistent: default");
    expect(status).toContain("effective: design");
    expect(status).toContain("sequence: design");
    expect(status).toContain("session: session-design");
    expect(status).toContain("automatic overlay: yes");
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
