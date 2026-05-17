import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadState, updateState } from "../extensions/choco-autopilot/index";

function autopilotIndexSource(): string {
  return readFileSync(join(process.cwd(), "extensions/choco-autopilot/index.ts"), "utf8");
}

let agentDir: string | undefined;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(async () => {
  if (agentDir) await rm(agentDir, { recursive: true, force: true });
  agentDir = undefined;
  delete process.env.PI_CODING_AGENT_DIR;
});

describe("choco-pi state persistence", () => {
  it("serializes and atomically renames choco state writes", () => {
    const source = autopilotIndexSource();
    const updateStateMatch = source.match(/export async function updateState[\s\S]*?\n}\n/);

    expect(updateStateMatch?.[0] ?? "").toContain("withFileLock");
    expect(updateStateMatch?.[0] ?? "").toContain("loadStateUnlocked");
    expect(source).toContain("rename(");
    expect(source).toContain(".tmp");
    expect(source).not.toContain("await saveState(state)");
  });

  it("keeps concurrent read-modify-write updates from losing state", async () => {
    agentDir = await mkdtemp(join(tmpdir(), "choco-pi-state-"));
    process.env.PI_CODING_AGENT_DIR = agentDir;

    await Promise.all([
      updateState(async (state) => {
        await sleep(20);
        state.sessions.sessionA = {
          effectiveWorkMode: "coding",
          automaticMode: true,
          executionIntensity: "standard",
          updatedAt: "2026-05-17T00:00:00.000Z",
        };
      }),
      updateState((state) => {
        state.ledgers.sessionB = {
          objective: "preserve ledger",
          assumptions: [],
          decisions: [],
          changedFiles: [],
          verifications: [],
          blockers: [],
          risks: [],
          nextActions: [],
          updatedAt: "2026-05-17T00:00:00.000Z",
        };
      }),
    ]);

    const state = await loadState();
    expect(state.sessions.sessionA?.effectiveWorkMode).toBe("coding");
    expect(state.ledgers.sessionB?.objective).toBe("preserve ledger");
  });
});
