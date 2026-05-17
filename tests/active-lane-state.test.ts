import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import chocoAutopilot from "../extensions/choco-autopilot/index";
import { updateAgentLaneStatus } from "../extensions/choco-autopilot/agent-run-manifest";
import { planParallelWorkAreas } from "../extensions/choco-autopilot/worktree-planner";
import { createGitFixture } from "./helpers/git-fixture";

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown | Promise<unknown>;

interface RegisteredTool {
  name: string;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    ctx: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: string; text: string }>; details?: unknown }>;
}

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<void> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "choco-pi-active-lane-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
}

function setupAutopilot(): { tools: Map<string, RegisteredTool>; handlers: Map<string, EventHandler[]> } {
  const tools = new Map<string, RegisteredTool>();
  const handlers = new Map<string, EventHandler[]>();
  chocoAutopilot({
    on: (event: string, handler: EventHandler) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
    registerTool: (tool: RegisteredTool) => tools.set(tool.name, tool),
    registerCommand: vi.fn(),
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
    exec: vi.fn(),
    getFlag: vi.fn(),
  } as never);
  return { tools, handlers };
}

function ctx(repoRoot: string): Record<string, unknown> {
  return { cwd: repoRoot, hasUI: false, sessionManager: { getSessionId: () => "session-a" } };
}

async function emitToolCall(handlers: Map<string, EventHandler[]>, repoRoot: string, toolName: string, input: Record<string, unknown>): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const handler of handlers.get("tool_call") ?? []) {
    results.push(await handler({ type: "tool_call", toolCallId: `${toolName}-1`, toolName, input }, ctx(repoRoot)));
  }
  return results;
}

describe("active lane runtime state", () => {
  it("scopes active lanes by cwd and session so another cwd in the same session is not blocked", async () => {
    await useTempAgentDir();
    delete process.env.CHOCO_PI_ACTIVE_LANE_CONTEXT;
    const fixtureA = await createGitFixture();
    const fixtureB = await createGitFixture();
    try {
      const { tools, handlers } = setupAutopilot();
      const plan = planParallelWorkAreas({ items: [{ id: "runtime", description: "Edit runtime", files: ["src/owned.ts"] }] });
      await tools.get("agent_orchestrator")!.execute("start", { action: "start", repoRoot: fixtureA.repoRoot, groupId: "group-a", baseRef: "main", plan }, undefined, undefined, ctx(fixtureA.repoRoot));
      await updateAgentLaneStatus(fixtureA.repoRoot, "group-a", "lane-1", "created", { worktreePath: fixtureA.repoRoot, branchName: "main" });
      await tools.get("agent_orchestrator")!.execute("activate", { action: "activate_lane", repoRoot: fixtureA.repoRoot, groupId: "group-a", laneId: "lane-1" }, undefined, undefined, ctx(fixtureA.repoRoot));

      const sameCwdBlocked = await emitToolCall(handlers, fixtureA.repoRoot, "write", { path: "README.md", content: "outside" });
      const otherCwdAllowed = await emitToolCall(handlers, fixtureB.repoRoot, "write", { path: "README.md", content: "outside" });

      expect(sameCwdBlocked).toContainEqual(expect.objectContaining({ block: true }));
      expect(otherCwdAllowed.every((result) => result === undefined)).toBe(true);
    } finally {
      await fixtureA.cleanup();
      await fixtureB.cleanup();
    }
  });

  it("blocks writes in read-only active lanes", async () => {
    await useTempAgentDir();
    delete process.env.CHOCO_PI_ACTIVE_LANE_CONTEXT;
    const fixture = await createGitFixture();
    try {
      const { tools, handlers } = setupAutopilot();
      const plan = planParallelWorkAreas({ items: [{ id: "review", description: "Review docs", files: ["README.md"], write: false }] });
      await tools.get("agent_orchestrator")!.execute("start", { action: "start", repoRoot: fixture.repoRoot, groupId: "group-a", baseRef: "main", plan }, undefined, undefined, ctx(fixture.repoRoot));
      await tools.get("agent_orchestrator")!.execute("activate", { action: "activate_lane", repoRoot: fixture.repoRoot, groupId: "group-a", laneId: "lane-1" }, undefined, undefined, ctx(fixture.repoRoot));

      const blocked = await emitToolCall(handlers, fixture.repoRoot, "write", { path: "README.md", content: "outside" });

      expect(blocked).toContainEqual(expect.objectContaining({ block: true, reason: expect.stringContaining("read-only lane") }));
    } finally {
      await fixture.cleanup();
    }
  });

  it("enforces write scope from session state even when CHOCO_PI_ACTIVE_LANE_CONTEXT is not set", async () => {
    await useTempAgentDir();
    delete process.env.CHOCO_PI_ACTIVE_LANE_CONTEXT;
    const fixture = await createGitFixture();
    try {
      const { tools, handlers } = setupAutopilot();
      const plan = planParallelWorkAreas({ items: [{ id: "runtime", description: "Edit runtime", files: ["src/owned.ts"] }] });
      await tools.get("agent_orchestrator")!.execute("start", { action: "start", repoRoot: fixture.repoRoot, groupId: "group-a", baseRef: "main", plan }, undefined, undefined, ctx(fixture.repoRoot));
      await updateAgentLaneStatus(fixture.repoRoot, "group-a", "lane-1", "created", { worktreePath: fixture.repoRoot, branchName: "main" });

      const activated = await tools.get("agent_orchestrator")!.execute("activate", { action: "activate_lane", repoRoot: fixture.repoRoot, groupId: "group-a", laneId: "lane-1" }, undefined, undefined, ctx(fixture.repoRoot));
      const blocked = await emitToolCall(handlers, fixture.repoRoot, "write", { path: "README.md", content: "outside" });
      await tools.get("agent_orchestrator")!.execute("deactivate", { action: "deactivate_lane", repoRoot: fixture.repoRoot }, undefined, undefined, ctx(fixture.repoRoot));
      const allowed = await emitToolCall(handlers, fixture.repoRoot, "write", { path: "README.md", content: "outside" });

      expect(activated.details).toMatchObject({ result: expect.objectContaining({ ok: true }) });
      expect(blocked).toContainEqual(expect.objectContaining({ block: true, reason: expect.stringContaining("outside active lane write scope") }));
      expect(allowed.every((result) => result === undefined)).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });
});
