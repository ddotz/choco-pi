import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import ddotzAutopilot from "../extensions/ddotz-autopilot/index";

interface RegisteredTool {
  name: string;
  execute: (...args: any[]) => Promise<{ content: Array<{ type: "text"; text: string }>; details?: unknown }>;
}

interface RegisteredCommand {
  handler: (args: string, ctx: {
    waitForIdle: ReturnType<typeof vi.fn>;
    reload: ReturnType<typeof vi.fn>;
    ui: { notify: ReturnType<typeof vi.fn> };
  }) => Promise<void>;
}

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => void | Promise<void>;

function setupAutopilot(options: { exec?: ReturnType<typeof vi.fn> } = {}): {
  tools: Map<string, RegisteredTool>;
  commands: Map<string, RegisteredCommand>;
  handlers: Map<string, EventHandler[]>;
  sendUserMessage: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
} {
  const tools = new Map<string, RegisteredTool>();
  const commands = new Map<string, RegisteredCommand>();
  const handlers = new Map<string, EventHandler[]>();
  const sendUserMessage = vi.fn();
  const exec = options.exec ?? vi.fn();

  ddotzAutopilot({
    on: (event: string, handler: EventHandler) => {
      const existing = handlers.get(event) ?? [];
      existing.push(handler);
      handlers.set(event, existing);
    },
    registerTool: (tool: RegisteredTool) => {
      tools.set(tool.name, tool);
    },
    registerCommand: (name: string, definition: RegisteredCommand) => {
      commands.set(name, definition);
    },
    sendUserMessage,
    sendMessage: vi.fn(),
    exec,
    getFlag: vi.fn(),
  } as never);

  return { tools, commands, handlers, sendUserMessage, exec };
}

async function emit(
  handlers: Map<string, EventHandler[]>,
  eventName: string,
  event: Record<string, unknown>,
  ctx: Record<string, unknown>,
): Promise<void> {
  for (const handler of handlers.get(eventName) ?? []) await handler(event, ctx);
}

