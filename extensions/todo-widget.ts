import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { sessionIdFromContext, normalizeSessionId } from "./session-identity";
import { randomUUID } from "node:crypto";
import { Container, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Type } from "typebox";

type TodoStatus = "pending" | "in_progress" | "done" | "blocked";
type TodoAction = "list" | "add" | "set_status" | "update" | "remove" | "clear";
type TodoScope = "session" | "project";

interface TodoItem {
  id: number;
  text: string;
  status: TodoStatus;
  createdAt: string;
  updatedAt: string;
}

interface TodoState {
  version: 1;
  nextId: number;
  todos: TodoItem[];
}

interface TodoDetails {
  action: TodoAction;
  state: TodoState;
  path: string;
  scope: TodoScope;
  sessionId: string;
  error?: string;
}

const TODO_STATUSES: TodoStatus[] = ["pending", "in_progress", "done", "blocked"];
const TODO_SCOPES: TodoScope[] = ["session", "project"];
const EMPTY_STATE: TodoState = { version: 1, nextId: 1, todos: [] };
const stateLocks = new Map<string, Promise<void>>();

const TodoParams = Type.Object({
  action: StringEnum(["list", "add", "set_status", "update", "remove", "clear"] as const),
  id: Type.Optional(Type.Number({ description: "Todo id for set_status, update, and remove" })),
  text: Type.Optional(Type.String({ description: "Todo text for add and update" })),
  status: Type.Optional(StringEnum(["pending", "in_progress", "done", "blocked"] as const)),
  scope: Type.Optional(StringEnum(["session", "project"] as const, { description: "Todo scope; session is isolated per Pi session, project is shared per cwd" })),
  force: Type.Optional(Type.Boolean({ description: "Destructive override for remove/clear. Only set true when the user explicitly requested deleting todos; never use it to reset a dependent new loop." })),
});

function cloneState(state: TodoState): TodoState {
  return {
    version: 1,
    nextId: state.nextId,
    todos: state.todos.map((todo) => ({ ...todo })),
  };
}

async function withStateLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const previous = stateLocks.get(path) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => current);
  stateLocks.set(path, queued);

  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (stateLocks.get(path) === queued) stateLocks.delete(path);
  }
}

function getTodoPath(cwd: string, sessionId: string | undefined = undefined, scope: TodoScope = "session"): string {
  if (scope === "project") return join(cwd, ".pi", "todos.json");
  return join(cwd, ".pi", "sessions", normalizeSessionId(sessionId), "todos.json");
}

function nowIso(): string {
  return new Date().toISOString();
}

function assertTodoState(value: unknown): TodoState {
  if (!value || typeof value !== "object") throw new Error("todos.json must contain an object");
  const raw = value as { version?: unknown; nextId?: unknown; todos?: unknown };
  if (raw.version !== 1) throw new Error("todos.json version must be 1");
  if (!Number.isInteger(raw.nextId) || Number(raw.nextId) < 1) throw new Error("todos.json nextId must be a positive integer");
  if (!Array.isArray(raw.todos)) throw new Error("todos.json todos must be an array");

  const todos = raw.todos.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`todos[${index}] must be an object`);
    const todo = item as Record<string, unknown>;
    if (!Number.isInteger(todo.id) || Number(todo.id) < 1) throw new Error(`todos[${index}].id must be a positive integer`);
    if (typeof todo.text !== "string" || todo.text.trim().length === 0) throw new Error(`todos[${index}].text must be non-empty`);
    if (!TODO_STATUSES.includes(todo.status as TodoStatus)) throw new Error(`todos[${index}].status is invalid`);
    if (typeof todo.createdAt !== "string") throw new Error(`todos[${index}].createdAt must be a string`);
    if (typeof todo.updatedAt !== "string") throw new Error(`todos[${index}].updatedAt must be a string`);
    return {
      id: Number(todo.id),
      text: todo.text.trim(),
      status: todo.status as TodoStatus,
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt,
    };
  });

  return { version: 1, nextId: Number(raw.nextId), todos };
}

