import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendDogfoodEvent, cleanupDogfoodCaseRetention, createDogfoodStore, listDogfoodCases, readDogfoodQueue, writeDogfoodCase, writeDogfoodQueue } from "../extensions/ddotz-autopilot/dogfood-store";
import type { DogfoodCase } from "../extensions/ddotz-autopilot/dogfood-types";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

function makeCase(id: string, week = "2026-W20", startedAt = "2026-05-11T00:00:00.000Z"): DogfoodCase {
  return {
    id,
    week,
    startedAt,
    promptHash: `hash-${id}`,
    promptSummary: "coding task",
    cwdHash: "cwd",
    projectLabel: "repo",
    workMode: "default",
    executionIntensity: "standard",
    taskType: "coding",
    toolCounts: {},
    verification: { required: true, passed: true, failedCommands: [], passedCommands: ["pnpm run test"] },
    gates: { structuralRequired: true, structuralPassed: true, loopTransitions: 1, repairQueued: false },
    userSteeringSignals: [],
    outcome: "clean",
    outcomeConfidence: "High",
    ruleReasons: ["verification passed"],
  };
}

describe("dogfood store", () => {
  it("writes cases, lists them by week, appends events, and stores review queue", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "dogfood-store-"));
    const store = createDogfoodStore(tempDir);

    await writeDogfoodCase(store, makeCase("case-a"));
    await writeDogfoodCase(store, makeCase("case-b", "2026-W19"));
    await appendDogfoodEvent(store, { type: "case_started", caseId: "case-a", at: "2026-05-11T00:00:00.000Z" });
    await writeDogfoodQueue(store, [makeCase("case-review")]);

    expect((await listDogfoodCases(store, "2026-W20")).map((item) => item.id)).toEqual(["case-a"]);
    expect((await readDogfoodQueue(store)).map((item) => item.id)).toEqual(["case-review"]);

    const events = await readFile(join(tempDir, "events.jsonl"), "utf8");
    expect(events).toContain("case_started");
    expect(events).not.toContain("내 비밀");
  });

  it("removes detailed cases older than the retention window", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "dogfood-store-retention-"));
    const store = createDogfoodStore(tempDir);

    await writeDogfoodCase(store, makeCase("old", "2026-W01", "2026-01-01T00:00:00.000Z"));
    await writeDogfoodCase(store, makeCase("fresh", "2026-W20", "2026-05-11T00:00:00.000Z"));

    const removed = await cleanupDogfoodCaseRetention(store, new Date("2026-05-11T00:00:00.000Z"), 12);

    expect(removed).toBe(1);
    expect((await listDogfoodCases(store)).map((item) => item.id)).toEqual(["fresh"]);
  });
});