async function withTempAgentDir<T>(fn: (agentDir: string) => Promise<T>): Promise<T> {
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const agentDir = await mkdtemp(join(tmpdir(), "ddotz-pi-runtime-reload-"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    return await fn(agentDir);
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    await rm(agentDir, { recursive: true, force: true });
  }
}

function reloadResumeMarkerPath(agentDir: string): string {
  return join(agentDir, "ddotz-pi", "reload-runtime-resume.json");
}

describe("runtime reload", () => {
  it("registers a reload_runtime tool that reloads directly when Pi exposes reload on the tool context", async () => {
    const { tools } = setupAutopilot();
    const reload = vi.fn().mockResolvedValue(undefined);

    expect(tools.has("reload_runtime")).toBe(true);

    const result = await tools.get("reload_runtime")!.execute("reload-1", {}, undefined, undefined, { cwd: "/repo", reload });

    expect(reload).toHaveBeenCalledTimes(1);
    expect(result.details).toMatchObject({ mode: "direct", reloaded: true });
  });

  it("submits reload-runtime through tmux with a real submit key and waits for command acknowledgement", async () => {
    await withTempAgentDir(async (agentDir) => {
      const previousPane = process.env.TMUX_PANE;
      process.env.TMUX_PANE = "%7";
      const exec = vi.fn().mockResolvedValue({ code: 0, stdout: "", stderr: "" });
      const { tools, sendUserMessage } = setupAutopilot({ exec });
      const setEditorText = vi.fn();
      const notify = vi.fn();

      try {
        const result = await tools.get("reload_runtime")!.execute(
          "reload-1",
          {},
          undefined,
          undefined,
          { cwd: "/repo", hasUI: true, ui: { setEditorText, notify } },
        );

        expect(setEditorText).not.toHaveBeenCalled();
        expect(exec).toHaveBeenCalledWith(
          "tmux",
          [
            "run-shell",
            "-b",
            expect.stringContaining("tmux send-keys -t '%7' -l '/reload-runtime --continue'"),
          ],
          expect.objectContaining({ timeout: 2000 }),
        );
        const tmuxScript = exec.mock.calls[0][1][2] as string;
        const markerPath = reloadResumeMarkerPath(agentDir);
        expect(tmuxScript).toContain(`rm -f '${markerPath}'`);
        expect(tmuxScript).toContain("submitted=0");
        expect(tmuxScript).toContain("sleep 1");
        expect(tmuxScript).toContain("tmux send-keys -t '%7' C-u");
        expect(tmuxScript).toContain("tmux send-keys -t '%7' Escape");
        expect(tmuxScript).toContain("tmux send-keys -t '%7' Enter");
        expect(tmuxScript.indexOf("tmux send-keys -t '%7' -l '/reload-runtime --continue'")).toBeLessThan(tmuxScript.indexOf("tmux send-keys -t '%7' Escape"));
        expect(tmuxScript.indexOf("tmux send-keys -t '%7' Escape")).toBeLessThan(tmuxScript.indexOf("tmux send-keys -t '%7' Enter"));
        expect(tmuxScript).not.toContain("tmux send-keys -t '%7' C-m");
        expect(tmuxScript).toContain(`if [ -f '${markerPath}' ]; then submitted=1; break 2; fi`);
        expect(tmuxScript).not.toContain("capture-pane");
        expect(tmuxScript).not.toContain("Reloaded keybindings, extensions, skills, prompts, themes");
        expect(tmuxScript).not.toContain("tmux send-keys -t '%7' C-u 'continue'");
        expect(sendUserMessage).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith(expect.stringContaining("post-reload continue"), "info");
        expect(result.details).toMatchObject({ mode: "tmux-self-input", reloaded: false, submitted: true, resumeQueued: true });
      } finally {
        if (previousPane === undefined) delete process.env.TMUX_PANE;
        else process.env.TMUX_PANE = previousPane;
      }
    });
  });

  it("falls back to editor prefill with the resume flag when tmux self-input is unavailable", async () => {
    const previousPane = process.env.TMUX_PANE;
    delete process.env.TMUX_PANE;
    const { tools, sendUserMessage } = setupAutopilot();
    const setEditorText = vi.fn();
    const notify = vi.fn();

    try {
      const result = await tools.get("reload_runtime")!.execute(
        "reload-1",
        {},
        undefined,
        undefined,
        { cwd: "/repo", hasUI: true, ui: { setEditorText, notify } },
      );

      expect(sendUserMessage).not.toHaveBeenCalled();
      expect(setEditorText).toHaveBeenCalledWith("/reload-runtime --continue");
      expect(notify).toHaveBeenCalledWith(expect.stringContaining("Press Enter"), "warning");
      expect(result.details).toMatchObject({ mode: "editor-prefill", reloaded: false });
    } finally {
      if (previousPane === undefined) delete process.env.TMUX_PANE;
      else process.env.TMUX_PANE = previousPane;
    }
  });

  it("registers /reload-runtime command that waits for idle before reloading", async () => {
    const { commands } = setupAutopilot();
    const waitForIdle = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn().mockResolvedValue(undefined);

    expect(commands.has("reload-runtime")).toBe(true);

    await commands.get("reload-runtime")!.handler("", { waitForIdle, reload, ui: { notify: vi.fn() } });

    expect(waitForIdle).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(waitForIdle.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0]);
  });

  it("queues continue from the post-reload session_start event after a resume-marked reload", async () => {
    await withTempAgentDir(async (agentDir) => {
      const { commands, handlers, sendUserMessage } = setupAutopilot();
      const waitForIdle = vi.fn().mockResolvedValue(undefined);
      const reload = vi.fn().mockResolvedValue(undefined);

      await commands.get("reload-runtime")!.handler("--continue", { waitForIdle, reload, ui: { notify: vi.fn() } });

      const marker = JSON.parse(await readFile(reloadResumeMarkerPath(agentDir), "utf8")) as { command: string };
      expect(marker.command).toBe("/reload-runtime --continue");

      await emit(handlers, "session_start", { reason: "reload" }, { cwd: "/repo", hasUI: false });

      expect(sendUserMessage).toHaveBeenCalledWith("continue", { deliverAs: "followUp" });
      await expect(readFile(reloadResumeMarkerPath(agentDir), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    });
  });
});
