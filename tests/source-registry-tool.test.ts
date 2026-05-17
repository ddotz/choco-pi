import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import chocoAutopilot, { updateState } from "../extensions/choco-autopilot/index";

interface RegisteredTool {
  name: string;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    ctx: { cwd: string },
  ) => Promise<{ content: Array<{ type: string; text: string }>; details?: unknown }>;
}

interface RegisteredCommand {
  handler: (args: string, ctx: { cwd: string; ui: { notify: ReturnType<typeof vi.fn> } }) => Promise<void>;
}

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<void> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "choco-pi-source-tool-test-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
}

function registeredHarness(exec = vi.fn()): { tools: Map<string, RegisteredTool>; commands: Map<string, RegisteredCommand> } {
  const tools = new Map<string, RegisteredTool>();
  const commands = new Map<string, RegisteredCommand>();
  chocoAutopilot({
    on: vi.fn(),
    registerCommand: (name: string, definition: RegisteredCommand) => {
      commands.set(name, definition);
    },
    registerTool: (definition: RegisteredTool) => {
      tools.set(definition.name, definition);
    },
    sendUserMessage: vi.fn(),
    sendMessage: vi.fn(),
    exec,
    getFlag: vi.fn(),
  } as never);
  return { tools, commands };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForExec(exec: ReturnType<typeof vi.fn>): Promise<void> {
  for (let index = 0; index < 50; index += 1) {
    if (exec.mock.calls.length > 0) return;
    await sleep(10);
  }
  throw new Error("exec was not called");
}

function registeredTools(): Map<string, RegisteredTool> {
  return registeredHarness().tools;
}

describe("source registry tool", () => {
  it("registers a Pi-native LLM tool for autonomous source tracking", async () => {
    await useTempAgentDir();
    const tools = registeredTools();
    const tool = tools.get("source_registry");

    expect(tool).toBeDefined();
    await tool!.execute("1", {
      action: "add",
      url: "https://github.com/example/upstream-utility",
      rationale: "Candidate adoption source.",
    }, undefined, undefined, { cwd: "/repo" });

    await tool!.execute("2", {
      action: "watch",
      id: "github-example-upstream-utility",
      review: "Watch until license stabilizes.",
    }, undefined, undefined, { cwd: "/repo" });

    const result = await tool!.execute("3", { action: "list" }, undefined, undefined, { cwd: "/repo" });
    expect(result.content[0].text).toContain("github-example-upstream-utility");
    expect(result.content[0].text).toContain("[watching]");
  });

  it("records adoption depth through the source_registry tool", async () => {
    await useTempAgentDir();
    const tool = registeredTools().get("source_registry")!;

    await tool.execute("1", { action: "add", url: "https://github.com/example/upstream-utility" }, undefined, undefined, { cwd: "/repo" });
    await tool.execute("2", {
      action: "adopt",
      id: "github-example-upstream-utility",
      review: "Partially port the quality guard pattern.",
      adoptionDepth: "partial-port",
      adoptedItems: ["mode-scoped guard"],
      rejectedItems: ["whole runtime"],
      scopeRationale: "Use the pattern, not the package boundary.",
    }, undefined, undefined, { cwd: "/repo" });

    const result = await tool.execute("3", { action: "list" }, undefined, undefined, { cwd: "/repo" });
    expect(result.content[0].text).toContain("[adopted depth:partial-port]");
  });

  it("rejects source_registry status changes for unknown source ids", async () => {
    await useTempAgentDir();
    const tool = registeredTools().get("source_registry")!;

    await expect(tool.execute("1", {
      action: "watch",
      id: "github-example-missing",
      review: "Should not silently succeed.",
    }, undefined, undefined, { cwd: "/repo" })).rejects.toThrow("Unknown source id");
  });

  it("does not hold the choco state lock while external source checks are running", async () => {
    await useTempAgentDir();
    let releaseExec: ((value: { code: number; stdout: string; stderr: string }) => void) | undefined;
    const exec = vi.fn(() => new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
      releaseExec = resolve;
    }));
    const { tools } = registeredHarness(exec);
    const tool = tools.get("source_registry")!;
    await tool.execute("add", { action: "add", url: "https://github.com/example/upstream-utility" }, undefined, undefined, { cwd: "/repo" });

    const checkPromise = tool.execute("check", { action: "check", target: "all" }, undefined, undefined, { cwd: "/repo" });
    await waitForExec(exec);
    const updatePromise = updateState((state) => {
      state.memories.push({ id: "decision-test", kind: "decision", text: "state lock stayed free", createdAt: "2026-05-17T00:00:00.000Z" });
      return "updated";
    });

    await expect(Promise.race([updatePromise, sleep(150).then(() => "blocked")])).resolves.toBe("updated");
    releaseExec?.({ code: 0, stdout: "abc123\tHEAD\n", stderr: "" });
    await checkPromise;
  });

  it("reports unknown source ids through the /source command instead of claiming success", async () => {
    await useTempAgentDir();
    const { commands } = registeredHarness();
    const notify = vi.fn();

    await commands.get("source")!.handler("watch github-example-missing Should not silently succeed", {
      cwd: "/repo",
      ui: { notify },
    });

    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Unknown source id"), "error");
  });
});
