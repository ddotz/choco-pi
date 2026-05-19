import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import chocoAutopilot from "../extensions/choco-autopilot/index";
import { evaluateReportQuality, guardReportQualityMessage } from "../extensions/choco-autopilot/report-quality";

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<void> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "choco-pi-report-quality-test-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
}

const completeReport = [
  "## Executive summary",
  "의사결정 요약입니다.",
  "## Evidence notes",
  "- External source: https://example.com/official | publisher: Example Authority | published: 2026-05-01 | retrieved: 2026-05-19 | access quality: full-text | relevance: high | source confidence: high | used claim: market expansion.",
  "- External source: https://example.org/data | publisher: Example Data Lab | updated: 2026-05-10 | retrieved: 2026-05-19 | access quality: full-text | relevance: high | source confidence: medium | used claim: distribution constraints.",
  "- Source confidence review: sources were scored by relevance, recency, authority, independence, evidence quality, and access quality; no unresolved conflict changed the recommendation.",
  "## Main report",
  "Facts, analysis, recommendations, and open risks are separated.",
  "## Critical review",
  "Main caveat is single-source dependence; a new source could change the conclusion.",
  "## Confidence",
  "Confidence: High",
].join("\n");

const noExternalBoundaryReport = [
  "## Executive summary",
  "제공 자료 기준의 의사결정 요약입니다.",
  "## Evidence notes",
  "- Evidence boundary: user-provided materials only; external research explicitly forbidden by user.",
  "- User material: project brief, retrieved from prompt, access quality: full-text, source confidence: medium, used claim: internal priority.",
  "- Source confidence review: no external source confidence matrix was built because the user forbade external research; conclusions are bounded to supplied material.",
  "## Main report",
  "Facts, analysis, recommendations, and open risks are separated.",
  "## Critical review",
  "Current market claims are intentionally not made because external research was forbidden.",
  "## Confidence",
  "Confidence: Medium",
].join("\n");

describe("report quality guardrails", () => {
  it("bypasses non-report modes", () => {
    const result = evaluateReportQuality("default", "Executive summary: done");
    expect(result.required).toBe(false);
    expect(result.passed).toBe(true);
  });

  it("flags report answers without evidence notes", () => {
    const answer = completeReport.replace(/^## Evidence notes\n[\s\S]*?## Main report/m, "## Main report");
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
      /^## Evidence notes\n[\s\S]*?## Main report/m,
      "## Evidence notes\n확인했습니다.\n## Main report",
    );
    const result = evaluateReportQuality("report", answer);
    expect(result.issues).toContain("missing-evidence-notes");
    expect(result.issues).toContain("missing-external-research");
  });

  it("flags report answers without external research provenance unless a boundary is stated", () => {
    const answer = completeReport.replace(
      /^## Evidence notes\n[\s\S]*?## Main report/m,
      "## Evidence notes\n- User material: project brief, retrieved from prompt, access quality: full-text, source confidence: medium.\n- Source confidence review: user material only.\n## Main report",
    );
    const result = evaluateReportQuality("report", answer);

    expect(result.issues).toContain("missing-external-research");
  });

  it("flags report answers without a source confidence review", () => {
    const answer = completeReport.replace(/- Source confidence review: .*\n/, "");
    const result = evaluateReportQuality("report", answer);

    expect(result.issues).toContain("missing-source-confidence-review");
  });

  it("allows explicit no-external-research boundary with non-High confidence", () => {
    const result = evaluateReportQuality("report", noExternalBoundaryReport);

    expect(result.issues).not.toContain("missing-external-research");
    expect(result.issues).not.toContain("unsupported-high-confidence");
    expect(result.passed).toBe(true);
  });

  it("blocks High confidence when external research is explicitly forbidden", () => {
    const result = evaluateReportQuality("report", noExternalBoundaryReport.replace("Confidence: Medium", "Confidence: High"));

    expect(result.issues).toContain("unsupported-high-confidence");
  });

  it("blocks High confidence when fewer than two external sources are cited", () => {
    const answer = completeReport.replace(/- External source: https:\/\/example\.org\/data.*\n/, "");
    const result = evaluateReportQuality("report", answer);

    expect(result.issues).toContain("unsupported-high-confidence");
  });

  it("passes structured source-backed report answers", () => {
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

    expect(result.message?.content).toEqual([{ type: "text", text: "" }]);
    expect(result.followUp).toContain("report 품질 보강이 필요합니다");
    expect(result.followUp).toContain("missing-evidence-notes");
  });

  it("blocks Korean-heading report messages that fail the quality guardrail", () => {
    const result = guardReportQualityMessage("report", {
      role: "assistant",
      content: [{ type: "text", text: "## 요약\n완료했습니다.\n## 신뢰도\nHigh" }],
      stopReason: "stop",
    } as never);

    expect(result.message?.content).toEqual([{ type: "text", text: "" }]);
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

    expect(results).toContainEqual({ message: expect.objectContaining({ content: [{ type: "text", text: "" }] }) });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ customType: "choco.report_quality.repair" }),
      { deliverAs: "followUp", triggerTurn: true },
    );
  });
});
