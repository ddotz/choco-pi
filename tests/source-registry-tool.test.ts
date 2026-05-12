import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import chocoAutopilot from "../extensions/choco-autopilot/index";

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

function registeredTools(): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  chocoAutopilot({
    on: vi.fn(),
    registerCommand: vi.fn(),
    registerTool: (definition: RegisteredTool) => {
      tools.set(definition.name, definition);
    },
    sendUserMessage: vi.fn(),
    sendMessage: vi.fn(),
    exec: vi.fn(),
    getFlag: vi.fn(),
  } as never);
  return tools;
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
});