async function loadState(cwd: string, sessionId: string | undefined = undefined, scope: TodoScope = "session"): Promise<TodoState> {
  const path = getTodoPath(cwd, sessionId, scope);
  try {
    const content = await readFile(path, "utf8");
    return assertTodoState(JSON.parse(content));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return cloneState(EMPTY_STATE);
    if (error instanceof SyntaxError) throw new Error(`Malformed ${path}: ${error.message}`);
    throw error;
  }
}

async function saveState(cwd: string, sessionId: string, scope: TodoScope, state: TodoState): Promise<void> {
  const path = getTodoPath(cwd, sessionId, scope);
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(tmpPath, path);
}

function findTodo(state: TodoState, id: number): TodoItem {
  const todo = state.todos.find((item) => item.id === id);
  if (!todo) throw new Error(`Todo #${id} not found`);
  return todo;
}

function addTodo(state: TodoState, text: string): TodoState {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Todo text must not be empty");
  const timestamp = nowIso();
  const next = cloneState(state);
  next.todos.push({ id: next.nextId, text: trimmed, status: "pending", createdAt: timestamp, updatedAt: timestamp });
  next.nextId += 1;
  return next;
}

function setTodoStatus(state: TodoState, id: number, status: TodoStatus): TodoState {
  const next = cloneState(state);
  const todo = findTodo(next, id);
  todo.status = status;
  todo.updatedAt = nowIso();
  return next;
}

function updateTodoText(state: TodoState, id: number, text: string): TodoState {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Todo text must not be empty");
  const next = cloneState(state);
  const todo = findTodo(next, id);
  todo.text = trimmed;
  todo.updatedAt = nowIso();
  return next;
}

function isActiveTodo(todo: TodoItem): boolean {
  return todo.status !== "done";
}

function assertCanRemoveTodo(todo: TodoItem, force: boolean): void {
  if (!force && isActiveTodo(todo)) throw new Error(`Refusing to remove active todo #${todo.id}; mark it done first, or pass force=true only for explicit user-requested deletion.`);
}

