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
  tempAgentDir = await mkdtemp(join(tmpdir(), "choco-pi-ledger-test-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
}

function setupAutopilot(): {
  handlers: Map<string, EventHandler[]>;
  commands: Map<string, RegisteredCommand>;
} {
  const handlers = new Map<string, EventHandler[]>();
  const commands = new Map<string, RegisteredCommand>();
  chocoAutopilot({
    on: (event: string, handler: EventHandler) => {
      const existing = handlers.get(event) ?? [];
      existing.push(handler);
      handlers.set(event, existing);
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

async function emitAll(handlers: Map<string, EventHandler[]>, eventName: string, event: Record<string, unknown>, cwd = "/repo"): Promise<void> {
  for (const handler of handlers.get(eventName) ?? []) {
    await handler(event, { cwd, hasUI: false, ui: {} });
  }
}

describe("ledger auto recording", () => {
  it("records changed files from write/edit tool calls and verification commands from bash results", async () => {
    await useTempAgentDir();
    const { handlers, commands } = setupAutopilot();
    const cwd = "/repo";
    const notify = vi.fn();

    await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt: "파일 수정하고 테스트해", systemPrompt: "base", systemPromptOptions: {} }, cwd);
    await emitAll(handlers, "tool_call", { type: "tool_call", toolCallId: "edit-1", toolName: "edit", input: { path: "src/app.ts", edits: [] } }, cwd);
    await emitAll(handlers, "tool_result", {
      type: "tool_result",
      toolCallId: "bash-1",
      toolName: "bash",
      input: { command: "pnpm run test" },
      isError: false,
      content: [{ type: "text", text: "Tests passed" }],
    }, cwd);

    await commands.get("ledger")!.handler("", { cwd, ui: { notify } });

    const summary = notify.mock.calls.at(-1)?.[0] as string;
    expect(summary).toContain("Changed files:");
    expect(summary).toContain("src/app.ts");
    expect(summary).toContain("Verification:");
    expect(summary).toContain("passed: pnpm run test");
    expect(summary).toContain("Tests passed");
  });
});
