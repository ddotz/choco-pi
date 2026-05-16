import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import chocoAutopilot from "../extensions/choco-autopilot/index";
import { evaluateWebResearchQuality, guardWebResearchQualityMessage } from "../extensions/choco-autopilot/web-research-quality";

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<void> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "choco-pi-web-quality-test-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
}


describe("web research quality guardrails", () => {
  it("bypasses non-web-analysis modes", () => {
    const result = evaluateWebResearchQuality("default", "짧은 일반 답변");
    expect(result.required).toBe(false);
    expect(result.passed).toBe(true);
  });

  it("flags web-analysis answers without provenance", () => {
    const result = evaluateWebResearchQuality("web-analysis", "Conclusion: 최신 정보입니다. Confidence: High");
    expect(result.required).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.issues).toContain("missing-evidence-or-provenance");
  });

  it("flags web-analysis answers without critical review", () => {
    const answer = [
      "Conclusion: A가 더 낫습니다.",
      "Evidence: https://example.com — published 2026-05-01 — full text.",
      "Confidence: High",
    ].join("\n");
    const result = evaluateWebResearchQuality("web-analysis", answer);
    expect(result.passed).toBe(false);
    expect(result.issues).toContain("missing-critical-review");
  });

  it("blocks High confidence when evidence is too thin", () => {
    const answer = [
      "Conclusion: A가 더 낫습니다.",
      "Evidence: https://example.com — published 2026-05-01 — full text.",
      "Critical review: caveat checked; conflict not found.",
      "Confidence: High",
    ].join("\n");
    const result = evaluateWebResearchQuality("web-analysis", answer);
    expect(result.passed).toBe(false);
    expect(result.issues).toContain("high-confidence-with-thin-evidence");
  });

  it("does not treat vague evidence labels as provenance", () => {
    const answer = [
      "Conclusion: A가 더 낫습니다.",
      "Evidence: 여러 자료를 봤습니다.",
      "Evidence: 업계에서 그렇게 말합니다.",
      "Critical review: caveat checked; conflict not found.",
      "Confidence: High",
    ].join("\n");
    const result = evaluateWebResearchQuality("web-analysis", answer);
    expect(result.passed).toBe(false);
    expect(result.evidenceCount).toBe(0);
    expect(result.issues).toContain("missing-evidence-or-provenance");
  });

  it("passes structured web-analysis answers with enough provenance and critical review", () => {
    const answer = [
      "Conclusion: A가 더 낫습니다.",
      "Evidence: https://example.com/a — published 2026-05-01 — full text.",
      "Evidence: https://example.org/b — updated 2026-05-02 — full text.",
      "Critical review: sources are independent; one caveat is regional coverage.",
      "Confidence: High",
    ].join("\n");
    const result = evaluateWebResearchQuality("web-analysis", answer);
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("passes Markdown section-style web-analysis answers", () => {
    const answer = [
      "## Conclusion",
      "A가 더 낫습니다.",
      "## Evidence",
      "- https://example.com/a — published 2026-05-01 — full text.",
      "- https://example.org/b — updated 2026-05-02 — full text.",
      "## Critical review",
      "Sources are independent; one caveat is regional coverage.",
      "## Confidence",
      "High",
    ].join("\n");
    const result = evaluateWebResearchQuality("web-analysis", answer);
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("blocks final web-analysis assistant messages that fail the quality guardrail", () => {
    const result = guardWebResearchQualityMessage("web-analysis", {
      role: "assistant",
      content: [{ type: "text", text: "Conclusion: 최신입니다. Confidence: High" }],
      stopReason: "stop",
    } as never);

    expect(result.message?.content).toEqual([{ type: "text", text: "" }]);
    expect(result.message?.content[0]).not.toEqual(expect.objectContaining({ text: expect.stringContaining("web-analysis 품질 보강") }));
    expect(result.followUp).toContain("web-analysis 품질 보강이 필요합니다");
    expect(result.followUp).toContain("missing-evidence-or-provenance");
    expect(result.followUp).toContain("최종 사용자 답변은 반드시 한국어 존댓말로 작성하세요");
    expect(result.followUp).toContain("원래 사용자 요청 언어와 출력 형식을 유지");
  });

  it("does not block plain status answers while web-analysis mode is active", () => {
    const result = guardWebResearchQualityMessage("web-analysis", {
      role: "assistant",
      content: [{ type: "text", text: "아닙니다. report 모드는 아직 planned 상태입니다. 작업트리는 clean입니다. Confidence: High" }],
      stopReason: "stop",
    } as never);

    expect(result).toEqual({});
  });

  it("does not block default assistant messages", () => {
    const result = guardWebResearchQualityMessage("default", {
      role: "assistant",
      content: [{ type: "text", text: "Conclusion: 최신입니다. Confidence: High" }],
      stopReason: "stop",
    } as never);

    expect(result).toEqual({});
  });

  it("installs a mode-scoped message_end hook that repairs low-quality web-analysis answers", async () => {
    await useTempAgentDir();
    const handlers: Record<string, Array<(event: never, ctx: never) => unknown>> = {};
    type RegisteredCommand = { handler: (args: string, ctx: { ui: { notify: ReturnType<typeof vi.fn> } }) => Promise<void> };
    const commands = new Map<string, RegisteredCommand>();
    const sendMessage = vi.fn();

    chocoAutopilot({
      on: (name: string, handler: (event: never, ctx: never) => unknown) => {
        handlers[name] = [...(handlers[name] ?? []), handler];
      },
      registerCommand: (name: string, definition: RegisteredCommand) => {
        commands.set(name, definition);
      },
      registerTool: vi.fn(),
      sendUserMessage: vi.fn(),
      sendMessage,
      exec: vi.fn(),
      getFlag: vi.fn(),
    } as never);

    await commands.get("mode")!.handler("set web-analysis", { ui: { notify: vi.fn() } });

    const results = [];
    for (const handler of handlers.message_end ?? []) {
      results.push(await handler({
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Conclusion: 최신입니다. Confidence: High" }],
          stopReason: "stop",
        },
      } as never, { cwd: "/repo" } as never));
    }

    expect(results).toContainEqual({ message: expect.objectContaining({ content: [{ type: "text", text: "" }] }) });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ customType: "choco.web_analysis_quality.repair" }),
      { deliverAs: "followUp", triggerTurn: true },
    );
  });

  it("queues only one web-analysis repair follow-up for repeated failures in a session", async () => {
    await useTempAgentDir();
    const handlers: Record<string, Array<(event: never, ctx: never) => unknown>> = {};
    type RegisteredCommand = { handler: (args: string, ctx: { ui: { notify: ReturnType<typeof vi.fn> } }) => Promise<void> };
    const commands = new Map<string, RegisteredCommand>();
    const sendMessage = vi.fn();

    chocoAutopilot({
      on: (name: string, handler: (event: never, ctx: never) => unknown) => {
        handlers[name] = [...(handlers[name] ?? []), handler];
      },
      registerCommand: (name: string, definition: RegisteredCommand) => {
        commands.set(name, definition);
      },
      registerTool: vi.fn(),
      sendUserMessage: vi.fn(),
      sendMessage,
      exec: vi.fn(),
      getFlag: vi.fn(),
    } as never);

    await commands.get("mode")!.handler("set web-analysis", { ui: { notify: vi.fn() } });

    const badEvent = {
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Conclusion: 최신입니다. Confidence: High" }],
        stopReason: "stop",
      },
    } as never;
    for (const handler of handlers.message_end ?? []) await handler(badEvent, { cwd: "/repo" } as never);
    for (const handler of handlers.message_end ?? []) await handler(badEvent, { cwd: "/repo" } as never);

    const repairCalls = sendMessage.mock.calls.filter(([message]) => message.customType === "choco.web_analysis_quality.repair");
    expect(repairCalls).toHaveLength(1);
  });

  it("caps web-analysis repair follow-ups within one repair cycle", async () => {
    await useTempAgentDir();
    const handlers: Record<string, Array<(event: never, ctx: never) => unknown>> = {};
    type RegisteredCommand = { handler: (args: string, ctx: { ui: { notify: ReturnType<typeof vi.fn> } }) => Promise<void> };
    const commands = new Map<string, RegisteredCommand>();
    const sendMessage = vi.fn();

    chocoAutopilot({
      on: (name: string, handler: (event: never, ctx: never) => unknown) => {
        handlers[name] = [...(handlers[name] ?? []), handler];
      },
      registerCommand: (name: string, definition: RegisteredCommand) => {
        commands.set(name, definition);
      },
      registerTool: vi.fn(),
      sendUserMessage: vi.fn(),
      sendMessage,
      exec: vi.fn(),
      getFlag: vi.fn(),
    } as never);

    await commands.get("mode")!.handler("set web-analysis", { ui: { notify: vi.fn() } });

    const firstFailure = {
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Conclusion: 최신입니다. Confidence: High" }],
        stopReason: "stop",
        timestamp: 1,
      },
    } as never;
    const laterFailedRepair = {
      message: {
        role: "assistant",
        content: [{ type: "text", text: ["Conclusion: 최신입니다.", "Evidence: https://example.com — published 2026-05-01 — full text.", "Confidence: High"].join("\n") }],
        stopReason: "stop",
        timestamp: 2,
      },
    } as never;

    for (const handler of handlers.message_end ?? []) await handler(firstFailure, { cwd: "/repo" } as never);
    for (const handler of handlers.message_end ?? []) await handler(laterFailedRepair, { cwd: "/repo" } as never);

    const repairCalls = sendMessage.mock.calls.filter(([message]) => message.customType === "choco.web_analysis_quality.repair");
    expect(repairCalls).toHaveLength(1);
    expect(repairCalls[0][0].content).toContain("missing-evidence-or-provenance");
  });
});
