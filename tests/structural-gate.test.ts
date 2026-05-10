import type { AssistantMessage } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";
import ddotzAutopilot from "../extensions/ddotz-autopilot/index";

interface RegisteredTool {
  name: string;
  execute: (...args: any[]) => Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown; terminate?: boolean }>;
}

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown | Promise<unknown>;

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

function setupAutopilot(): {
  handlers: Map<string, EventHandler[]>;
  tools: Map<string, RegisteredTool>;
  sendMessage: ReturnType<typeof vi.fn>;
  sendUserMessage: ReturnType<typeof vi.fn>;
} {
  const handlers = new Map<string, EventHandler[]>();
  const tools = new Map<string, RegisteredTool>();
  const sendMessage = vi.fn();
  const sendUserMessage = vi.fn();

  ddotzAutopilot({
    on: (event: string, handler: EventHandler) => {
      const existing = handlers.get(event) ?? [];
      existing.push(handler);
      handlers.set(event, existing);
    },
    registerTool: (tool: RegisteredTool) => {
      tools.set(tool.name, tool);
    },
    registerCommand: vi.fn(),
    exec: vi.fn(),
    getFlag: vi.fn(),
    sendMessage,
    sendUserMessage,
  } as never);

  return { handlers, tools, sendMessage, sendUserMessage };
}

async function emitFirst(handlers: Map<string, EventHandler[]>, eventName: string, event: Record<string, unknown>): Promise<unknown> {
  const handler = handlers.get(eventName)?.[0];
  if (!handler) throw new Error(`missing handler: ${eventName}`);
  return handler(event, { cwd: "/repo", hasUI: false, ui: {} });
}

describe("structural gate guard", () => {
  it("registers a structural_gate tool", () => {
    const { tools } = setupAutopilot();
    expect(tools.has("structural_gate")).toBe(true);
  });

  it("fails closed internally without showing structural gate repair text to the user when structural_gate was skipped", async () => {
    const { handlers, sendMessage, sendUserMessage } = setupAutopilot();
    await emitFirst(handlers, "before_agent_start", { type: "before_agent_start", prompt: "버그 고치고 테스트까지 해줘", systemPrompt: "base", systemPromptOptions: {} });

    const original = assistantMessage("완료했습니다. 테스트도 통과했습니다.");
    const result = await emitFirst(handlers, "message_end", { type: "message_end", message: original }) as { message: AssistantMessage };

    const replacementText = (result.message.content[0] as { type: "text"; text: string }).text;
    expect(replacementText).toBe("");
    expect(replacementText).not.toContain("Structural gate blocked");
    expect(sendUserMessage).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        customType: "ddotz.structural_gate.repair",
        display: false,
        content: expect.stringContaining("structural_gate"),
      }),
      { deliverAs: "followUp", triggerTurn: true },
    );
  });

  it("allows a non-trivial final answer after structural_gate passes", async () => {
    const { handlers, tools } = setupAutopilot();
    await emitFirst(handlers, "before_agent_start", { type: "before_agent_start", prompt: "기능 구현하고 검증해줘", systemPrompt: "base", systemPromptOptions: {} });

    await tools.get("structural_gate")!.execute(
      "gate-1",
      {
        acceptanceFit: "User asked for implementation and verification; both are addressed.",
        runtimeFit: "Tests cover the changed behavior and runtime caveat is noted.",
        failureModes: "Remaining extension reload risk is documented.",
        verificationEvidence: "pnpm run test passed.",
        completionBoundary: "Requested outcome satisfied with no critical in-scope issue left.",
        confidence: "High",
        readyToComplete: true,
      },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    const original = assistantMessage("완료했습니다.\n\nConfidence: High");
    const result = await emitFirst(handlers, "message_end", { type: "message_end", message: original });

    expect(result).toBeUndefined();
  });

  it("requires the gate if a tool call happened even when the prompt looked trivial", async () => {
    const { handlers } = setupAutopilot();
    await emitFirst(handlers, "before_agent_start", { type: "before_agent_start", prompt: "확인", systemPrompt: "base", systemPromptOptions: {} });
    await emitFirst(handlers, "tool_call", { type: "tool_call", toolCallId: "bash-1", toolName: "bash", input: { command: "pnpm test" } });

    const result = await emitFirst(handlers, "message_end", { type: "message_end", message: assistantMessage("통과했습니다.") }) as { message: AssistantMessage };
    const replacementText = (result.message.content[0] as { type: "text"; text: string }).text;
    expect(replacementText).toBe("");
  });
});
