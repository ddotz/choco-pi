import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import chocoAutopilot from "../extensions/choco-autopilot/index";

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown | Promise<unknown>;

interface RegisteredCommand {
  handler: (args: string, ctx: { cwd: string; ui: { notify: ReturnType<typeof vi.fn> } }) => Promise<void>;
}

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<void> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "choco-pi-dogfood-test-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
}

function setupAutopilot(): { handlers: Map<string, EventHandler[]>; commands: Map<string, RegisteredCommand> } {
  const handlers = new Map<string, EventHandler[]>();
  const commands = new Map<string, RegisteredCommand>();
  chocoAutopilot({
    on: (event: string, handler: EventHandler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerCommand: (name: string, definition: RegisteredCommand) => {
      commands.set(name, definition);
    },
    registerTool: vi.fn(),
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
    exec: vi.fn(),
    getFlag: vi.fn(),
  } as never);
  return { handlers, commands };
}

async function emitAll(handlers: Map<string, EventHandler[]>, eventName: string, event: Record<string, unknown>, cwd = "/Users/hyuns/Code/example"): Promise<void> {
  for (const handler of handlers.get(eventName) ?? []) await handler(event, { cwd, hasUI: false, ui: {} });
}

describe("dogfood commands and hook capture", () => {
  it("registers /dogfood and captures a clean cross-project case without raw prompt text", async () => {
    await useTempAgentDir();
    const { handlers, commands } = setupAutopilot();
    const notify = vi.fn();
    const prompt = "비밀 토큰 sk-test-123은 저장하지 말고 테스트를 고쳐줘";

    expect(commands.has("dogfood")).toBe(true);

    await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt, systemPrompt: "base", systemPromptOptions: {} });
    await emitAll(handlers, "tool_call", { type: "tool_call", toolCallId: "bash-1", toolName: "bash", input: { command: "pnpm run test" } });
    await emitAll(handlers, "tool_result", { type: "tool_result", toolCallId: "bash-1", toolName: "bash", input: { command: "pnpm run test" }, isError: false, content: [{ type: "text", text: "Tests passed" }], details: {} });
    await emitAll(handlers, "tool_result", { type: "tool_result", toolCallId: "gate-1", toolName: "structural_gate", input: {}, isError: false, content: [{ type: "text", text: "Structural gate passed." }], details: { ok: true } });
    await emitAll(handlers, "message_end", { type: "message_end", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "완료했습니다." }], provider: "test", model: "test-model" } });

    await commands.get("dogfood")!.handler("weekly", { cwd: "/Users/hyuns/Code/example", ui: { notify } });

    const output = notify.mock.calls.at(-1)?.[0] as string;
    expect(output).toContain("Dogfood weekly report");
    expect(output).toContain("eligible cases: 1");
    expect(output).toContain("clean hit rate: 100.0%");
    expect(output).not.toContain("sk-test-123");
    expect(output).not.toContain(prompt);
  });

  it("reports status and review queue", async () => {
    await useTempAgentDir();
    const { commands } = setupAutopilot();
    const notify = vi.fn();

    await commands.get("dogfood")!.handler("status", { cwd: "/repo", ui: { notify } });
    await commands.get("dogfood")!.handler("queue", { cwd: "/repo", ui: { notify } });

    expect(notify.mock.calls[0][0]).toContain("dogfood status");
    expect(notify.mock.calls[1][0]).toContain("review queue: 0");
  });
});
