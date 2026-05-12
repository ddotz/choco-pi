import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import chocoAutopilot from "../extensions/choco-autopilot/index";

interface ExecResult {
  code: number;
  stdout: string;
  stderr?: string;
}

type ExecMock = ReturnType<typeof vi.fn<(...args: [string, string[], Record<string, unknown>?]) => Promise<ExecResult>>>;
type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown | Promise<unknown>;

interface RegisteredCommand {
  handler: (args: string, ctx: {
    cwd: string;
    waitForIdle: ReturnType<typeof vi.fn>;
    reload: ReturnType<typeof vi.fn>;
    ui: { notify: ReturnType<typeof vi.fn> };
  }) => Promise<void>;
}

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<string> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "choco-pi-auto-update-test-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
  return tempAgentDir;
}

function setupAutopilot(exec: ExecMock): {
  commands: Map<string, RegisteredCommand>;
  handlers: Map<string, EventHandler[]>;
  sendUserMessage: ReturnType<typeof vi.fn>;
} {
  const commands = new Map<string, RegisteredCommand>();
  const handlers = new Map<string, EventHandler[]>();
  const sendUserMessage = vi.fn();

  chocoAutopilot({
    on: (event: string, handler: EventHandler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerCommand: (name: string, definition: RegisteredCommand) => {
      commands.set(name, definition);
    },
    registerTool: vi.fn(),
    sendMessage: vi.fn(),
    sendUserMessage,
    exec,
    getFlag: vi.fn(),
  } as never);

  return { commands, handlers, sendUserMessage };
}

async function emitAll(handlers: Map<string, EventHandler[]>, eventName: string, event: Record<string, unknown>, ctx: Record<string, unknown>): Promise<void> {
  for (const handler of handlers.get(eventName) ?? []) await handler(event, ctx);
}

function dirtyCheckoutExec(): ExecMock {
  return vi.fn(async (command: string, args: string[]): Promise<ExecResult> => {
    const key = `${command} ${args.join(" ")}`;
    if (key === "git status --porcelain") return { code: 0, stdout: " M extensions/choco-autopilot/index.ts\n" };
    throw new Error(`Unexpected exec: ${key}`);
  });
}

function successfulPiAndDirtyLocalUpdateExec(): ExecMock {
  return vi.fn(async (command: string, args: string[]): Promise<ExecResult> => {
    const key = `${command} ${args.join(" ")}`;
    if (key === "pi update") return { code: 0, stdout: "pi updated\n" };
    if (key === "git status --porcelain") return { code: 0, stdout: " M extensions/choco-autopilot/index.ts\n" };
    throw new Error(`Unexpected exec: ${key}`);
  });
}

function failedPiUpdateExec(): ExecMock {
  return vi.fn(async (command: string, args: string[]): Promise<ExecResult> => {
    const key = `${command} ${args.join(" ")}`;
    if (key === "pi update") return { code: 1, stdout: "", stderr: "network unavailable\n" };
    throw new Error(`Unexpected exec: ${key}`);
  });
}

function successfulUpdateExec(changedFiles = "extensions/choco-autopilot/index.ts\n"): ExecMock {
  let shortHeadCalls = 0;
  return vi.fn(async (command: string, args: string[]): Promise<ExecResult> => {
    const key = `${command} ${args.join(" ")}`;
    if (key === "git status --porcelain") return { code: 0, stdout: "" };
    if (key === "git rev-parse --abbrev-ref --symbolic-full-name @{u}") return { code: 0, stdout: "origin/main\n" };
    if (key === "git rev-parse --short HEAD") return { code: 0, stdout: `${shortHeadCalls++ === 0 ? "abc1234" : "def5678"}\n` };
    if (key === "git fetch --prune --quiet") return { code: 0, stdout: "" };
    if (key === "git rev-list --left-right --count HEAD...@{u}") return { code: 0, stdout: "0\t2\n" };
    if (key === "git diff --name-only HEAD..@{u}") return { code: 0, stdout: changedFiles };
    if (key === "git pull --ff-only") return { code: 0, stdout: "Updating abc1234..def5678\n" };
    if (key === "pnpm install --frozen-lockfile") return { code: 0, stdout: "Lockfile is up to date\n" };
    if (key === "pnpm run check") return { code: 0, stdout: "version/lint/typecheck/test ok\n" };
    throw new Error(`Unexpected exec: ${key}`);
  });
}

function successfulPiAndLocalUpdateExec(changedFiles = "extensions/choco-autopilot/index.ts\n"): ExecMock {
  const localUpdateExec = successfulUpdateExec(changedFiles);
  return vi.fn(async (command: string, args: string[], options?: Record<string, unknown>): Promise<ExecResult> => {
    const key = `${command} ${args.join(" ")}`;
    if (key === "pi update") return { code: 0, stdout: "pi updated\n" };
    if (key === "pi update --self") return { code: 0, stdout: "pi self updated\n" };
    return localUpdateExec(command, args, options);
  });
}

describe("choco-pi auto update", () => {
  it("registers /update and runs canonical pi update before the local choco-pi checkout update", async () => {
    await useTempAgentDir();
    const exec = successfulPiAndLocalUpdateExec("package.json\npnpm-lock.yaml\nextensions/choco-autopilot/index.ts\n");
    const { commands } = setupAutopilot(exec);
    const waitForIdle = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn();

    expect(commands.has("update")).toBe(true);

    await commands.get("update")!.handler("", { cwd: "/repo", waitForIdle, reload, ui: { notify } });

    const execKeys = exec.mock.calls.map(([command, args]) => `${command} ${args.join(" ")}`);
    expect(execKeys[0]).toBe("pi update");
    expect(execKeys).toContain("git pull --ff-only");
    expect(execKeys).toContain("pnpm install --frozen-lockfile");
    expect(execKeys).toContain("pnpm run check");
    expect(execKeys).not.toContain("pnpm run version:check");
    expect(waitForIdle).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("choco-pi updated: abc1234 -> def5678"), "info");
  });

  it("forwards explicit pi update arguments instead of rejecting them as choco-pi subcommands", async () => {
    await useTempAgentDir();
    const exec = successfulPiAndLocalUpdateExec();
    const { commands } = setupAutopilot(exec);
    const waitForIdle = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn();

    await commands.get("update")!.handler("--self", { cwd: "/repo", waitForIdle, reload, ui: { notify } });

    const execKeys = exec.mock.calls.map(([command, args]) => `${command} ${args.join(" ")}`);
    expect(execKeys).toEqual(["pi update --self"]);
    expect(waitForIdle).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalledWith(expect.stringContaining("Usage:"), "error");
  });

  it("reports local-change update skips as neutral info after canonical pi update", async () => {
    await useTempAgentDir();
    const exec = successfulPiAndDirtyLocalUpdateExec();
    const { commands } = setupAutopilot(exec);
    const waitForIdle = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn();

    await commands.get("update")!.handler("", { cwd: "/repo", waitForIdle, reload, ui: { notify } });

    const execKeys = exec.mock.calls.map(([command, args]) => `${command} ${args.join(" ")}`);
    expect(execKeys[0]).toBe("pi update");
    expect(waitForIdle).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("choco-pi update skipped: local changes are present; leaving checkout unchanged.", "info");
  });

  it("stops before local update and reload when canonical pi update fails", async () => {
    await useTempAgentDir();
    const exec = failedPiUpdateExec();
    const { commands } = setupAutopilot(exec);
    const waitForIdle = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn();

    await commands.get("update")!.handler("", { cwd: "/repo", waitForIdle, reload, ui: { notify } });

    const execKeys = exec.mock.calls.map(([command, args]) => `${command} ${args.join(" ")}`);
    expect(execKeys).toEqual(["pi update"]);
    expect(waitForIdle).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("Failed pi update: network unavailable — exit 1.", "error");
  });

  it("does not warn when auto-update skips because local changes are present", async () => {
    await useTempAgentDir();
    const exec = dirtyCheckoutExec();
    const { handlers, sendUserMessage } = setupAutopilot(exec);
    const notify = vi.fn();

    await emitAll(handlers, "session_start", { reason: "startup" }, {
      cwd: "/repo",
      hasUI: true,
      ui: {
        notify,
        setStatus: vi.fn(),
        theme: { fg: (_name: string, text: string) => text },
      },
    });

    expect(sendUserMessage).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalledWith(expect.any(String), "warning");
    expect(notify).toHaveBeenCalledWith("choco-pi auto-update skipped: local changes are present; leaving checkout unchanged.", "info");
  });

  it("auto-updates on interactive startup when enabled and queues a runtime reload", async () => {
    const agentDir = await useTempAgentDir();
    const exec = successfulUpdateExec();
    const { handlers, sendUserMessage } = setupAutopilot(exec);
    const notify = vi.fn();

    await emitAll(handlers, "session_start", { reason: "startup" }, {
      cwd: "/repo",
      hasUI: true,
      ui: {
        notify,
        setStatus: vi.fn(),
        theme: { fg: (_name: string, text: string) => text },
      },
    });

    expect(sendUserMessage).toHaveBeenCalledWith("/reload-runtime", { deliverAs: "followUp" });
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Auto-updated choco-pi: abc1234 -> def5678"), "info");

    const state = JSON.parse(await readFile(join(agentDir, "choco-pi", "state.json"), "utf8")) as { autoUpdate?: { lastCheckedAt?: string; lastResult?: { status?: string } } };
    expect(state.autoUpdate?.lastCheckedAt).toBeTruthy();
    expect(state.autoUpdate?.lastResult?.status).toBe("updated");
  });
});
