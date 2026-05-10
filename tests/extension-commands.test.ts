import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import ddotzAutopilot from "../extensions/ddotz-autopilot/index";

interface RegisteredCommand {
  handler: (args: string, ctx: { ui: { notify: ReturnType<typeof vi.fn> } }) => Promise<void>;
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

  it("shows mode status when /mode is invoked without argument text", async () => {
    await useTempAgentDir();
    const commands = registeredCommands();
    const notify = vi.fn();

    await commands.get("mode")!.handler("", { ui: { notify } });

    expect(notify).toHaveBeenCalledWith(expect.stringContaining("mode: default"), "info");
  });
});
