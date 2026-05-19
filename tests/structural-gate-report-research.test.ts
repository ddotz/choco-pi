import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import chocoAutopilot from "../extensions/choco-autopilot/index";
import { repairPromptText } from "../extensions/choco-autopilot/structural-gate";

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown | Promise<unknown>;

interface RegisteredTool {
  name: string;
  execute: (...args: any[]) => Promise<{ content: Array<{ type: "text"; text: string }>; details: unknown }>;
}

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<string> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "choco-pi-structural-report-research-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
  return tempAgentDir;
}

function setupAutopilot(): { handlers: Map<string, EventHandler[]>; tools: Map<string, RegisteredTool> } {
  const handlers = new Map<string, EventHandler[]>();
  const tools = new Map<string, RegisteredTool>();
  chocoAutopilot({
    on: (event: string, handler: EventHandler) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
    registerTool: (tool: RegisteredTool) => tools.set(tool.name, tool),
    registerCommand: vi.fn(),
    exec: vi.fn(),
    getFlag: vi.fn(),
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
  } as never);
  return { handlers, tools };
}

function ctx(cwd: string): Record<string, unknown> {
  return { cwd, hasUI: false, ui: {}, sessionManager: { getSessionId: () => "s1" } };
}

async function emitAll(handlers: Map<string, EventHandler[]>, eventName: string, event: Record<string, unknown>, cwd: string): Promise<void> {
  for (const handler of handlers.get(eventName) ?? []) await handler(event, ctx(cwd));
}

const completeReview = {
  acceptanceFit: "Requested report research harness flow is complete and matched to the latest prompt.",
  runtimeFit: "Runtime protocol state is represented by autonomy routing, report_research_gate, and structural checks.",
  failureModes: "No critical in-scope failure remains after verification.",
  verificationEvidence: "Observable verification passed.",
  loopGovernance: "Step transitions stayed plan-first with no silent scope expansion.",
  completionBoundary: "Safe to stop after requested outcome is satisfied.",
  confidence: "High",
  readyToComplete: true,
};

describe("structural gate report-research protocol integration", () => {
  it("fails completion when report_research_gate is missing for a report request", async () => {
    const cwd = await useTempAgentDir();
    const { handlers, tools } = setupAutopilot();
    await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt: "시장 분석 보고서 작성해줘", systemPrompt: "base" }, cwd);
    await emitAll(handlers, "tool_result", { type: "tool_result", toolName: "spec_gate", details: { result: { ok: true } } }, cwd);

    const result = await tools.get("structural_gate")!.execute("gate-1", completeReview, undefined, undefined, ctx(cwd));

    expect(result.details).toMatchObject({ ok: false, reason: expect.stringContaining("report_research_gate") });
    expect((result.details as { reason?: string }).reason).toContain("report-research");
  });

  it("passes protocol check after report_research_gate is satisfied", async () => {
    const cwd = await useTempAgentDir();
    const { handlers, tools } = setupAutopilot();
    await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt: "시장 분석 보고서 작성해줘", systemPrompt: "base" }, cwd);
    await emitAll(handlers, "tool_result", { type: "tool_result", toolName: "spec_gate", details: { result: { ok: true } } }, cwd);
    await emitAll(handlers, "tool_result", { type: "tool_result", toolName: "report_research_gate", details: { result: { ok: true, sourceCount: 2, evidenceSummary: "2 sources reviewed" } } }, cwd);

    const result = await tools.get("structural_gate")!.execute("gate-1", completeReview, undefined, undefined, ctx(cwd));

    expect(result.details).toMatchObject({ ok: true });
  });

  it("gives report-specific repair instructions for a missing report_research_gate", () => {
    const prompt = repairPromptText("autonomous protocol report-research required tools missing: report_research_gate", "초안");

    expect(prompt).toContain("Protocol: report-research");
    expect(prompt).toContain("- report_research_gate");
    expect(prompt).toContain("Run web-analysis source collection");
    expect(prompt).toContain("source confidence review");
    expect(prompt).toContain("evidence gaps");
    expect(prompt).toContain("rerun structural_gate");
  });
});
