import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import chocoAutopilot, { loadState } from "../extensions/choco-autopilot/index";
import { updateAgentLaneStatus } from "../extensions/choco-autopilot/agent-run-manifest";
import { autonomyProtocolKey } from "../extensions/choco-autopilot/autonomy-protocol";
import { planParallelWorkAreas } from "../extensions/choco-autopilot/worktree-planner";
import { createGitFixture } from "./helpers/git-fixture";

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
  tempAgentDir = await mkdtemp(join(tmpdir(), "choco-pi-e2e-"));
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

async function emitToolCall(handlers: Map<string, EventHandler[]>, toolName: string, input: Record<string, unknown>, cwd: string): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const handler of handlers.get("tool_call") ?? []) results.push(await handler({ type: "tool_call", toolCallId: `${toolName}-1`, toolName, input }, ctx(cwd)));
  return results;
}

async function writeActiveManifest(cwd: string): Promise<void> {
  const dir = join(cwd, ".pi", "agent-runs", "group-a");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "manifest.json"), JSON.stringify({
    version: 1,
    groupId: "group-a",
    repoRoot: cwd,
    baseRef: "main",
    createdAt: "2026-05-17T00:00:00.000Z",
    updatedAt: "2026-05-17T00:00:00.000Z",
    parallelStrategy: "hybrid",
    status: "running",
    lanes: [],
  }, null, 2));
}

const completeReview = {
  acceptanceFit: "Requested work is complete and matched to the latest prompt.",
  runtimeFit: "Runtime behavior is represented by tests and tool state.",
  failureModes: "No critical in-scope failure remains after verification.",
  verificationEvidence: "Observable verification passed.",
  loopGovernance: "Step transitions stayed plan-first with no silent scope expansion.",
  completionBoundary: "Safe to stop after requested outcome is satisfied.",
  confidence: "High",
  readyToComplete: true,
};

