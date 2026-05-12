import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import ddotzAutopilot from "../extensions/ddotz-autopilot/index";

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
  tempAgentDir = await mkdtemp(join(tmpdir(), "ddotz-pi-auto-update-test-"));
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

  ddotzAutopilot({
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
    if (key === "git status --porcelain") return { code: 0, stdout: " M extensions/ddotz-autopilot/index.ts\n" };
    throw new Error(`Unexpected exec: ${key}`);
  });
}

function successfulUpdateExec(changedFiles = "extensions/ddotz-autopilot/index.ts\n"): ExecMock {
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

describe("ddotz-pi auto update", () => {
  it("registers /update and fast-forwards a clean ddotz-pi checkout before reloading", async () => {
    await useTempAgentDir();
    const exec = successfulUpdateExec("package.json\npnpm-lock.yaml\nextensions/ddotz-autopilot/index.ts\n");
    const { commands } = setupAutopilot(exec);
    const waitForIdle = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn();

    expect(commands.has("update")).toBe(true);

    await commands.get("update")!.handler("", { cwd: "/repo", waitForIdle, reload, ui: { notify } });

    const execKeys = exec.mock.calls.map(([command, args]) => `${command} ${args.join(" ")}`);
    expect(execKeys).toContain("git pull --ff-only");
    expect(execKeys).toContain("pnpm install --frozen-lockfile");
    expect(execKeys).toContain("pnpm run check");
    expect(execKeys).not.toContain("pnpm run version:check");
    expect(waitForIdle).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("ddotz-pi updated: abc1234 -> def5678"), "info");
  });

  it("reports local-change update skips as neutral info, not warnings", async () => {
    await useTempAgentDir();
    const exec = dirtyCheckoutExec();
    const { commands } = setupAutopilot(exec);
    const reload = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn();

    await commands.get("update")!.handler("", { cwd: "/repo", waitForIdle: vi.fn(), reload, ui: { notify } });

    expect(reload).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("ddotz-pi update skipped: local changes are present; leaving checkout unchanged.", "info");
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
    expect(notify).toHaveBeenCalledWith("ddotz-pi auto-update skipped: local changes are present; leaving checkout unchanged.", "info");
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
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Auto-updated ddotz-pi: abc1234 -> def5678"), "info");

    const state = JSON.parse(await readFile(join(agentDir, "ddotz-pi", "state.json"), "utf8")) as { autoUpdate?: { lastCheckedAt?: string; lastResult?: { status?: string } } };
    expect(state.autoUpdate?.lastCheckedAt).toBeTruthy();
    expect(state.autoUpdate?.lastResult?.status).toBe("updated");
  });
});
