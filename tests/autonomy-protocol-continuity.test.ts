import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import chocoAutopilot, { loadState } from "../extensions/choco-autopilot/index";
import { autonomyProtocolKey } from "../extensions/choco-autopilot/autonomy-protocol";

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown | Promise<unknown>;

let tempAgentDir: string | undefined;
let tempCwd: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  if (tempCwd) await rm(tempCwd, { recursive: true, force: true });
  tempAgentDir = undefined;
  tempCwd = undefined;
});

async function useTempDirs(): Promise<string> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "choco-pi-continuity-agent-"));
  tempCwd = await mkdtemp(join(tmpdir(), "choco-pi-continuity-cwd-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
  return tempCwd;
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

function setupAutopilot(): { handlers: Map<string, EventHandler[]> } {
  const handlers = new Map<string, EventHandler[]>();
  chocoAutopilot({
    on: (event: string, handler: EventHandler) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
    exec: vi.fn(),
    getFlag: vi.fn(),
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
  } as never);
  return { handlers };
}

function ctx(cwd: string): Record<string, unknown> {
  return { cwd, hasUI: false, ui: {}, sessionManager: { getSessionId: () => "s1" } };
}

async function emitAll(handlers: Map<string, EventHandler[]>, eventName: string, event: Record<string, unknown>, cwd: string): Promise<void> {
  for (const handler of handlers.get(eventName) ?? []) await handler(event, ctx(cwd));
}

describe("autonomy protocol continuity", () => {
  it("resumes the active parallel-work protocol for continuation prompts without resetting satisfied tools", async () => {
    const cwd = await useTempDirs();
    await writeActiveManifest(cwd);
    const { handlers } = setupAutopilot();

    await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt: "병렬로 나눠서 구현해줘", systemPrompt: "base" }, cwd);
    await emitAll(handlers, "tool_result", { type: "tool_result", toolName: "spec_gate", details: { result: { ok: true } } }, cwd);
    const first = (await loadState()).autonomyProtocols[autonomyProtocolKey(cwd, "s1")];

    await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt: "계속 진행해줘", systemPrompt: "base" }, cwd);
    const resumed = (await loadState()).autonomyProtocols[autonomyProtocolKey(cwd, "s1")];

    expect(first.kind).toBe("parallel-work");
    expect(resumed.id).toBe(first.id);
    expect(resumed.kind).toBe("parallel-work");
    expect(resumed.satisfiedTools).toContain("spec_gate");
    expect(resumed.taskStatus).toBe("active");
  });

  it("supersedes an active long-running protocol when a new incompatible branch task is explicit", async () => {
    const cwd = await useTempDirs();
    await writeActiveManifest(cwd);
    const { handlers } = setupAutopilot();

    await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt: "병렬로 나눠서 구현해줘", systemPrompt: "base" }, cwd);
    const first = (await loadState()).autonomyProtocols[autonomyProtocolKey(cwd, "s1")];

    await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt: "feature/foo 브랜치에서 고쳐줘", systemPrompt: "base" }, cwd);
    const state = await loadState();
    const active = state.autonomyProtocols[autonomyProtocolKey(cwd, "s1")];
    const archived = Object.values(state.autonomyProtocols).find((protocol) => protocol.id === first.id && protocol.taskStatus === "superseded");

    expect(active.kind).toBe("single-branch");
    expect(archived).toMatchObject({ id: first.id, taskStatus: "superseded", supersededBy: active.id });
  });
});
