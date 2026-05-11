import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import ddotzAutopilot from "../extensions/ddotz-autopilot/index";
import { evaluateReportQuality, guardReportQualityMessage } from "../extensions/ddotz-autopilot/report-quality";

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<void> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "ddotz-pi-report-quality-test-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
}

const completeReport = [
  "## Executive summary",
  "의사결정 요약입니다.",
  "## Evidence notes",
  "- User material: project brief, retrieved 2026-05-11, full text.",
  "## Main report",
  "Facts, analysis, recommendations, and open risks are separated.",
  "## Critical review",
  "Main caveat is single-source dependence; a new source could change the conclusion.",
  "## Confidence",
  "High",
].join("\n");

describe("report quality guardrails", () => {
  it("bypasses non-report modes", () => {
    const result = evaluateReportQuality("default", "Executive summary: done");
    expect(result.required).toBe(false);
    expect(result.passed).toBe(true);
  });

  it("flags report answers without evidence notes", () => {
    const answer = completeReport.replace(/^## Evidence notes\n- .*\n/m, "");
    const result = evaluateReportQuality("report", answer);
    expect(result.required).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.issues).toContain("missing-evidence-notes");
  });

  it("flags report answers without critical review", () => {
    const answer = completeReport.replace(/^## Critical review\n.*\n/m, "");
    const result = evaluateReportQuality("report", answer);
    expect(result.issues).toContain("missing-critical-review");
  });

  it("flags hollow evidence notes without provenance or user-material references", () => {
    const answer = completeReport.replace(
      /^## Evidence notes\n- .*\n/m,
      "## Evidence notes\n확인했습니다.\n",
    );
    const result = evaluateReportQuality("report", answer);
    expect(result.issues).toContain("missing-evidence-notes");
  });

  it("passes structured report answers", () => {
    const result = evaluateReportQuality("report", completeReport);
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("blocks final report assistant messages that fail the quality guardrail", () => {
    const result = guardReportQualityMessage("report", {
      role: "assistant",
      content: [{ type: "text", text: "## Executive summary\n완료했습니다.\n## Confidence\nHigh" }],
      stopReason: "stop",
    } as never);

    expect(result.message?.content).toEqual([{ type: "text", text: expect.stringContaining("답변 검증 가드가 보강을 진행 중입니다") }]);
    expect(result.followUp).toContain("report 품질 보강이 필요합니다");
    expect(result.followUp).toContain("missing-evidence-notes");
  });

  it("blocks Korean-heading report messages that fail the quality guardrail", () => {
    const result = guardReportQualityMessage("report", {
      role: "assistant",
      content: [{ type: "text", text: "## 요약\n완료했습니다.\n## 신뢰도\nHigh" }],
      stopReason: "stop",
    } as never);

    expect(result.message?.content).toEqual([{ type: "text", text: expect.stringContaining("답변 검증 가드가 보강을 진행 중입니다") }]);
    expect(result.followUp).toContain("missing-evidence-notes");
  });

  it("does not block plain status answers while report mode is active", () => {
    const result = guardReportQualityMessage("report", {
      role: "assistant",
      content: [{ type: "text", text: "현재 report 모드는 implemented 상태입니다. 작업트리는 clean입니다. Confidence: High" }],
      stopReason: "stop",
    } as never);

    expect(result).toEqual({});
  });

  it("installs a mode-scoped message_end hook that repairs low-quality report answers", async () => {
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

    await commands.get("mode")!.handler("set report", { ui: { notify: vi.fn() } });

    const results = [];
    for (const handler of handlers.message_end ?? []) {
      results.push(await handler({
        message: {
          role: "assistant",
          content: [{ type: "text", text: "## Executive summary\n완료했습니다.\n## Confidence\nHigh" }],
          stopReason: "stop",
        },
      } as never, { cwd: "/repo" } as never));
    }

    expect(results).toContainEqual({ message: expect.objectContaining({ content: [{ type: "text", text: expect.stringContaining("답변 검증 가드가 보강을 진행 중입니다") }] }) });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ customType: "ddotz.report_quality.repair" }),
      { deliverAs: "followUp", triggerTurn: true },
    );
  });
});
