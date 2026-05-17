import type { AssistantMessage } from "@mariozechner/pi-ai";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentRunManifest, updateAgentLaneStatus } from "../extensions/choco-autopilot/agent-run-manifest";
import chocoAutopilot from "../extensions/choco-autopilot/index";
import { planParallelWorkAreas } from "../extensions/choco-autopilot/worktree-planner";

interface RegisteredTool {
  name: string;
  execute: (...args: any[]) => Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }>;
}

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown | Promise<unknown>;

let repoRoot: string | undefined;

afterEach(async () => {
  if (repoRoot) await rm(repoRoot, { recursive: true, force: true });
  repoRoot = undefined;
});

async function tempRepoRoot(): Promise<string> {
  repoRoot = await mkdtemp(join(tmpdir(), "choco-pi-structural-integration-"));
  return repoRoot;
}

function assistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "test-model",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function setupAutopilot(): { handlers: Map<string, EventHandler[]>; tools: Map<string, RegisteredTool>; sendMessage: ReturnType<typeof vi.fn> } {
  const handlers = new Map<string, EventHandler[]>();
  const tools = new Map<string, RegisteredTool>();
  const sendMessage = vi.fn();
  chocoAutopilot({
    on: (event: string, handler: EventHandler) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
    registerTool: (tool: RegisteredTool) => tools.set(tool.name, tool),
    registerCommand: vi.fn(),
    exec: vi.fn(),
    getFlag: vi.fn(),
    sendMessage,
    sendUserMessage: vi.fn(),
  } as never);
  return { handlers, tools, sendMessage };
}

async function emitFirst(handlers: Map<string, EventHandler[]>, eventName: string, event: Record<string, unknown>, cwd: string): Promise<unknown> {
  const handler = handlers.get(eventName)?.[0];
  if (!handler) throw new Error(`missing handler: ${eventName}`);
  return handler(event, { cwd, hasUI: false, ui: {}, sessionManager: { getSessionId: () => "test-session" } });
}

describe("structural gate integration evidence", () => {
  it("blocks completion when an active parallel manifest lacks integration evidence", async () => {
    const root = await tempRepoRoot();
    const plan = planParallelWorkAreas({ items: [{ id: "a", description: "A", files: ["a.ts"] }, { id: "b", description: "B", files: ["b.ts"] }] });
    await createAgentRunManifest({ repoRoot: root, groupId: "group-a", baseRef: "main", plan });
    await updateAgentLaneStatus(root, "group-a", "lane-1", "running");
    await updateAgentLaneStatus(root, "group-a", "lane-1", "verified");
    await updateAgentLaneStatus(root, "group-a", "lane-2", "running");
    await updateAgentLaneStatus(root, "group-a", "lane-2", "verified");
    const { handlers, tools, sendMessage } = setupAutopilot();
    await emitFirst(handlers, "before_agent_start", { type: "before_agent_start", prompt: "병렬 구현 완료해", systemPrompt: "base", systemPromptOptions: {} }, root);

    const gateResult = await tools.get("structural_gate")!.execute("gate-1", {
      acceptanceFit: "Parallel work done.",
      runtimeFit: "Lane tests passed.",
      failureModes: "Integration may be missing.",
      verificationEvidence: "Lane-local tests passed.",
      loopGovernance: "Transitions stayed planned.",
      completionBoundary: "Ready to stop.",
      confidence: "High",
      readyToComplete: true,
    }, undefined, undefined, { cwd: root });

    expect(gateResult.details).toMatchObject({ ok: false, reason: expect.stringContaining("integration_verifier") });
    const result = await emitFirst(handlers, "message_end", { type: "message_end", message: assistantMessage("완료했습니다.") }, root) as { message: AssistantMessage };
    expect((result.message.content[0] as { type: "text"; text: string }).text).toBe("");
    expect(sendMessage).toHaveBeenCalled();
  });

  it("does not accept textual integration_verifier claims when the manifest lacks integration evidence", async () => {
    const root = await tempRepoRoot();
    const plan = planParallelWorkAreas({ items: [{ id: "a", description: "A", files: ["a.ts"] }, { id: "b", description: "B", files: ["b.ts"] }] });
    await createAgentRunManifest({ repoRoot: root, groupId: "group-a", baseRef: "main", plan });
    await updateAgentLaneStatus(root, "group-a", "lane-1", "running");
    await updateAgentLaneStatus(root, "group-a", "lane-1", "verified");
    await updateAgentLaneStatus(root, "group-a", "lane-2", "running");
    await updateAgentLaneStatus(root, "group-a", "lane-2", "verified");
    const { handlers, tools } = setupAutopilot();
    await emitFirst(handlers, "before_agent_start", { type: "before_agent_start", prompt: "병렬 구현 완료해", systemPrompt: "base", systemPromptOptions: {} }, root);

    const gateResult = await tools.get("structural_gate")!.execute("gate-1", {
      acceptanceFit: "Parallel work done.",
      runtimeFit: "Lane tests passed.",
      failureModes: "Integration may be missing.",
      verificationEvidence: "integration_verifier passed according to text only.",
      loopGovernance: "Transitions stayed planned.",
      completionBoundary: "Ready to stop.",
      confidence: "High",
      readyToComplete: true,
    }, undefined, undefined, { cwd: root });

    expect(gateResult.details).toMatchObject({ ok: false, reason: expect.stringContaining("integration_verifier") });
  });
});
