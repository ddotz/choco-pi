import type { AssistantMessage } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { runGuardPipeline } from "../extensions/choco-autopilot/guard-orchestrator";

function assistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "test-model",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop",
    timestamp: 1,
  };
}

describe("guard orchestrator", () => {
  it("queues only the first blocking guard repair and does not run later guards", () => {
    const message = assistantMessage("완료했습니다.");
    const secondGuard = vi.fn(() => ({ followUp: "second repair" }));

    const result = runGuardPipeline(message, [
      {
        customType: "choco.first.repair",
        run: () => ({
          message: { ...message, content: [{ type: "text", text: "blocked" }] },
          followUp: "first repair",
        }),
      },
      {
        customType: "choco.second.repair",
        run: secondGuard,
      },
    ]);

    expect(result.message?.content).toEqual([{ type: "text", text: "blocked" }]);
    expect(result.repairs).toEqual([{ customType: "choco.first.repair", content: "first repair" }]);
    expect(secondGuard).not.toHaveBeenCalled();
  });

  it("continues through non-blocking guards and queues their repair prompts", () => {
    const message = assistantMessage("보강 필요");

    const result = runGuardPipeline(message, [
      {
        customType: "choco.first.repair",
        run: () => ({ followUp: "first repair" }),
      },
      {
        customType: "choco.second.repair",
        run: () => ({ followUp: "second repair" }),
      },
    ]);

    expect(result.message).toBeUndefined();
    expect(result.repairs).toEqual([
      { customType: "choco.first.repair", content: "first repair" },
      { customType: "choco.second.repair", content: "second repair" },
    ]);
  });
});
