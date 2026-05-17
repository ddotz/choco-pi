import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import chocoAutopilot, { loadState } from "../extensions/choco-autopilot/index";
import { autonomyProtocolKey } from "../extensions/choco-autopilot/autonomy-protocol";

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown | Promise<unknown>;

interface RegisteredTool {
  name: string;
  execute: (...args: any[]) => Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }>;
}

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<string> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "choco-pi-finalization-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
  return tempAgentDir;
}

function setupAutopilot(): { handlers: Map<string, EventHandler[]>; tools: Map<string, RegisteredTool> } {
  const handlers = new Map<string, EventHandler[]>();
  const tools = new Map<string, RegisteredTool>();
  chocoAutopilot({
    on: (event: string, handler: EventHandler) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
    registerTool: (tool: RegisteredTool) => tools.set(tool.name, tool),
    registerCommand: vi.fn(),
    exec: vi.fn(),
    getFlag: vi.fn(),
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
  } as never);
  return { handlers, tools };
}

function ctx(cwd: string): Record<string, unknown> {
  return { cwd, hasUI: false, ui: {}, sessionManager: { getSessionId: () => "s1" } };
}

async function emitAll(handlers: Map<string, EventHandler[]>, eventName: string, event: Record<string, unknown>, cwd: string): Promise<void> {
  for (const handler of handlers.get(eventName) ?? []) await handler(event, ctx(cwd));
}

const completeReview = {
  acceptanceFit: "Requested work is complete and matched to the latest prompt.",
  runtimeFit: "Runtime behavior is represented by tests and tool state.",
  failureModes: "No critical in-scope failure remains after verification.",
  verificationEvidence: "Observable verification passed.",
  loopGovernance: "Step transitions stayed plan-first with no silent scope expansion.",
  completionBoundary: "Safe to stop after requested outcome is satisfied.",
  confidence: "High",
  readyToComplete: true,
};

describe("autonomy protocol finalization", () => {
  it("allows micro-coding completion without spec_gate and finalizes after structural_gate passes", async () => {
    const cwd = await useTempAgentDir();
    const { handlers, tools } = setupAutopilot();

    await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt: "README 오타 하나 고쳐줘", systemPrompt: "base" }, cwd);
    const gate = await tools.get("structural_gate")!.execute("gate-1", completeReview, undefined, undefined, ctx(cwd));
    await emitAll(handlers, "tool_result", { type: "tool_result", toolName: "structural_gate", details: gate.details }, cwd);
    const protocol = (await loadState()).autonomyProtocols[autonomyProtocolKey(cwd, "s1")];

    expect(gate.details).toMatchObject({ ok: true });
    expect(protocol.kind).toBe("micro-coding");
    expect(protocol.satisfiedTools).toContain("structural_gate");
    expect(protocol.taskStatus).toBe("completed");
    expect(protocol.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
