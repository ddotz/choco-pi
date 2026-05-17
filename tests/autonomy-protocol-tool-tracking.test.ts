import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import chocoAutopilot, { loadState } from "../extensions/choco-autopilot/index";
import { autonomyProtocolKey } from "../extensions/choco-autopilot/autonomy-protocol";

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown | Promise<unknown>;

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<string> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "choco-pi-autonomy-tracking-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
  return tempAgentDir;
}

function setupAutopilot(): { handlers: Map<string, EventHandler[]> } {
  const handlers = new Map<string, EventHandler[]>();
  chocoAutopilot({
    on: (event: string, handler: EventHandler) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
    exec: vi.fn(),
    getFlag: vi.fn(),
  } as never);
  return { handlers };
}

function ctx(cwd: string): Record<string, unknown> {
  return { cwd, hasUI: false, ui: {}, sessionManager: { getSessionId: () => "s1" } };
}

async function emitAll(handlers: Map<string, EventHandler[]>, eventName: string, event: Record<string, unknown>, cwd: string): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const handler of handlers.get(eventName) ?? []) results.push(await handler(event, ctx(cwd)));
  return results;
}

async function protocolFor(cwd: string) {
  const state = await loadState();
  return state.autonomyProtocols[autonomyProtocolKey(cwd, "s1")];
}

describe("autonomy protocol tool satisfaction tracking", () => {
  it("creates protocol on before_agent_start and satisfies branch_switch_guard from successful tool_result", async () => {
    const cwd = await useTempAgentDir();
    const { handlers } = setupAutopilot();

    await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt: "feature/foo 브랜치에서 고쳐줘", systemPrompt: "base" }, cwd);
    await emitAll(handlers, "tool_result", {
      type: "tool_result",
      toolCallId: "branch-1",
      toolName: "branch_switch_guard",
      details: { result: { ok: true, action: "switched" } },
      content: [{ type: "text", text: "branch_switch_guard: switched" }],
    }, cwd);

    const protocol = await protocolFor(cwd);
    expect(protocol.kind).toBe("single-branch");
    expect(protocol.satisfiedTools).toContain("branch_switch_guard");
    expect(protocol.blockedTools).toEqual([]);
  });

  it("records blocked required tools from failed tool_result", async () => {
    const cwd = await useTempAgentDir();
    const { handlers } = setupAutopilot();

    await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt: "feature/foo 브랜치에서 고쳐줘", systemPrompt: "base" }, cwd);
    await emitAll(handlers, "tool_result", {
      type: "tool_result",
      toolCallId: "branch-1",
      toolName: "branch_switch_guard",
      details: { result: { ok: false, blockers: ["dirty cwd"] } },
      isError: false,
    }, cwd);

    const protocol = await protocolFor(cwd);
    expect(protocol.satisfiedTools).not.toContain("branch_switch_guard");
    expect(protocol.blockedTools).toContainEqual(expect.objectContaining({ toolName: "branch_switch_guard", reason: expect.stringContaining("dirty cwd") }));
  });

  it("does not count integration_verifier dry-run as satisfied but accepts passed integration", async () => {
    const cwd = await useTempAgentDir();
    const { handlers } = setupAutopilot();

    await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt: "병렬로 나눠서 구현해줘", systemPrompt: "base" }, cwd);
    await emitAll(handlers, "tool_result", {
      type: "tool_result",
      toolName: "integration_verifier",
      details: { result: { ok: true, status: "dry-run" } },
    }, cwd);
    expect((await protocolFor(cwd)).satisfiedTools).not.toContain("integration_verifier");

    await emitAll(handlers, "tool_result", {
      type: "tool_result",
      toolName: "integration_verifier",
      details: { result: { ok: true, status: "passed" } },
    }, cwd);
    expect((await protocolFor(cwd)).satisfiedTools).toContain("integration_verifier");
  });

  it("ignores unknown tools for protocol satisfaction", async () => {
    const cwd = await useTempAgentDir();
    const { handlers } = setupAutopilot();

    await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt: "feature/foo 브랜치에서 고쳐줘", systemPrompt: "base" }, cwd);
    await emitAll(handlers, "tool_result", { type: "tool_result", toolName: "grep", details: { ok: true } }, cwd);

    const protocol = await protocolFor(cwd);
    expect(protocol.satisfiedTools).toEqual([]);
    expect(protocol.blockedTools).toEqual([]);
  });
});
