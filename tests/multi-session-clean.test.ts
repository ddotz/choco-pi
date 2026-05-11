import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import ddotzAutopilot from "../extensions/ddotz-autopilot/index";
import todoWidget from "../extensions/todo-widget";

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown | Promise<unknown>;

interface RegisteredTool {
  execute: (toolCallId: string, params: Record<string, unknown>, signal: unknown, onUpdate: unknown, ctx: Record<string, unknown>) => Promise<{ content?: Array<{ type: string; text: string }> }>;
}

let tempAgentDir: string | undefined;
let tempDirs: string[] = [];

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempAgentDir = undefined;
  tempDirs = [];
});

async function useTempAgentDir(): Promise<void> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "ddotz-pi-multi-agent-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
}

async function makeTempCwd(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ddotz-pi-multi-cwd-"));
  tempDirs.push(dir);
  return dir;
}

function ctx(cwd: string, sessionId: string, notify = vi.fn()): Record<string, unknown> {
  return {
    cwd,
    hasUI: false,
    sessionManager: {
      getSessionId: () => sessionId,
      getCwd: () => cwd,
      getBranch: () => [],
    },
    ui: {
      notify,
      setStatus: vi.fn(),
      setWidget: vi.fn(),
      theme: { fg: (_name: string, text: string) => text },
    },
  };
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

function setupTodoWidget(): { handlers: Map<string, EventHandler[]>; tool: RegisteredTool } {
  const handlers = new Map<string, EventHandler[]>();
  let tool: RegisteredTool | undefined;
  todoWidget({
    on: (event: string, handler: EventHandler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    registerTool: (definition: RegisteredTool & { name: string }) => {
      if (definition.name === "todo") tool = definition;
    },
    registerCommand: vi.fn(),
  } as never);
  if (!tool) throw new Error("todo tool was not registered");
  return { handlers, tool };
}

async function emitAll(handlers: Map<string, EventHandler[]>, eventName: string, event: Record<string, unknown>, context: Record<string, unknown>): Promise<void> {
  for (const handler of handlers.get(eventName) ?? []) await handler(event, context);
}

async function runTodo(tool: RegisteredTool, cwd: string, sessionId: string, params: Record<string, unknown>): Promise<string> {
  const result = await tool.execute("todo-call", params, undefined, vi.fn(), ctx(cwd, sessionId));
  return result.content?.map((item) => item.text).join("\n") ?? "";
}

describe("multi-session clean work", () => {
  it("keeps same-cwd sessions from sharing todo or ledger state", async () => {
    await useTempAgentDir();
    const cwd = await makeTempCwd();
    const autopilot = setupAutopilot();
    const todos = setupTodoWidget();

    await runTodo(todos.tool, cwd, "session-a", { action: "add", text: "session A task" });
    await runTodo(todos.tool, cwd, "session-b", { action: "add", text: "session B task" });

    await emitAll(autopilot.handlers, "tool_call", { toolName: "write", input: { path: "src/session-a.ts" } }, ctx(cwd, "session-a"));
    await emitAll(autopilot.handlers, "tool_call", { toolName: "write", input: { path: "src/session-b.ts" } }, ctx(cwd, "session-b"));

    const notifyA = vi.fn();
    const notifyB = vi.fn();
    await autopilot.commands.get("ledger")!.handler("" as never, ctx(cwd, "session-a", notifyA));
    await autopilot.commands.get("ledger")!.handler("" as never, ctx(cwd, "session-b", notifyB));

    expect(notifyA.mock.calls[0][0]).toContain("src/session-a.ts");
    expect(notifyA.mock.calls[0][0]).not.toContain("src/session-b.ts");
    expect(notifyB.mock.calls[0][0]).toContain("src/session-b.ts");
    expect(notifyB.mock.calls[0][0]).not.toContain("src/session-a.ts");

    await emitAll(todos.handlers, "session_start", { reason: "new" }, ctx(cwd, "session-a"));

    expect(await runTodo(todos.tool, cwd, "session-a", { action: "list" })).toBe("No todos");
    expect(await runTodo(todos.tool, cwd, "session-b", { action: "list" })).toContain("session B task");
  });
});
