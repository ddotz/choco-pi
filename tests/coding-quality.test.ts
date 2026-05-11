import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import ddotzAutopilot from "../extensions/ddotz-autopilot/index";
import { evaluateCodingQuality, guardCodingQualityMessage } from "../extensions/ddotz-autopilot/coding-quality";

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<void> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "ddotz-pi-coding-quality-test-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
}

const structuredAnswer = [
  "## Result",
  "구현을 완료했습니다. 변경은 요청 범위에 한정했습니다.",
  "## Verification",
  "- pnpm run version:check && pnpm run lint && pnpm run typecheck && pnpm run test — passed",
  "## Confidence",
  "High",
].join("\n");

describe("coding quality guardrails", () => {
  it("bypasses non-coding modes", () => {
    const result = evaluateCodingQuality("default", "구현 완료. Confidence: High");
    expect(result.required).toBe(false);
    expect(result.passed).toBe(true);
  });

  it("blocks coding completion claims without verification evidence", () => {
    const result = evaluateCodingQuality("coding", "구현 완료했습니다. Confidence: High");
    expect(result.required).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.issues).toContain("missing-verification");
  });

  it("passes structured coding completion answers with verification and confidence", () => {
    const result = evaluateCodingQuality("coding", structuredAnswer);
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("does not require bug-fix evidence chain for non-bug coding changes", () => {
    const answer = [
      "## Result",
      "README 수정 완료했습니다.",
      "## Verification",
      "- pnpm test — passed",
      "## Confidence",
      "High",
    ].join("\n");

    const result = evaluateCodingQuality("coding", answer);
    expect(result.passed).toBe(true);
    expect(result.issues).not.toContain("missing-red-root-fix-green");
  });

  it("requires RED Root cause Fix GREEN chain for bug-fix completion reports", () => {
    const answer = [
      "## Result",
      "버그 수정 완료했습니다.",
      "## Verification",
      "- pnpm test — passed",
      "## Confidence",
      "High",
    ].join("\n");

    const result = evaluateCodingQuality("coding", answer);
    expect(result.passed).toBe(false);
    expect(result.issues).toContain("missing-red-root-fix-green");
  });

  it("passes bug-fix completion reports with RED Root cause Fix GREEN chain", () => {
    const answer = [
      "## Result",
      "버그 수정 완료했습니다.",
      "## RED",
      "재현 테스트가 먼저 실패했습니다.",
      "## Root cause",
      "입력 정규화가 누락됐습니다.",
      "## Fix",
      "정규화 경로를 추가했습니다.",
      "## GREEN",
      "pnpm test — passed",
      "## Verification",
      "- pnpm run lint && pnpm run test — passed",
      "## Confidence",
      "High",
    ].join("\n");

    const result = evaluateCodingQuality("coding", answer);
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("blocks final coding assistant messages that fail the quality guardrail", () => {
    const result = guardCodingQualityMessage("coding", {
      role: "assistant",
      content: [{ type: "text", text: "구현 완료했습니다. Confidence: High" }],
      stopReason: "stop",
    } as never);

    expect(result.message?.content).toEqual([{ type: "text", text: expect.stringContaining("답변 검증 가드가 보강을 진행 중입니다") }]);
    expect(result.followUp).toContain("coding 품질 보강이 필요합니다");
    expect(result.followUp).toContain("missing-verification");
  });

  it("does not block plain status answers while coding mode is active", () => {
    const result = guardCodingQualityMessage("coding", {
      role: "assistant",
      content: [{ type: "text", text: "현재 coding 모드는 implemented 상태입니다. 작업트리는 clean입니다. Confidence: High" }],
      stopReason: "stop",
    } as never);

    expect(result).toEqual({});
  });

  it("queues only one coding repair follow-up for repeated failures in a session", async () => {
    await useTempAgentDir();
    const handlers: Record<string, Array<(event: never, ctx: never) => unknown>> = {};
    type RegisteredCommand = { handler: (args: string, ctx: { ui: { notify: ReturnType<typeof vi.fn> } }) => Promise<void> };
    const commands = new Map<string, RegisteredCommand>();
    const sendMessage = vi.fn();

    ddotzAutopilot({
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

    await commands.get("mode")!.handler("set coding", { ui: { notify: vi.fn() } });

    const badEvent = {
      message: {
        role: "assistant",
        content: [{ type: "text", text: "구현 완료했습니다. Confidence: High" }],
        stopReason: "stop",
      },
    } as never;
    for (const handler of handlers.message_end ?? []) await handler(badEvent, { cwd: "/repo" } as never);
    for (const handler of handlers.message_end ?? []) await handler(badEvent, { cwd: "/repo" } as never);

    const repairCalls = sendMessage.mock.calls.filter(([message]) => message.customType === "ddotz.coding_quality.repair");
    expect(repairCalls).toHaveLength(1);
  });

  it("queues another coding repair follow-up for a later failed repair attempt", async () => {
    await useTempAgentDir();
    const handlers: Record<string, Array<(event: never, ctx: never) => unknown>> = {};
    type RegisteredCommand = { handler: (args: string, ctx: { ui: { notify: ReturnType<typeof vi.fn> } }) => Promise<void> };
    const commands = new Map<string, RegisteredCommand>();
    const sendMessage = vi.fn();

    ddotzAutopilot({
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

    await commands.get("mode")!.handler("set coding", { ui: { notify: vi.fn() } });

    const firstFailure = {
      message: {
        role: "assistant",
        content: [{ type: "text", text: "구현 완료했습니다. Confidence: High" }],
        stopReason: "stop",
        timestamp: 1,
      },
    } as never;
    const laterFailedRepair = {
      message: {
        role: "assistant",
        content: [{ type: "text", text: ["## Result", "구현 완료했습니다.", "## Verification", "- 확인했습니다."].join("\n") }],
        stopReason: "stop",
        timestamp: 2,
      },
    } as never;

    for (const handler of handlers.message_end ?? []) await handler(firstFailure, { cwd: "/repo" } as never);
    for (const handler of handlers.message_end ?? []) await handler(laterFailedRepair, { cwd: "/repo" } as never);

    const repairCalls = sendMessage.mock.calls.filter(([message]) => message.customType === "ddotz.coding_quality.repair");
    expect(repairCalls).toHaveLength(2);
    expect(repairCalls[1][0].content).toContain("missing-confidence");
  });
});
