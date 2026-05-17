import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import chocoAutopilot from "../extensions/choco-autopilot/index";

interface RegisteredTool {
  name: string;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    ctx: { cwd: string; sessionManager?: { getSessionId: () => string } },
  ) => Promise<{ content: Array<{ type: string; text: string }>; details?: unknown }>;
}

function ctx(sessionId: string): { cwd: string; sessionManager: { getSessionId: () => string } } {
  return { cwd: "/repo", sessionManager: { getSessionId: () => sessionId } };
}

function registeredTools(): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  chocoAutopilot({
    on: vi.fn(),
    registerCommand: vi.fn(),
    registerTool: (definition: RegisteredTool) => {
      tools.set(definition.name, definition);
    },
    sendUserMessage: vi.fn(),
    sendMessage: vi.fn(),
    exec: vi.fn(),
    getFlag: vi.fn(),
  } as never);
  return tools;
}

describe("dynamic SDD spec_gate tool", () => {
  it("registers spec_gate", () => {
    expect(registeredTools().has("spec_gate")).toBe(true);
  });

  it("requires a complete working spec before starting", async () => {
    const tool = registeredTools().get("spec_gate")!;

    const result = await tool.execute(
      "1",
      { action: "start", objective: "Ship dynamic SDD" },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    expect(result.details).toMatchObject({ ok: false, reason: expect.stringContaining("scope") });
  });

  it("rejects deltas before a working spec is started", async () => {
    const tool = registeredTools().get("spec_gate")!;

    const result = await tool.execute(
      "1",
      { action: "delta", delta: "A discovered constraint.", deltaHandling: "in-scope" },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    expect(result.details).toMatchObject({ ok: false, reason: expect.stringContaining("start") });
  });

  it("requires explicit delta handling after a working spec is started", async () => {
    const tool = registeredTools().get("spec_gate")!;

    await tool.execute(
      "1",
      {
        action: "start",
        objective: "Add dynamic SDD",
        scope: ["spec_gate tool"],
        acceptanceCriteria: ["spec_gate is registered"],
        testStrategy: ["vitest covers tool behavior"],
      },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    const result = await tool.execute(
      "2",
      { action: "delta", delta: "A discovered constraint." },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    expect(result.details).toMatchObject({ ok: false, reason: expect.stringContaining("deltaHandling") });
  });

  it("starts, records an in-scope delta, and snapshots the accepted spec", async () => {
    const tool = registeredTools().get("spec_gate")!;

    await tool.execute(
      "1",
      {
        action: "start",
        objective: "Add dynamic SDD",
        scope: ["spec_gate tool"],
        acceptanceCriteria: ["spec_gate is registered"],
        testStrategy: ["vitest covers tool behavior"],
        risks: ["scope creep"],
      },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    const delta = await tool.execute(
      "2",
      {
        action: "delta",
        delta: "Need a list action for final review.",
        deltaHandling: "in-scope",
        acceptanceCriteria: ["list shows working spec and deltas"],
      },
      undefined,
      undefined,
      { cwd: "/repo" },
    );
    expect(delta.details).toMatchObject({ ok: true });

    const snapshot = await tool.execute(
      "3",
      { action: "snapshot", label: "before implementation" },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    expect(snapshot.content[0].text).toContain("before implementation");
    expect(snapshot.content[0].text).toContain("list shows working spec and deltas");
  });

  it("clears the active working spec", async () => {
    const tool = registeredTools().get("spec_gate")!;

    await tool.execute(
      "1",
      {
        action: "start",
        objective: "Add dynamic SDD",
        scope: ["spec_gate tool"],
        acceptanceCriteria: ["spec_gate is registered"],
        testStrategy: ["vitest covers tool behavior"],
      },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    await tool.execute("2", { action: "clear" }, undefined, undefined, { cwd: "/repo" });

    const listed = await tool.execute("3", { action: "list" }, undefined, undefined, { cwd: "/repo" });
    expect(listed.content[0].text).toContain("No active Working Spec.");
  });

  it("keeps deferred deltas out of the accepted working spec", async () => {
    const tool = registeredTools().get("spec_gate")!;

    await tool.execute(
      "1",
      {
        action: "start",
        objective: "Add dynamic SDD",
        scope: ["spec_gate tool"],
        acceptanceCriteria: ["spec_gate is registered"],
        testStrategy: ["vitest covers tool behavior"],
      },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    await tool.execute(
      "2",
      {
        action: "delta",
        delta: "Persist specs across sessions later.",
        deltaHandling: "deferred",
        scope: ["persistent spec history"],
      },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    const listed = await tool.execute("3", { action: "list" }, undefined, undefined, { cwd: "/repo" });
    expect(listed.content[0].text).toContain("Persist specs across sessions later.");
    expect(listed.content[0].text).not.toContain("Scope:\n- spec_gate tool\n- persistent spec history");
  });

  it("restores a persisted working spec after extension reload", async () => {
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
    const previousNodeEnv = process.env.NODE_ENV;
    const agentDir = await mkdtemp(join(tmpdir(), "choco-pi-sdd-persist-"));
    process.env.PI_CODING_AGENT_DIR = agentDir;
    process.env.NODE_ENV = "test";
    try {
      const firstTool = registeredTools().get("spec_gate")!;
      await firstTool.execute(
        "start",
        {
          action: "start",
          objective: "Persist SDD",
          scope: ["persisted spec"],
          acceptanceCriteria: ["reload restores spec"],
          testStrategy: ["vitest reload simulation"],
        },
        undefined,
        undefined,
        ctx("persist-session"),
      );

      const secondTool = registeredTools().get("spec_gate")!;
      const listed = await secondTool.execute("list", { action: "list" }, undefined, undefined, ctx("persist-session"));

      expect(listed.content[0].text).toContain("Persist SDD");
      expect(listed.content[0].text).toContain("reload restores spec");
    } finally {
      if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      await rm(agentDir, { recursive: true, force: true });
    }
  });

  it("keeps working specs isolated by Pi session id", async () => {
    const tool = registeredTools().get("spec_gate")!;

    await tool.execute(
      "a-start",
      {
        action: "start",
        objective: "Session A spec",
        scope: ["session A scope"],
        acceptanceCriteria: ["session A acceptance"],
        testStrategy: ["session A test"],
      },
      undefined,
      undefined,
      ctx("session-a"),
    );
    await tool.execute(
      "b-start",
      {
        action: "start",
        objective: "Session B spec",
        scope: ["session B scope"],
        acceptanceCriteria: ["session B acceptance"],
        testStrategy: ["session B test"],
      },
      undefined,
      undefined,
      ctx("session-b"),
    );

    const listedA = await tool.execute("a-list", { action: "list" }, undefined, undefined, ctx("session-a"));
    const listedB = await tool.execute("b-list", { action: "list" }, undefined, undefined, ctx("session-b"));

    expect(listedA.content[0].text).toContain("Session A spec");
    expect(listedA.content[0].text).not.toContain("Session B spec");
    expect(listedB.content[0].text).toContain("Session B spec");
    expect(listedB.content[0].text).not.toContain("Session A spec");
  });
});
