import { describe, expect, it, vi } from "vitest";
import ddotzAutopilot from "../extensions/ddotz-autopilot/index";

interface RegisteredTool {
  name: string;
  execute: (...args: any[]) => Promise<{ content: Array<{ type: "text"; text: string }>; details?: unknown }>;
}

interface RegisteredCommand {
  handler: (args: string, ctx: { reload: ReturnType<typeof vi.fn>; ui: { notify: ReturnType<typeof vi.fn> } }) => Promise<void>;
}

function setupAutopilot(): {
  tools: Map<string, RegisteredTool>;
  commands: Map<string, RegisteredCommand>;
  sendUserMessage: ReturnType<typeof vi.fn>;
} {
  const tools = new Map<string, RegisteredTool>();
  const commands = new Map<string, RegisteredCommand>();
  const sendUserMessage = vi.fn();

  ddotzAutopilot({
    on: vi.fn(),
    registerTool: (tool: RegisteredTool) => {
      tools.set(tool.name, tool);
    },
    registerCommand: (name: string, definition: RegisteredCommand) => {
      commands.set(name, definition);
    },
    sendUserMessage,
    sendMessage: vi.fn(),
    exec: vi.fn(),
    getFlag: vi.fn(),
  } as never);

  return { tools, commands, sendUserMessage };
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

  it("falls back to editor prefill instead of pretending sendUserMessage can execute slash commands", async () => {
    const { tools, sendUserMessage } = setupAutopilot();
    const setEditorText = vi.fn();
    const notify = vi.fn();

    const result = await tools.get("reload_runtime")!.execute(
      "reload-1",
      {},
      undefined,
      undefined,
      { cwd: "/repo", hasUI: true, ui: { setEditorText, notify } },
    );

    expect(sendUserMessage).not.toHaveBeenCalled();
    expect(setEditorText).toHaveBeenCalledWith("/reload-runtime");
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Press Enter"), "warning");
    expect(result.details).toMatchObject({ mode: "editor-prefill", reloaded: false });
  });

  it("registers /reload-runtime command that calls ctx.reload without starting a new session", async () => {
    const { commands } = setupAutopilot();
    const reload = vi.fn().mockResolvedValue(undefined);

    expect(commands.has("reload-runtime")).toBe(true);

    await commands.get("reload-runtime")!.handler("", { reload, ui: { notify: vi.fn() } });

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