function assertCanClearTodos(state: TodoState, force: boolean): void {
  const active = state.todos.filter(isActiveTodo);
  if (!force && active.length > 0) {
    throw new Error(`Refusing to clear active todos (${active.map((todo) => `#${todo.id}`).join(", ")}); finish or preserve them before starting dependent work.`);
  }
}

function removeTodo(state: TodoState, id: number, force = false): TodoState {
  const todo = findTodo(state, id);
  assertCanRemoveTodo(todo, force);
  const next = cloneState(state);
  next.todos = next.todos.filter((todo) => todo.id !== id);
  return next;
}

function clearTodos(): TodoState {
  return cloneState(EMPTY_STATE);
}

function statusIcon(status: TodoStatus): string {
  switch (status) {
    case "done":
      return "✓";
    case "in_progress":
      return "→";
    case "blocked":
      return "⚠";
    case "pending":
      return "○";
  }
}

function statusLabel(status: TodoStatus): string {
  switch (status) {
    case "done":
      return "done";
    case "in_progress":
      return "doing";
    case "blocked":
      return "blocked";
    case "pending":
      return "pending";
  }
}

function styleTodoLine(theme: Theme, todo: TodoItem): string {
  const icon = statusIcon(todo.status);
  const id = theme.fg("accent", `#${todo.id}`);
  const label = theme.fg("dim", `[${statusLabel(todo.status)}]`);
  const text = todo.status === "done" ? theme.fg("muted", todo.text) : theme.fg("text", todo.text);

  if (todo.status === "done") return `${theme.fg("success", icon)} ${id} ${text}`;
  if (todo.status === "in_progress") return `${theme.fg("accent", icon)} ${id} ${text}`;
  if (todo.status === "blocked") return `${theme.fg("warning", icon)} ${id} ${text}`;
  return `${theme.fg("dim", icon)} ${id} ${text} ${label}`;
}

function getVisibleTodos(state: TodoState): TodoItem[] {
  const active = state.todos.filter((todo) => todo.status === "in_progress" || todo.status === "blocked");
  const pending = state.todos.filter((todo) => todo.status === "pending");
  const done = state.todos.filter((todo) => todo.status === "done").slice(-2);
  return [...active, ...pending, ...done].slice(0, 6);
}

function renderTodoWidgetLines(state: TodoState, theme: Theme, error?: string): string[] {
  if (error) return [theme.fg("error", `todo: ${error}`)];
  if (state.todos.length === 0) return [theme.fg("dim", "todo: empty")];

  const done = state.todos.filter((todo) => todo.status === "done").length;
  const total = state.todos.length;
  const visibleTodos = getVisibleTodos(state);
  const lines = [`${theme.fg("accent", theme.bold("todo"))} ${theme.fg("muted", `${done}/${total} done`)}`];

  for (const todo of visibleTodos) lines.push(styleTodoLine(theme, todo));
  const hidden = total - visibleTodos.length;
  if (hidden > 0) lines.push(theme.fg("dim", `… ${hidden} hidden`));
  return lines;
}

function cycleStatus(status: TodoStatus): TodoStatus {
  const index = TODO_STATUSES.indexOf(status);
  return TODO_STATUSES[(index + 1) % TODO_STATUSES.length]!;
}

type TodoUiAction =
  | { type: "close" }
  | { type: "add" }
  | { type: "clear" }
  | { type: "toggle"; id: number }
  | { type: "edit"; id: number }
  | { type: "delete"; id: number };

class TodoListComponent {
  private selected = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private theme: Theme,
    private getState: () => TodoState,
    private done: (action: TodoUiAction) => void,
  ) {}

  handleInput(data: string): void {
    const todos = this.getState().todos;
    const selected = todos[this.selected];

    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) return this.done({ type: "close" });
    if (matchesKey(data, "up")) this.selected = Math.max(0, this.selected - 1);
    else if (matchesKey(data, "down")) this.selected = Math.min(Math.max(0, todos.length - 1), this.selected + 1);
    else if (matchesKey(data, "space") && selected) return this.done({ type: "toggle", id: selected.id });
    else if (data === "a") return this.done({ type: "add" });
    else if (data === "e" && selected) return this.done({ type: "edit", id: selected.id });
    else if (data === "d" && selected) return this.done({ type: "delete", id: selected.id });
    else if (data === "c") return this.done({ type: "clear" });

    this.invalidate();
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const state = this.getState();
    const th = this.theme;
    const lines: string[] = [];
    const done = state.todos.filter((todo) => todo.status === "done").length;
    const title = `${th.fg("accent", th.bold("todos"))} ${th.fg("muted", `${done}/${state.todos.length} done`)}`;
    lines.push(truncateToWidth(title, width));
    lines.push(truncateToWidth(th.fg("dim", "↑↓ select • space status • a add • e edit • d delete • c clear • esc close"), width));

    if (state.todos.length === 0) {
      lines.push(truncateToWidth(th.fg("dim", "empty"), width));
    } else {
      for (let index = 0; index < state.todos.length; index++) {
        const todo = state.todos[index]!;
        const prefix = index === this.selected ? th.fg("accent", "› ") : "  ";
        lines.push(truncateToWidth(prefix + styleTodoLine(th, todo), width));
      }
    }

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

export default function todoWidgetExtension(pi: ExtensionAPI) {
  let state: TodoState = cloneState(EMPTY_STATE);
  let lastError: string | undefined;
  const activeContexts = new Set<ExtensionContext>();
  const viewStates = new Map<string, { state: TodoState; lastError?: string }>();

  const viewKey = (ctx: ExtensionContext, scope: TodoScope = "session"): string => getTodoPath(ctx.cwd, sessionIdFromContext(ctx), scope);

  const refreshState = async (ctx: ExtensionContext, scope: TodoScope = "session"): Promise<void> => {
    try {
      state = await loadState(ctx.cwd, sessionIdFromContext(ctx), scope);
      lastError = undefined;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    viewStates.set(viewKey(ctx, scope), { state: cloneState(state), lastError });
  };

  const renderWidget = (ctx: ExtensionContext): void => {
    if (!ctx.hasUI) return;
    ctx.ui.setWidget(
      "todo-widget",
      (_tui, theme) => {
        return {
          render(width: number): string[] {
            const view = viewStates.get(viewKey(ctx)) ?? { state, lastError };
            return renderTodoWidgetLines(view.state, theme, view.lastError).map((line) => truncateToWidth(line, width));
          },
          invalidate() {},
        };
      },
      { placement: "aboveEditor" },
    );
  };

  const refreshAllWidgets = (): void => {
    for (const ctx of activeContexts) renderWidget(ctx);
  };

  const persist = async (ctx: ExtensionContext, next: TodoState, scope: TodoScope = "session"): Promise<void> => {
    await saveState(ctx.cwd, sessionIdFromContext(ctx), scope, next);
    state = next;
    lastError = undefined;
    viewStates.set(viewKey(ctx, scope), { state: cloneState(next) });
    refreshAllWidgets();
  };

  const requireId = (id: number | undefined): number => {
    if (!Number.isInteger(id) || Number(id) < 1) throw new Error("Todo id must be a positive integer");
    return Number(id);
  };

  const requireText = (text: string | undefined): string => {
    if (typeof text !== "string" || text.trim().length === 0) throw new Error("Todo text must not be empty");
    return text.trim();
  };

  const requireStatus = (status: TodoStatus | undefined): TodoStatus => {
    if (!status || !TODO_STATUSES.includes(status)) throw new Error("Todo status must be pending, in_progress, done, or blocked");
    return status;
  };

  const requireScope = (scope: TodoScope | undefined): TodoScope => {
    if (!scope) return "session";
    if (!TODO_SCOPES.includes(scope)) throw new Error("Todo scope must be session or project");
    return scope;
  };

  const withLoadedState = async <T>(ctx: ExtensionContext, scope: TodoScope, operation: () => Promise<T>): Promise<T> => {
    return withStateLock(getTodoPath(ctx.cwd, sessionIdFromContext(ctx), scope), async () => {
      await refreshState(ctx, scope);
      if (lastError) throw new Error(lastError);
      return operation();
    });
  };

  const toolDetails = (action: TodoAction, ctx: ExtensionContext, scope: TodoScope, snapshot: TodoState = state): TodoDetails => ({
    action,
    state: cloneState(snapshot),
    path: getTodoPath(ctx.cwd, sessionIdFromContext(ctx), scope),
    scope,
    sessionId: sessionIdFromContext(ctx),
  });

  pi.registerTool({
    name: "todo",
    label: "Todo",
    description: "Manage the session todo list stored at <cwd>/.pi/sessions/<sessionId>/todos.json by default, or the project-shared list with scope=project.",
    promptSnippet: "Manage the todo list: list, add, set_status, update, remove, or clear items. Default scope is session-isolated; use scope=project only for deliberate shared todos.",
    promptGuidelines: [
      "Use todo for problem-solving task lists when the user asks for planning, execution tracking, or completion review.",
      "Use todo set_status to keep items current as work progresses.",
      "Do not clear or remove active todos when newly discovered work starts; keep the parent todo in_progress/blocked, add the dependent work, then return to the preserved parent todo.",
      "Use force=true for remove/clear only when the user explicitly requested deleting todos; never use it to reset between dependent loops.",
      "Default todo scope is the current Pi session; use project scope only when shared todos are explicitly needed.",
    ],
    parameters: TodoParams,
    renderShell: "self",

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const scope = requireScope(params.scope as TodoScope | undefined);
      switch (params.action) {
        case "list": {
          const snapshot = await withLoadedState(ctx, scope, async () => cloneState(state));
          const lines = snapshot.todos.length
            ? snapshot.todos.map((todo) => `${statusIcon(todo.status)} #${todo.id} ${todo.text} [${todo.status}]`)
            : ["No todos"];
          return { content: [{ type: "text", text: lines.join("\n") }], details: toolDetails("list", ctx, scope, snapshot) };
        }
        case "add": {
          const text = requireText(params.text);
          const { added, next } = await withLoadedState(ctx, scope, async () => {
            const next = addTodo(state, text);
            await persist(ctx, next, scope);
            return { added: next.todos[next.todos.length - 1]!, next };
          });
          return { content: [{ type: "text", text: `Added #${added.id}: ${added.text}` }], details: toolDetails("add", ctx, scope, next) };
        }
        case "set_status": {
          const id = requireId(params.id);
          const status = requireStatus(params.status as TodoStatus | undefined);
          const next = await withLoadedState(ctx, scope, async () => {
            const next = setTodoStatus(state, id, status);
            await persist(ctx, next, scope);
            return next;
          });
          return { content: [{ type: "text", text: `Set #${id} to ${status}` }], details: toolDetails("set_status", ctx, scope, next) };
        }
        case "update": {
          const id = requireId(params.id);
          const text = requireText(params.text);
          const next = await withLoadedState(ctx, scope, async () => {
            const next = updateTodoText(state, id, text);
            await persist(ctx, next, scope);
            return next;
          });
          return { content: [{ type: "text", text: `Updated #${id}` }], details: toolDetails("update", ctx, scope, next) };
        }
        case "remove": {
          const id = requireId(params.id);
          const force = params.force === true;
          const next = await withLoadedState(ctx, scope, async () => {
            const next = removeTodo(state, id, force);
            await persist(ctx, next, scope);
            return next;
          });
          return { content: [{ type: "text", text: `Removed #${id}` }], details: toolDetails("remove", ctx, scope, next) };
        }
        case "clear": {
          const force = params.force === true;
          const { count, next } = await withLoadedState(ctx, scope, async () => {
            assertCanClearTodos(state, force);
            const count = state.todos.length;
            const next = clearTodos();
            await persist(ctx, next, scope);
            return { count, next };
          });
          return { content: [{ type: "text", text: `Cleared ${count} todos` }], details: toolDetails("clear", ctx, scope, next) };
        }
      }
    },

    renderCall() {
      return new Container();
    },

    renderResult() {
      return new Container();
    },
  });

  pi.registerCommand("todos", {
    description: "Open the current session todo list",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const scope: TodoScope = "session";
      await refreshState(ctx, scope);
      renderWidget(ctx);

      if (lastError) {
        ctx.ui.notify(lastError, "error");
        return;
      }

      if (!ctx.hasUI) {
        ctx.ui.notify("/todos requires interactive mode", "error");
        return;
      }

      while (true) {
        const action = await ctx.ui.custom<TodoUiAction>((_tui, theme, _keybindings, done) => {
          return new TodoListComponent(theme, () => state, done);
        });

        try {
          if (!action || action.type === "close") return;
          if (action.type === "toggle") {
            await withLoadedState(ctx, scope, async () => {
              const next = setTodoStatus(state, action.id, cycleStatus(findTodo(state, action.id).status));
              await persist(ctx, next, scope);
              return next;
            });
          } else if (action.type === "add") {
            const text = await ctx.ui.input("Add todo", "Describe the task");
            if (text) {
              await withLoadedState(ctx, scope, async () => {
                const next = addTodo(state, text);
                await persist(ctx, next, scope);
                return next;
              });
            }
          } else if (action.type === "edit") {
            const todo = await withLoadedState(ctx, scope, async () => ({ ...findTodo(state, action.id) }));
            const text = await ctx.ui.input("Edit todo", todo.text);
            if (text) {
              await withLoadedState(ctx, scope, async () => {
                const next = updateTodoText(state, action.id, text);
                await persist(ctx, next, scope);
                return next;
              });
            }
          } else if (action.type === "delete") {
            await withLoadedState(ctx, scope, async () => {
              const next = removeTodo(state, action.id);
              await persist(ctx, next, scope);
              return next;
            });
          } else if (action.type === "clear") {
            const confirmed = await ctx.ui.confirm("Clear todos", "Delete all session todos?");
            if (confirmed) {
              await withLoadedState(ctx, scope, async () => {
                const next = clearTodos();
                await persist(ctx, next, scope);
                return next;
              });
            }
          }
        } catch (error) {
          ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        }
      }
    },
  });

  pi.on("session_start", async (event, ctx) => {
    activeContexts.add(ctx);
    if (event.reason === "new") {
      try {
        await withStateLock(getTodoPath(ctx.cwd, sessionIdFromContext(ctx), "session"), async () => {
          await persist(ctx, clearTodos(), "session");
        });
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        viewStates.set(viewKey(ctx), { state: cloneState(state), lastError });
      }
    } else {
      await refreshState(ctx, "session");
    }
    renderWidget(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    activeContexts.delete(ctx);
    viewStates.delete(viewKey(ctx));
    if (ctx.hasUI) ctx.ui.setWidget("todo-widget", undefined);
  });

}
