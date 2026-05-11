import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import todoWidget from "../extensions/todo-widget";

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => void | Promise<void>;

interface RegisteredTool {
  execute: (toolCallId: string, params: Record<string, unknown>, signal: unknown, onUpdate: unknown, ctx: Record<string, unknown>) => Promise<unknown>;
}

let tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeTempCwd(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ddotz-pi-todos-"));
  tempDirs.push(dir);
  return dir;
}

function setupTodoWidget(): { handlers: Map<string, EventHandler[]>; tool: RegisteredTool } {
  const handlers = new Map<string, EventHandler[]>();
  let tool: RegisteredTool | undefined;

  todoWidget({
    on: (event: string, handler: EventHandler) => {
      const existing = handlers.get(event) ?? [];
      existing.push(handler);
      handlers.set(event, existing);
    },
    registerTool: (definition: RegisteredTool & { name: string }) => {
      if (definition.name === "todo") tool = definition;
    },
    registerCommand: vi.fn(),
  } as never);

  if (!tool) throw new Error("todo tool was not registered");
  return { handlers, tool };
}

async function emit(handlers: Map<string, EventHandler[]>, eventName: string, event: Record<string, unknown>, ctx: Record<string, unknown>): Promise<void> {
  for (const handler of handlers.get(eventName) ?? []) await handler(event, ctx);
}

function ctx(cwd: string, sessionId = "session-default"): Record<string, unknown> {
  return {
    cwd,
    hasUI: false,
    sessionManager: { getSessionId: () => sessionId },
    ui: {
      setWidget: vi.fn(),
      notify: vi.fn(),
      input: vi.fn(),
      confirm: vi.fn(),
      custom: vi.fn(),
    },
  };
}

async function runTodo(tool: RegisteredTool, cwd: string, params: Record<string, unknown>, sessionId = "session-default"): Promise<unknown> {
  return tool.execute("todo-call", params, undefined, vi.fn(), ctx(cwd, sessionId));
}

describe("todo widget persistence", () => {
  it("serializes concurrent todo writes so parallel adds do not corrupt or lose items", async () => {
    const cwd = await makeTempCwd();
    const { tool } = setupTodoWidget();
    vi.spyOn(Date, "now").mockReturnValue(1778466301539);

    await Promise.all([
      runTodo(tool, cwd, { action: "add", text: "first" }),
      runTodo(tool, cwd, { action: "add", text: "second" }),
      runTodo(tool, cwd, { action: "add", text: "third" }),
    ]);

    const state = JSON.parse(await readFile(join(cwd, ".pi", "sessions", "session-default", "todos.json"), "utf8")) as {
      nextId: number;
      todos: Array<{ id: number; text: string }>;
    };
    expect(state.nextId).toBe(4);
    expect(state.todos.map((todo) => [todo.id, todo.text])).toEqual([
      [1, "first"],
      [2, "second"],
      [3, "third"],
    ]);
  });

  it("keeps default todo lists isolated per Pi session in the same cwd", async () => {
    const cwd = await makeTempCwd();
    const { tool } = setupTodoWidget();

    await runTodo(tool, cwd, { action: "add", text: "alpha" }, "session-a");
    await runTodo(tool, cwd, { action: "add", text: "beta" }, "session-b");

    const sessionA = JSON.parse(await readFile(join(cwd, ".pi", "sessions", "session-a", "todos.json"), "utf8")) as { todos: Array<{ text: string }> };
    const sessionB = JSON.parse(await readFile(join(cwd, ".pi", "sessions", "session-b", "todos.json"), "utf8")) as { todos: Array<{ text: string }> };
    expect(sessionA.todos.map((todo) => todo.text)).toEqual(["alpha"]);
    expect(sessionB.todos.map((todo) => todo.text)).toEqual(["beta"]);
  });

  it("keeps an explicit project todo scope for deliberate shared lists", async () => {
    const cwd = await makeTempCwd();
    const { tool } = setupTodoWidget();

    await runTodo(tool, cwd, { action: "add", text: "shared", scope: "project" }, "session-a");

    const project = JSON.parse(await readFile(join(cwd, ".pi", "todos.json"), "utf8")) as { todos: Array<{ text: string }> };
    expect(project.todos.map((todo) => todo.text)).toEqual(["shared"]);
  });

  it("clears only the current session todos when a new session starts", async () => {
    const cwd = await makeTempCwd();
    const currentPath = join(cwd, ".pi", "sessions", "session-a", "todos.json");
    const otherPath = join(cwd, ".pi", "sessions", "session-b", "todos.json");
    const staleState = {
      version: 1,
      nextId: 2,
      todos: [{ id: 1, text: "stale", status: "done", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
    };
    await mkdir(join(cwd, ".pi", "sessions", "session-a"), { recursive: true });
    await mkdir(join(cwd, ".pi", "sessions", "session-b"), { recursive: true });
    await writeFile(currentPath, `${JSON.stringify(staleState)}\n`, "utf8");
    await writeFile(otherPath, `${JSON.stringify(staleState)}\n`, "utf8");

    const { handlers } = setupTodoWidget();
    await emit(handlers, "session_start", { reason: "new" }, ctx(cwd, "session-a"));

    const current = JSON.parse(await readFile(currentPath, "utf8")) as { nextId: number; todos: unknown[] };
    const other = JSON.parse(await readFile(otherPath, "utf8")) as { nextId: number; todos: unknown[] };
    expect(current).toMatchObject({ nextId: 1, todos: [] });
    expect(other.todos).toHaveLength(1);
  });
});
