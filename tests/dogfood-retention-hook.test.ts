import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import chocoAutopilot from "../extensions/choco-autopilot/index";
import { createDogfoodStore, listDogfoodCases, writeDogfoodCase } from "../extensions/choco-autopilot/dogfood-store";
import type { DogfoodCase } from "../extensions/choco-autopilot/dogfood-types";

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown | Promise<unknown>;

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<string> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "choco-pi-dogfood-retention-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
  return tempAgentDir;
}

function setupHandlers(): Map<string, EventHandler[]> {
  const handlers = new Map<string, EventHandler[]>();
  chocoAutopilot({
    on: (event: string, handler: EventHandler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerCommand: vi.fn(),
    registerTool: vi.fn(),
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
    exec: vi.fn(),
    getFlag: vi.fn(),
  } as never);
  return handlers;
}

async function emitAll(handlers: Map<string, EventHandler[]>, eventName: string, event: Record<string, unknown>): Promise<void> {
  for (const handler of handlers.get(eventName) ?? []) await handler(event, { cwd: "/repo", hasUI: false, ui: {} });
}

function dogCase(id: string, startedAt: string): DogfoodCase {
  return {
    id,
    week: "2026-W20",
    startedAt,
    promptHash: `hash-${id}`,
    promptSummary: "coding task",
    cwdHash: "cwd",
    projectLabel: "repo",
    workMode: "default",
    executionIntensity: "standard",
    taskType: "coding",
    toolCounts: {},
    scope: { kind: "project", memoryMode: "auto", projectId: "repo", projectRootHash: "cwd", projectLabel: "repo", capture: true },
    flow: { toolSequence: [], commandSequence: [] },
    verification: { required: true, passed: true, failedCommands: [], passedCommands: ["pnpm run test"] },
    gates: { structuralRequired: true, structuralPassed: true, loopTransitions: 1, repairQueued: false },
    userSteeringSignals: [],
    outcome: "clean",
    outcomeConfidence: "High",
    ruleReasons: ["verification passed"],
  };
}

describe("dogfood retention hook", () => {
  it("cleans old detailed dogfood cases on session start", async () => {
    const agentDir = await useTempAgentDir();
    const store = createDogfoodStore(join(agentDir, "choco-pi", "dogfood"));
    await writeDogfoodCase(store, dogCase("old", "2000-01-01T00:00:00.000Z"));
    await writeDogfoodCase(store, dogCase("fresh", "2999-01-01T00:00:00.000Z"));

    const handlers = setupHandlers();
    await emitAll(handlers, "session_start", { type: "session_start", reason: "startup" });

    expect((await listDogfoodCases(store)).map((item) => item.id)).toEqual(["fresh"]);
  });
});
