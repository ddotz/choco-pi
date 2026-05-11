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

function ctx(cwd: string): Record<string, unknown> {
  return {
    cwd,
    hasUI: false,
    ui: {
      setWidget: vi.fn(),
      notify: vi.fn(),
      input: vi.fn(),
      confirm: vi.fn(),
      custom: vi.fn(),
    },
  };
}

async function runTodo(tool: RegisteredTool, cwd: string, params: Record<string, unknown>): Promise<unknown> {
  return tool.execute("todo-call", params, undefined, vi.fn(), ctx(cwd));
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

    const state = JSON.parse(await readFile(join(cwd, ".pi", "todos.json"), "utf8")) as { nextId: number; todos: Array<{ id: number; text: string }> };
    expect(state.nextId).toBe(4);
    expect(state.todos.map((todo) => [todo.id, todo.text])).toEqual([
      [1, "first"],
      [2, "second"],
      [3, "third"],
    ]);
  });

  it("clears persisted todos when a new session starts", async () => {
    const cwd = await makeTempCwd();
    const todoPath = join(cwd, ".pi", "todos.json");
    await mkdir(join(cwd, ".pi"), { recursive: true });
    await writeFile(
      todoPath,
      `${JSON.stringify({
        version: 1,
        nextId: 2,
        todos: [{ id: 1, text: "stale", status: "done", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
      })}\n`,
      "utf8",
    );

    const { handlers } = setupTodoWidget();
    await emit(handlers, "session_start", { reason: "new" }, ctx(cwd));

    const state = JSON.parse(await readFile(todoPath, "utf8")) as { nextId: number; todos: unknown[] };
    expect(state).toMatchObject({ nextId: 1, todos: [] });
  });
});