describe("autonomous harness e2e flows", () => {
  it("runs the single-branch protocol from missing branch guard to completed protocol", async () => {
    const cwd = await useTempAgentDir();
    const { handlers, tools } = setupAutopilot();

    await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt: "feature/foo 브랜치에서 고쳐줘", systemPrompt: "base" }, cwd);
    const missing = await tools.get("structural_gate")!.execute("gate-0", completeReview, undefined, undefined, ctx(cwd));
    await emitAll(handlers, "tool_result", { type: "tool_result", toolName: "branch_switch_guard", details: { result: { ok: true, action: "switched" } } }, cwd);
    const passed = await tools.get("structural_gate")!.execute("gate-1", completeReview, undefined, undefined, ctx(cwd));
    await emitAll(handlers, "tool_result", { type: "tool_result", toolName: "structural_gate", details: passed.details }, cwd);
    const protocol = (await loadState()).autonomyProtocols[autonomyProtocolKey(cwd, "s1")];

    expect(missing.details).toMatchObject({ ok: false, reason: expect.stringContaining("branch_switch_guard") });
    expect(passed.details).toMatchObject({ ok: true });
    expect(protocol.kind).toBe("single-branch");
    expect(protocol.taskStatus).toBe("completed");
  });

  it("runs the parallel protocol through required tools and completed protocol", async () => {
    const cwd = await useTempAgentDir();
    const { handlers, tools } = setupAutopilot();

    await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt: "병렬로 나눠서 구현해줘", systemPrompt: "base" }, cwd);
    for (const [toolName, details] of [
      ["spec_gate", { result: { ok: true } }],
      ["parallel_work_plan", { plan: { lanes: [] } }],
      ["agent_orchestrator", { result: { ok: true, action: "start" } }],
      ["worktree_manage", { result: { ok: true, action: "create" } }],
      ["integration_verifier", { result: { ok: true, status: "passed" } }],
    ] as Array<[string, Record<string, unknown>]>) {
      await emitAll(handlers, "tool_result", { type: "tool_result", toolName, details }, cwd);
    }
    const passed = await tools.get("structural_gate")!.execute("gate-1", completeReview, undefined, undefined, ctx(cwd));
    await emitAll(handlers, "tool_result", { type: "tool_result", toolName: "structural_gate", details: passed.details }, cwd);
    const protocol = (await loadState()).autonomyProtocols[autonomyProtocolKey(cwd, "s1")];

    expect(passed.details).toMatchObject({ ok: true });
    expect(protocol.kind).toBe("parallel-work");
    expect(protocol.taskStatus).toBe("completed");
  });

  it("continues an active manifest without resetting the parallel protocol", async () => {
    const cwd = await useTempAgentDir();
    await writeActiveManifest(cwd);
    const { handlers } = setupAutopilot();

    await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt: "병렬로 나눠서 구현해줘", systemPrompt: "base" }, cwd);
    await emitAll(handlers, "tool_result", { type: "tool_result", toolName: "spec_gate", details: { result: { ok: true } } }, cwd);
    const first = (await loadState()).autonomyProtocols[autonomyProtocolKey(cwd, "s1")];
    await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt: "계속 진행해줘", systemPrompt: "base" }, cwd);
    const resumed = (await loadState()).autonomyProtocols[autonomyProtocolKey(cwd, "s1")];

    expect(resumed.id).toBe(first.id);
    expect(resumed.kind).toBe("parallel-work");
    expect(resumed.satisfiedTools).toContain("spec_gate");
  });

  it("blocks out-of-scope active lane writes and marks the protocol blocked", async () => {
    await useTempAgentDir();
    delete process.env.CHOCO_PI_ACTIVE_LANE_CONTEXT;
    const fixture = await createGitFixture();
    try {
      const { handlers, tools } = setupAutopilot();
      const plan = planParallelWorkAreas({ items: [{ id: "tests", description: "Own tests", files: ["tests/"] }] });
      await tools.get("agent_orchestrator")!.execute("start", { action: "start", repoRoot: fixture.repoRoot, groupId: "group-a", baseRef: "main", plan }, undefined, undefined, ctx(fixture.repoRoot));
      await updateAgentLaneStatus(fixture.repoRoot, "group-a", "lane-1", "created", { worktreePath: fixture.repoRoot, branchName: "main" });
      await tools.get("agent_orchestrator")!.execute("activate", { action: "activate_lane", repoRoot: fixture.repoRoot, groupId: "group-a", laneId: "lane-1" }, undefined, undefined, ctx(fixture.repoRoot));
      await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt: "이 lane 이어서 해줘", systemPrompt: "base" }, fixture.repoRoot);

      const blocked = await emitToolCall(handlers, "write", { path: "src/index.ts", content: "outside" }, fixture.repoRoot);
      const protocol = (await loadState()).autonomyProtocols[autonomyProtocolKey(fixture.repoRoot, "s1")];

      expect(blocked).toContainEqual(expect.objectContaining({ block: true, reason: expect.stringContaining("outside active lane write scope") }));
      expect(protocol.kind).toBe("worktree-lane");
      expect(protocol.taskStatus).toBe("blocked");
      expect(protocol.blockedTools).toContainEqual(expect.objectContaining({ toolName: "write_scope_guard" }));
    } finally {
      await fixture.cleanup();
    }
  });

  it("keeps approval-boundary protocols blocked instead of reporting ready completion", async () => {
    const cwd = await useTempAgentDir();
    const { handlers, tools } = setupAutopilot();

    await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt: "검증 끝나면 npm publish까지 해줘", systemPrompt: "base" }, cwd);
    const ready = await tools.get("structural_gate")!.execute("gate-1", completeReview, undefined, undefined, ctx(cwd));
    const blocked = await tools.get("structural_gate")!.execute("gate-2", {
      ...completeReview,
      failureModes: "Blocked at approval boundary for package publishing.",
      completionBoundary: "approval boundary: npm publish requires explicit approval, so stopping before publish.",
      readyToComplete: false,
      outcome: "blocked",
    }, undefined, undefined, ctx(cwd));
    await emitAll(handlers, "tool_result", { type: "tool_result", toolName: "structural_gate", details: blocked.details }, cwd);
    const protocol = (await loadState()).autonomyProtocols[autonomyProtocolKey(cwd, "s1")];

    expect(ready.details).toMatchObject({ ok: false, reason: expect.stringContaining("approval-boundary") });
    expect(blocked.details).toMatchObject({ ok: true });
    expect(protocol.taskStatus).toBe("blocked");
    expect(protocol.blockedTools).toContainEqual(expect.objectContaining({ toolName: "approval-boundary" }));
  });
});
