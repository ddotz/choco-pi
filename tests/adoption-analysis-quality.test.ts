import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import ddotzAutopilot from "../extensions/ddotz-autopilot/index";
import { evaluateAdoptionAnalysisQuality, guardAdoptionAnalysisQualityMessage } from "../extensions/ddotz-autopilot/adoption-analysis-quality";

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<void> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "ddotz-pi-adoption-quality-test-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
}

const structuredAnswer = [
  "Decision: partially adopt",
  "Adoption depth: partial-port",
  "Fit review: ddotz-pi philosophy fit is high; mode isolation stays intact; default behavior does not change.",
  "Risk review: license/security/source freshness reviewed; maintenance and privacy risk are low.",
  "Scope: adopt the mode-scoped quality guard, reject wholesale vendoring.",
  "Tracking decision: track because code is reflected into ddotz-pi.",
  "Confidence: High",
].join("\n");

describe("adoption-analysis quality guardrails", () => {
  it("bypasses non-adoption-analysis modes", () => {
    const result = evaluateAdoptionAnalysisQuality("default", "Decision: adopt\nConfidence: High");
    expect(result.required).toBe(false);
    expect(result.passed).toBe(true);
  });

  it("flags adoption-analysis answers without a decision", () => {
    const result = evaluateAdoptionAnalysisQuality("adoption-analysis", "Adoption depth: idea-only\nConfidence: High");
    expect(result.required).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.issues).toContain("missing-decision");
  });

  it("flags adoption-analysis answers without adoption depth", () => {
    const result = evaluateAdoptionAnalysisQuality("adoption-analysis", "Decision: adopt\nRisk review: license/security reviewed.\nTracking decision: track.\nConfidence: High");
    expect(result.issues).toContain("missing-adoption-depth");
  });

  it("requires explicit Decision and Adoption depth section labels", () => {
    const answer = structuredAnswer
      .replace("Decision: partially adopt", "I will partially adopt the source.")
      .replace("Adoption depth: partial-port", "Depth should be partial-port.");

    const result = evaluateAdoptionAnalysisQuality("adoption-analysis", answer);
    expect(result.issues).toContain("missing-decision");
    expect(result.issues).toContain("missing-adoption-depth");
  });

  it("flags adoption-analysis answers without fit review", () => {
    const answer = structuredAnswer.replace(/^Fit review:.*\n/m, "");
    const result = evaluateAdoptionAnalysisQuality("adoption-analysis", answer);
    expect(result.issues).toContain("missing-fit-review");
  });

  it("flags adoption-analysis answers without risk review", () => {
    const answer = structuredAnswer.replace(/^Risk review:.*\n/m, "");
    const result = evaluateAdoptionAnalysisQuality("adoption-analysis", answer);
    expect(result.issues).toContain("missing-risk-review");
  });

  it("flags adoption-analysis answers without tracking decision", () => {
    const answer = structuredAnswer.replace(/^Tracking decision:.*\n/m, "");
    const result = evaluateAdoptionAnalysisQuality("adoption-analysis", answer);
    expect(result.issues).toContain("missing-tracking-decision");
  });

  it("flags adoption-analysis answers without confidence", () => {
    const answer = structuredAnswer.replace(/^Confidence:.*$/m, "");
    const result = evaluateAdoptionAnalysisQuality("adoption-analysis", answer);
    expect(result.issues).toContain("missing-confidence");
  });

  it("passes structured adoption-analysis answers", () => {
    const result = evaluateAdoptionAnalysisQuality("adoption-analysis", structuredAnswer);
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("blocks final adoption-analysis assistant messages that fail the quality guardrail", () => {
    const result = guardAdoptionAnalysisQualityMessage("adoption-analysis", {
      role: "assistant",
      content: [{ type: "text", text: "Decision: adopt\nConfidence: High" }],
      stopReason: "stop",
    } as never);

    expect(result.message?.content).toEqual([{ type: "text", text: expect.stringContaining("답변 검증 가드가 보강을 진행 중입니다") }]);
    expect(result.message?.content[0]).not.toEqual(expect.objectContaining({ text: expect.stringContaining("adoption-analysis 품질 보강") }));
    expect(result.followUp).toContain("adoption-analysis 품질 보강이 필요합니다");
    expect(result.followUp).toContain("missing-adoption-depth");
    expect(result.followUp).toContain("최종 사용자 답변은 반드시 한국어 존댓말로 작성하세요");
    expect(result.followUp).toContain("원래 사용자 요청 언어와 출력 형식을 유지");
  });

  it("installs a mode-scoped message_end hook that repairs low-quality adoption-analysis answers", async () => {
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

    await commands.get("mode")!.handler("set adoption-analysis", { ui: { notify: vi.fn() } });

    const results = [];
    for (const handler of handlers.message_end ?? []) {
      results.push(await handler({
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Decision: adopt\nConfidence: High" }],
          stopReason: "stop",
        },
      } as never, { cwd: "/repo" } as never));
    }

    expect(results).toContainEqual({ message: expect.objectContaining({ content: [{ type: "text", text: expect.stringContaining("답변 검증 가드가 보강을 진행 중입니다") }] }) });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ customType: "ddotz.adoption_analysis_quality.repair" }),
      { deliverAs: "followUp", triggerTurn: true },
    );
  });
});
