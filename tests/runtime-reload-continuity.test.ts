import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  claimReloadContinuityState,
  writeReloadContinuityState,
  type ReloadContinuityState,
} from "../extensions/choco-autopilot/runtime-reload";

let agentDir: string | undefined;

afterEach(async () => {
  if (agentDir) await rm(agentDir, { recursive: true, force: true });
  agentDir = undefined;
});

async function tempAgentDir(): Promise<string> {
  agentDir = await mkdtemp(join(tmpdir(), "choco-pi-reload-continuity-"));
  return agentDir;
}

function state(overrides: Partial<ReloadContinuityState> = {}): ReloadContinuityState {
  return {
    version: 1,
    sessionScopeKey: "scope-a",
    turnId: "turn-a",
    activeManifestGroupId: "group-a",
    activeLaneId: "lane-1",
    pendingStructuralGate: true,
    activeTodoIds: [1, 2],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("runtime reload continuity", () => {
  it("writes and claims fresh continuity state once", async () => {
    const dir = await tempAgentDir();
    await writeReloadContinuityState(state(), dir);

    const claimed = await claimReloadContinuityState("scope-a", dir);
    const second = await claimReloadContinuityState("scope-a", dir);

    expect(claimed?.activeManifestGroupId).toBe("group-a");
    expect(claimed?.activeTodoIds).toEqual([1, 2]);
    expect(second).toBeUndefined();
  });

  it("ignores expired or mismatched continuity markers", async () => {
    const dir = await tempAgentDir();
    await writeReloadContinuityState(state({ sessionScopeKey: "scope-a", createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() }), dir);

    expect(await claimReloadContinuityState("scope-a", dir, 1_000)).toBeUndefined();

    await writeReloadContinuityState(state({ sessionScopeKey: "scope-b" }), dir);
    expect(await claimReloadContinuityState("scope-a", dir)).toBeUndefined();
  });
});
