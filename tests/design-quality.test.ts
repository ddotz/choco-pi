import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import chocoAutopilot from "../extensions/choco-autopilot/index";
import { evaluateDesignQuality, guardDesignQualityMessage } from "../extensions/choco-autopilot/design-quality";

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<void> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "choco-pi-design-quality-test-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
}

const completeDesign = [
  "## Result",
  "Artifact track: Mobile web.",
  "Visual thesis: Tone is editorial dark; typography uses Pretendard for Korean body and a restrained sans display; color is zinc-black with one muted amber accent; spacing is asymmetric with generous mobile rhythm; surfaces use quiet borders, not glow; motion is transform/opacity only; differentiation comes from product proof, not generic SaaS cards.",
  "Korean typography: Pretendard, word-break: keep-all, text-wrap: balance, and leading-tight/leading-snug are required. Korean headings must not use leading-none, and mobile breakpoints need visual line-break review.",
  "## Verification",
  "Traceability checked against the product goal, Mobile web track, existing style scan assumption, anti-slop rules, Korean line-break QA, and gstack responsive screenshot requirement before Confidence: High.",
  "## Notes",
  "Assumption: no existing DESIGN.md was available, so the visual thesis uses reversible defaults until project tokens are inspected.",
  "## Confidence",
  "High",
].join("\n");

describe("design quality guardrails", () => {
  it("bypasses non-design modes", () => {
    const result = evaluateDesignQuality("default", "## Result\nArtifact track: Mobile web\n## Confidence\nHigh");
    expect(result.required).toBe(false);
    expect(result.passed).toBe(true);
  });

  it("flags design answers without an artifact track", () => {
    const answer = completeDesign.replace("Artifact track: Mobile web.\n", "");
    const result = evaluateDesignQuality("design", answer);
    expect(result.required).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.issues).toContain("missing-artifact-track");
  });

  it("flags design answers without a concrete visual thesis", () => {
    const answer = completeDesign.replace(/^Visual thesis:.*\n/m, "Visual thesis: modern and clean.\n");
    const result = evaluateDesignQuality("design", answer);
    expect(result.issues).toContain("missing-visual-thesis");
  });

  it("flags design answers without Korean typography and line-break criteria", () => {
    const answer = completeDesign.replace(/^Korean typography:.*\n/m, "");
    const result = evaluateDesignQuality("design", answer);
    expect(result.issues).toContain("missing-korean-typography");
  });

  it("passes structured design answers", () => {
    const result = evaluateDesignQuality("design", completeDesign);
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("blocks final design assistant messages that fail the quality guardrail", () => {
    const result = guardDesignQualityMessage("design", {
      role: "assistant",
      content: [{ type: "text", text: "## Result\n현대적이고 깔끔한 디자인 방향입니다.\n## Confidence\nHigh" }],
      stopReason: "stop",
    } as never);

    expect(result.message?.content).toEqual([{ type: "text", text: "" }]);
    expect(result.followUp).toContain("design 품질 보강이 필요합니다");
    expect(result.followUp).toContain("missing-artifact-track");
    expect(result.followUp).toContain("missing-korean-typography");
  });

  it("does not block plain status answers while design mode is active", () => {
    const result = guardDesignQualityMessage("design", {
      role: "assistant",
      content: [{ type: "text", text: "현재 design 모드는 implemented 상태입니다. 작업트리는 clean입니다. Confidence: High" }],
      stopReason: "stop",
    } as never);

    expect(result).toEqual({});
  });

  it("installs a mode-scoped message_end hook that repairs low-quality design answers", async () => {
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

    await commands.get("mode")!.handler("set design", { ui: { notify: vi.fn() } });

    const results = [];
    for (const handler of handlers.message_end ?? []) {
      results.push(await handler({
        message: {
          role: "assistant",
          content: [{ type: "text", text: "## Result\n현대적이고 깔끔한 디자인 방향입니다.\n## Confidence\nHigh" }],
          stopReason: "stop",
        },
      } as never, { cwd: "/repo" } as never));
    }

    expect(results).toContainEqual({ message: expect.objectContaining({ content: [{ type: "text", text: "" }] }) });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ customType: "choco.design_quality.repair" }),
      { deliverAs: "followUp", triggerTurn: true },
    );
  });
});
