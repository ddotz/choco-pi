import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import ddotzAutopilot from "../extensions/ddotz-autopilot/index";

interface RegisteredCommand {
  handler: (args: string, ctx: { ui: { notify: ReturnType<typeof vi.fn>; select?: ReturnType<typeof vi.fn> } }) => Promise<void>;
}

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<void> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "ddotz-pi-test-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
}

function registeredCommands(): Map<string, RegisteredCommand> {
  const commands = new Map<string, RegisteredCommand>();
  ddotzAutopilot({
    on: vi.fn(),
    registerCommand: (name: string, definition: RegisteredCommand) => {
      commands.set(name, definition);
    },
    registerTool: vi.fn(),
    sendUserMessage: vi.fn(),
    exec: vi.fn(),
    getFlag: vi.fn(),
  } as never);
  return commands;
}

describe("extension command names", () => {
  it("registers personal commands without the ddotz prefix", () => {
    const commands = registeredCommands();

    expect([...commands.keys()]).toEqual(expect.arrayContaining(["mode", "intensity", "source", "memory", "ledger"]));
    expect([...commands.keys()].filter((name) => name.startsWith("ddotz-"))).toEqual([]);
  });

  it("opens interactive mode selector when /mode is invoked without argument text", async () => {
    await useTempAgentDir();
    const commands = registeredCommands();
    const notify = vi.fn();

    const select = vi.fn().mockResolvedValue(undefined);

    await commands.get("mode")!.handler("", { ui: { notify, select } });

    expect(select).toHaveBeenCalledWith(
      expect.stringContaining("Current mode: default"),
      expect.arrayContaining([
        expect.stringContaining("default [implemented, current]"),
        expect.stringContaining("web-analysis [implemented]"),
        expect.stringContaining("adoption-analysis [implemented]"),
      ]),
    );
    expect(select.mock.calls[0][1].join("\n")).toContain("General autonomous PM/development-team behavior");
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Mode unchanged: default"), "info");
  });

  it("switches mode from the interactive /mode selector", async () => {
    await useTempAgentDir();
    const commands = registeredCommands();
    const notify = vi.fn();
    const select = vi.fn().mockResolvedValue("web-analysis [implemented] — Implemented mode for retrieval-first external web research, source confidence scoring, and critical review.");

    await commands.get("mode")!.handler("", { ui: { notify, select } });
    await commands.get("mode")!.handler("status", { ui: { notify, select } });

    expect(notify).toHaveBeenCalledWith("mode: web-analysis", "info");
    expect(notify).toHaveBeenLastCalledWith(expect.stringContaining("mode: web-analysis"), "info");
  });

  it("allows switching to implemented web-analysis mode without changing command names", async () => {
    await useTempAgentDir();
    const commands = registeredCommands();
    const notify = vi.fn();

    await commands.get("mode")!.handler("set web-analysis", { ui: { notify } });
    await commands.get("mode")!.handler("status", { ui: { notify } });

    expect(notify).toHaveBeenCalledWith(expect.stringContaining("mode: web-analysis"), "info");
    expect([...commands.keys()].filter((name) => name.startsWith("ddotz-"))).toEqual([]);
  });

  it("switches from web-analysis back to default without planned-mode warnings", async () => {
    await useTempAgentDir();
    const commands = registeredCommands();
    const notify = vi.fn();

    await commands.get("mode")!.handler("set web-analysis", { ui: { notify } });
    await commands.get("mode")!.handler("set default", { ui: { notify } });
    await commands.get("mode")!.handler("status", { ui: { notify } });

    expect(notify).toHaveBeenCalledWith("mode: web-analysis", "info");
    expect(notify).toHaveBeenCalledWith("mode: default", "info");
    expect(notify).toHaveBeenLastCalledWith(expect.stringContaining("mode: default"), "info");
    expect(notify.mock.calls.flat().join("\n")).not.toContain("planned but not implemented");
  });
});
