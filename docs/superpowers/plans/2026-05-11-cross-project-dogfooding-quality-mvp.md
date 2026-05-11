# Cross-project Dogfooding Quality MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP for cross-project dogfooding quality capture, deterministic weekly scoring, privacy-preserving storage, and `/dogfood` reporting.

**Architecture:** Add focused dogfood modules under `extensions/ddotz-autopilot/` and keep hook wiring thin in `index.ts`. The MVP stores sanitized case metadata globally under `~/.pi/agent/ddotz-pi/dogfood/`, scores cases deterministically, and exposes `/dogfood status`, `/dogfood weekly`, `/dogfood report`, `/dogfood queue`, and `/dogfood explain <id>`.

**Tech Stack:** TypeScript, Pi extension hooks, Node `fs/promises`, Node `crypto`, Vitest, existing ddotz-pi command and hook test style.

---

## File structure

- Create `extensions/ddotz-autopilot/dogfood-types.ts`
  - Own shared dogfood TypeScript types and constants.
- Create `extensions/ddotz-autopilot/dogfood-privacy.ts`
  - Own salted hash creation, safe project labels, ISO week IDs, and prompt task classification without raw prompt persistence.
- Create `extensions/ddotz-autopilot/dogfood-scoring.ts`
  - Own deterministic `clean / assisted / miss / review` scoring and weekly repeated-pattern detection.
- Create `extensions/ddotz-autopilot/dogfood-store.ts`
  - Own global dogfood path layout, atomic JSON writes, JSONL events, case read/write, weekly reports, queue files, and 12-week retention cleanup.
- Create `extensions/ddotz-autopilot/dogfood-weekly.ts`
  - Own weekly aggregation, report formatting, and auto-improvement threshold decisions.
- Create `extensions/ddotz-autopilot/dogfood-collector.ts`
  - Own active case lifecycle helpers used by hooks.
- Modify `extensions/ddotz-autopilot/index.ts`
  - Wire collector calls into existing hooks and register `/dogfood` command.
- Create `tests/dogfood-privacy.test.ts`
- Create `tests/dogfood-scoring.test.ts`
- Create `tests/dogfood-store.test.ts`
- Create `tests/dogfood-weekly.test.ts`
- Create `tests/dogfood-commands.test.ts`
- Modify `README.md`
  - Add concise dogfood architecture and command documentation.

## Task 1: Privacy helpers and shared types

**Files:**
- Create: `extensions/ddotz-autopilot/dogfood-types.ts`
- Create: `extensions/ddotz-autopilot/dogfood-privacy.ts`
- Test: `tests/dogfood-privacy.test.ts`

- [ ] **Step 1: Write privacy tests**

Create `tests/dogfood-privacy.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { classifyPromptForDogfood, dogfoodHash, isoWeekId, safeProjectLabel } from "../extensions/ddotz-autopilot/dogfood-privacy";

const SALT = "0123456789abcdef0123456789abcdef";

describe("dogfood privacy helpers", () => {
  it("hashes prompts without returning raw prompt text", () => {
    const prompt = "내 비밀 토큰 sk-test-123을 쓰는 배포 스크립트 고쳐줘";
    const hash = dogfoodHash(prompt, SALT);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("sk-test-123");
    expect(hash).not.toContain(prompt);
    expect(dogfoodHash(prompt, SALT)).toBe(hash);
    expect(dogfoodHash(prompt, `${SALT}-other`)).not.toBe(hash);
  });

  it("creates stable ISO week ids", () => {
    expect(isoWeekId(new Date("2026-01-01T12:00:00Z"))).toBe("2026-W01");
    expect(isoWeekId(new Date("2026-05-11T00:00:00Z"))).toBe("2026-W20");
  });

  it("uses safe project labels instead of full paths", () => {
    expect(safeProjectLabel("/Users/hyuns/Code/ddotz-pi")).toBe("ddotz-pi");
    expect(safeProjectLabel("/")).toBe("root");
  });

  it("classifies task type without preserving prompt content", () => {
    expect(classifyPromptForDogfood("테스트 고치고 구현해줘")).toMatchObject({ taskType: "coding", summary: "coding task" });
    expect(classifyPromptForDogfood("외부 자료 리서치해서 분석해줘")).toMatchObject({ taskType: "research", summary: "research task" });
    expect(classifyPromptForDogfood("설계 문서 작성해줘")).toMatchObject({ taskType: "writing", summary: "writing task" });
  });
});
```

- [ ] **Step 2: Run the new test and confirm it fails**

Run:

```bash
pnpm vitest run tests/dogfood-privacy.test.ts
```

Expected: TypeScript module resolution fails because `dogfood-privacy.ts` does not exist.

- [ ] **Step 3: Add shared types**

Create `extensions/ddotz-autopilot/dogfood-types.ts` with:

```ts
export type DogfoodOutcome = "clean" | "assisted" | "miss" | "review";
export type DogfoodConfidence = "High" | "Medium" | "Low";

export interface DogfoodVerificationSignals {
  required: boolean;
  passed: boolean;
  failedCommands: string[];
  passedCommands: string[];
}

export interface DogfoodGateSignals {
  structuralRequired: boolean;
  structuralPassed: boolean;
  loopTransitions: number;
  repairQueued: boolean;
}

export interface DogfoodCase {
  id: string;
  week: string;
  startedAt: string;
  endedAt?: string;
  promptHash: string;
  promptSummary?: string;
  cwdHash?: string;
  projectLabel?: string;
  workMode: string;
  executionIntensity: string;
  taskType: string;
  model?: string;
  toolCounts: Record<string, number>;
  verification: DogfoodVerificationSignals;
  gates: DogfoodGateSignals;
  userSteeringSignals: string[];
  outcome: DogfoodOutcome;
  outcomeConfidence: DogfoodConfidence;
  ruleReasons: string[];
  judgeReason?: string;
  repeatedPatternKey?: string;
}

export interface DogfoodWeeklyPattern {
  key: string;
  outcome: Exclude<DogfoodOutcome, "clean" | "review">;
  count: number;
  sampleCaseIds: string[];
  reasons: string[];
}

export interface DogfoodWeeklyReport {
  week: string;
  generatedAt: string;
  eligibleCases: number;
  clean: number;
  assisted: number;
  miss: number;
  review: number;
  cleanHitRate: number;
  assistedRate: number;
  missRate: number;
  reviewRate: number;
  repeatedPatterns: DogfoodWeeklyPattern[];
  autoImprovementAllowed: boolean;
  autoImprovementReason: string;
}

export const DOGFOOD_DETAIL_RETENTION_WEEKS = 12;
export const DOGFOOD_MIN_WEEKLY_CASES = 25;
export const DOGFOOD_MIN_REPEATED_PATTERN_COUNT = 3;
```

- [ ] **Step 4: Add privacy helper implementation**

Create `extensions/ddotz-autopilot/dogfood-privacy.ts` with:

```ts
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";

export function dogfoodHash(value: string, salt: string): string {
  return createHash("sha256").update(salt).update("\0").update(value).digest("hex");
}

export function safeProjectLabel(cwd: string): string {
  const resolved = resolve(cwd || process.cwd());
  const name = basename(resolved);
  return name || "root";
}

export function isoWeekId(date = new Date()): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function classifyPromptForDogfood(prompt: string): { taskType: string; summary: string } {
  const text = prompt.toLowerCase();
  if (/구현|수정|고쳐|버그|테스트|build|fix|code|lint|typecheck/.test(text)) return { taskType: "coding", summary: "coding task" };
  if (/리서치|검색|외부|자료|분석|research|web|source|url|https?:\/\//.test(text)) return { taskType: "research", summary: "research task" };
  if (/문서|보고서|정리|작성|글|스펙|design|spec|report|write/.test(text)) return { taskType: "writing", summary: "writing task" };
  if (/검토|리뷰|review|audit/.test(text)) return { taskType: "review", summary: "review task" };
  return { taskType: "general", summary: "general task" };
}
```

- [ ] **Step 5: Verify privacy tests pass**

Run:

```bash
pnpm vitest run tests/dogfood-privacy.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add extensions/ddotz-autopilot/dogfood-types.ts extensions/ddotz-autopilot/dogfood-privacy.ts tests/dogfood-privacy.test.ts
git commit -m "feat: add dogfood privacy helpers"
```

## Task 2: Deterministic scoring

**Files:**
- Create: `extensions/ddotz-autopilot/dogfood-scoring.ts`
- Test: `tests/dogfood-scoring.test.ts`

- [ ] **Step 1: Write scoring tests**

Create `tests/dogfood-scoring.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { scoreDogfoodCase, repeatedDogfoodPatterns } from "../extensions/ddotz-autopilot/dogfood-scoring";
import type { DogfoodCase } from "../extensions/ddotz-autopilot/dogfood-types";

function baseCase(overrides: Partial<DogfoodCase> = {}): DogfoodCase {
  return {
    id: "case-1",
    week: "2026-W20",
    startedAt: "2026-05-11T00:00:00.000Z",
    promptHash: "abc",
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
    outcome: "review",
    outcomeConfidence: "Low",
    ruleReasons: [],
    ...overrides,
  };
}

describe("dogfood scoring", () => {
  it("scores a verified gate-passing case as clean", () => {
    const scored = scoreDogfoodCase(baseCase());
    expect(scored.outcome).toBe("clean");
    expect(scored.outcomeConfidence).toBe("High");
    expect(scored.ruleReasons).toContain("verification passed");
    expect(scored.ruleReasons).toContain("required structural gate passed");
  });

  it("scores recovered repair or failed-then-passed verification as assisted", () => {
    const scored = scoreDogfoodCase(baseCase({
      gates: { structuralRequired: true, structuralPassed: true, loopTransitions: 1, repairQueued: true },
      verification: { required: true, passed: true, failedCommands: ["pnpm run test"], passedCommands: ["pnpm run test"] },
    }));
    expect(scored.outcome).toBe("assisted");
    expect(scored.repeatedPatternKey).toBe("coding:repair-or-recovery");
  });

  it("scores failed verification or failed required gate as miss", () => {
    const scored = scoreDogfoodCase(baseCase({
      verification: { required: true, passed: false, failedCommands: ["pnpm run test"], passedCommands: [] },
      gates: { structuralRequired: true, structuralPassed: false, loopTransitions: 0, repairQueued: false },
    }));
    expect(scored.outcome).toBe("miss");
    expect(scored.outcomeConfidence).toBe("High");
    expect(scored.repeatedPatternKey).toBe("coding:verification-or-gate-failed");
  });

  it("keeps unclear cases in review", () => {
    const scored = scoreDogfoodCase(baseCase({
      verification: { required: false, passed: false, failedCommands: [], passedCommands: [] },
      gates: { structuralRequired: false, structuralPassed: false, loopTransitions: 0, repairQueued: false },
    }));
    expect(scored.outcome).toBe("review");
    expect(scored.outcomeConfidence).toBe("Medium");
  });

  it("detects repeated assisted and miss patterns", () => {
    const cases = [
      scoreDogfoodCase(baseCase({ id: "a", taskType: "coding", gates: { structuralRequired: true, structuralPassed: true, loopTransitions: 1, repairQueued: true } })),
      scoreDogfoodCase(baseCase({ id: "b", taskType: "coding", gates: { structuralRequired: true, structuralPassed: true, loopTransitions: 1, repairQueued: true } })),
      scoreDogfoodCase(baseCase({ id: "c", taskType: "coding", gates: { structuralRequired: true, structuralPassed: true, loopTransitions: 1, repairQueued: true } })),
    ];
    expect(repeatedDogfoodPatterns(cases, 3)).toEqual([
      expect.objectContaining({ key: "coding:repair-or-recovery", outcome: "assisted", count: 3 }),
    ]);
  });
});
```

- [ ] **Step 2: Run the scoring test and confirm it fails**

Run:

```bash
pnpm vitest run tests/dogfood-scoring.test.ts
```

Expected: module resolution fails because `dogfood-scoring.ts` does not exist.

- [ ] **Step 3: Implement scoring**

Create `extensions/ddotz-autopilot/dogfood-scoring.ts` with:

```ts
import type { DogfoodCase, DogfoodWeeklyPattern } from "./dogfood-types";

export function scoreDogfoodCase(input: DogfoodCase): DogfoodCase {
  const reasons: string[] = [];
  let outcome: DogfoodCase["outcome"] = "review";
  let confidence: DogfoodCase["outcomeConfidence"] = "Medium";
  let repeatedPatternKey: string | undefined;

  if (input.verification.required && input.verification.passed) reasons.push("verification passed");
  if (input.gates.structuralRequired && input.gates.structuralPassed) reasons.push("required structural gate passed");

  const failedVerification = input.verification.required && !input.verification.passed;
  const failedGate = input.gates.structuralRequired && !input.gates.structuralPassed;
  if (failedVerification || failedGate) {
    outcome = "miss";
    confidence = "High";
    repeatedPatternKey = `${input.taskType}:verification-or-gate-failed`;
    if (failedVerification) reasons.push("required verification failed");
    if (failedGate) reasons.push("required structural gate failed");
  } else if (input.gates.repairQueued || input.verification.failedCommands.length > 0 || input.userSteeringSignals.length > 0) {
    outcome = "assisted";
    confidence = "High";
    repeatedPatternKey = `${input.taskType}:repair-or-recovery`;
    if (input.gates.repairQueued) reasons.push("internal repair was needed");
    if (input.verification.failedCommands.length > 0) reasons.push("verification recovered after failure");
    if (input.userSteeringSignals.length > 0) reasons.push("user steering was needed");
  } else if ((input.verification.required ? input.verification.passed : true) && (input.gates.structuralRequired ? input.gates.structuralPassed : true)) {
    outcome = input.verification.required || input.gates.structuralRequired ? "clean" : "review";
    confidence = outcome === "clean" ? "High" : "Medium";
    if (outcome === "clean") reasons.push("no repair or steering signals detected");
    if (outcome === "review") reasons.push("no strong automatic outcome signal");
  }

  return { ...input, outcome, outcomeConfidence: confidence, ruleReasons: reasons, repeatedPatternKey };
}

export function repeatedDogfoodPatterns(cases: DogfoodCase[], minimumCount: number): DogfoodWeeklyPattern[] {
  const grouped = new Map<string, DogfoodCase[]>();
  for (const item of cases) {
    if ((item.outcome !== "assisted" && item.outcome !== "miss") || !item.repeatedPatternKey) continue;
    grouped.set(item.repeatedPatternKey, [...(grouped.get(item.repeatedPatternKey) ?? []), item]);
  }

  return [...grouped.entries()]
    .filter(([, items]) => items.length >= minimumCount)
    .map(([key, items]) => ({
      key,
      outcome: items.some((item) => item.outcome === "miss") ? "miss" : "assisted",
      count: items.length,
      sampleCaseIds: items.slice(0, 5).map((item) => item.id),
      reasons: Array.from(new Set(items.flatMap((item) => item.ruleReasons))).slice(0, 8),
    }));
}
```

- [ ] **Step 4: Verify scoring tests pass**

Run:

```bash
pnpm vitest run tests/dogfood-scoring.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add extensions/ddotz-autopilot/dogfood-scoring.ts tests/dogfood-scoring.test.ts
git commit -m "feat: score dogfood quality cases"
```

## Task 3: Store, retention, and weekly aggregation

**Files:**
- Create: `extensions/ddotz-autopilot/dogfood-store.ts`
- Create: `extensions/ddotz-autopilot/dogfood-weekly.ts`
- Test: `tests/dogfood-store.test.ts`
- Test: `tests/dogfood-weekly.test.ts`

- [ ] **Step 1: Write store tests**

Create `tests/dogfood-store.test.ts` with:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendDogfoodEvent, createDogfoodStore, listDogfoodCases, readDogfoodQueue, writeDogfoodCase, writeDogfoodQueue } from "../extensions/ddotz-autopilot/dogfood-store";
import type { DogfoodCase } from "../extensions/ddotz-autopilot/dogfood-types";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

function makeCase(id: string, week = "2026-W20"): DogfoodCase {
  return {
    id,
    week,
    startedAt: "2026-05-11T00:00:00.000Z",
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
});
```

- [ ] **Step 2: Write weekly aggregation tests**

Create `tests/dogfood-weekly.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { buildDogfoodWeeklyReport, formatDogfoodWeeklyReport } from "../extensions/ddotz-autopilot/dogfood-weekly";
import type { DogfoodCase } from "../extensions/ddotz-autopilot/dogfood-types";

function dogCase(id: string, outcome: DogfoodCase["outcome"], pattern?: string): DogfoodCase {
  return {
    id,
    week: "2026-W20",
    startedAt: "2026-05-11T00:00:00.000Z",
    promptHash: id,
    promptSummary: "coding task",
    cwdHash: "cwd",
    projectLabel: "repo",
    workMode: "default",
    executionIntensity: "standard",
    taskType: "coding",
    toolCounts: {},
    verification: { required: true, passed: outcome !== "miss", failedCommands: outcome === "miss" ? ["pnpm run test"] : [], passedCommands: outcome !== "miss" ? ["pnpm run test"] : [] },
    gates: { structuralRequired: true, structuralPassed: outcome !== "miss", loopTransitions: 1, repairQueued: outcome === "assisted" },
    userSteeringSignals: [],
    outcome,
    outcomeConfidence: "High",
    ruleReasons: [outcome],
    repeatedPatternKey: pattern,
  };
}

describe("dogfood weekly report", () => {
  it("computes rates and blocks auto-improvement below sample threshold", () => {
    const report = buildDogfoodWeeklyReport("2026-W20", [dogCase("a", "clean"), dogCase("b", "assisted", "coding:repair-or-recovery")], new Date("2026-05-11T00:00:00Z"));
    expect(report.cleanHitRate).toBe(0.5);
    expect(report.autoImprovementAllowed).toBe(false);
    expect(report.autoImprovementReason).toContain("25 eligible cases");
  });

  it("allows auto-improvement when sample and repeated pattern thresholds pass", () => {
    const cases = Array.from({ length: 22 }, (_, index) => dogCase(`clean-${index}`, "clean"));
    cases.push(dogCase("a", "assisted", "coding:repair-or-recovery"));
    cases.push(dogCase("b", "assisted", "coding:repair-or-recovery"));
    cases.push(dogCase("c", "assisted", "coding:repair-or-recovery"));

    const report = buildDogfoodWeeklyReport("2026-W20", cases, new Date("2026-05-11T00:00:00Z"));
    expect(report.eligibleCases).toBe(25);
    expect(report.autoImprovementAllowed).toBe(true);
    expect(report.repeatedPatterns[0]).toMatchObject({ key: "coding:repair-or-recovery", count: 3 });
    expect(formatDogfoodWeeklyReport(report)).toContain("clean hit rate: 88.0%");
  });
});
```

- [ ] **Step 3: Run store and weekly tests and confirm they fail**

Run:

```bash
pnpm vitest run tests/dogfood-store.test.ts tests/dogfood-weekly.test.ts
```

Expected: module resolution fails because `dogfood-store.ts` and `dogfood-weekly.ts` do not exist.

- [ ] **Step 4: Implement the store**

Create `extensions/ddotz-autopilot/dogfood-store.ts` with:

```ts
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DogfoodCase, DogfoodWeeklyReport } from "./dogfood-types";

export interface DogfoodStore {
  root: string;
  casesDir: string;
  weeklyDir: string;
  eventsPath: string;
  queuePath: string;
}

export function createDogfoodStore(root: string): DogfoodStore {
  return {
    root,
    casesDir: join(root, "cases"),
    weeklyDir: join(root, "weekly"),
    eventsPath: join(root, "events.jsonl"),
    queuePath: join(root, "review-queue.json"),
  };
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, path);
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeDogfoodCase(store: DogfoodStore, dogfoodCase: DogfoodCase): Promise<void> {
  await mkdir(store.casesDir, { recursive: true });
  await writeJsonAtomic(join(store.casesDir, `${dogfoodCase.id}.json`), dogfoodCase);
}

export async function listDogfoodCases(store: DogfoodStore, week?: string): Promise<DogfoodCase[]> {
  try {
    const files = (await readdir(store.casesDir)).filter((file) => file.endsWith(".json"));
    const cases = await Promise.all(files.map((file) => readJson<DogfoodCase>(join(store.casesDir, file), undefined as never)));
    return cases.filter((item) => !week || item.week === week).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function appendDogfoodEvent(store: DogfoodStore, event: Record<string, unknown>): Promise<void> {
  await mkdir(store.root, { recursive: true });
  await appendFile(store.eventsPath, `${JSON.stringify(event)}\n`, "utf8");
}

export async function readDogfoodQueue(store: DogfoodStore): Promise<DogfoodCase[]> {
  return readJson<DogfoodCase[]>(store.queuePath, []);
}

export async function writeDogfoodQueue(store: DogfoodStore, cases: DogfoodCase[]): Promise<void> {
  await writeJsonAtomic(store.queuePath, cases);
}

export async function writeDogfoodWeeklyReport(store: DogfoodStore, report: DogfoodWeeklyReport): Promise<void> {
  await mkdir(store.weeklyDir, { recursive: true });
  await writeJsonAtomic(join(store.weeklyDir, `${report.week}.json`), report);
}

export async function readDogfoodWeeklyReport(store: DogfoodStore, week: string): Promise<DogfoodWeeklyReport | undefined> {
  return readJson<DogfoodWeeklyReport | undefined>(join(store.weeklyDir, `${week}.json`), undefined);
}
```

- [ ] **Step 5: Implement weekly aggregation**

Create `extensions/ddotz-autopilot/dogfood-weekly.ts` with:

```ts
import { DOGFOOD_MIN_REPEATED_PATTERN_COUNT, DOGFOOD_MIN_WEEKLY_CASES, type DogfoodCase, type DogfoodWeeklyReport } from "./dogfood-types";
import { repeatedDogfoodPatterns } from "./dogfood-scoring";

function roundRate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function buildDogfoodWeeklyReport(week: string, cases: DogfoodCase[], generatedAt = new Date()): DogfoodWeeklyReport {
  const eligibleCases = cases.length;
  const clean = cases.filter((item) => item.outcome === "clean").length;
  const assisted = cases.filter((item) => item.outcome === "assisted").length;
  const miss = cases.filter((item) => item.outcome === "miss").length;
  const review = cases.filter((item) => item.outcome === "review").length;
  const repeatedPatterns = repeatedDogfoodPatterns(cases, DOGFOOD_MIN_REPEATED_PATTERN_COUNT);
  const sampleOk = eligibleCases >= DOGFOOD_MIN_WEEKLY_CASES;
  const patternOk = repeatedPatterns.length > 0;

  return {
    week,
    generatedAt: generatedAt.toISOString(),
    eligibleCases,
    clean,
    assisted,
    miss,
    review,
    cleanHitRate: eligibleCases ? roundRate(clean / eligibleCases) : 0,
    assistedRate: eligibleCases ? roundRate(assisted / eligibleCases) : 0,
    missRate: eligibleCases ? roundRate(miss / eligibleCases) : 0,
    reviewRate: eligibleCases ? roundRate(review / eligibleCases) : 0,
    repeatedPatterns,
    autoImprovementAllowed: sampleOk && patternOk,
    autoImprovementReason: !sampleOk
      ? `Need at least ${DOGFOOD_MIN_WEEKLY_CASES} eligible cases before auto-improvement.`
      : !patternOk
        ? `Need at least ${DOGFOOD_MIN_REPEATED_PATTERN_COUNT} repeated assisted/miss cases for the same pattern.`
        : "Minimum sample and repeated-pattern thresholds passed.",
  };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatDogfoodWeeklyReport(report: DogfoodWeeklyReport): string {
  const patternLines = report.repeatedPatterns.length === 0
    ? ["- repeated patterns: none"]
    : report.repeatedPatterns.map((item) => `- ${item.key}: ${item.count} ${item.outcome} case(s)`);

  return [
    `Dogfood weekly report ${report.week}`,
    `- eligible cases: ${report.eligibleCases}`,
    `- clean hit rate: ${pct(report.cleanHitRate)}`,
    `- assisted: ${pct(report.assistedRate)}`,
    `- miss: ${pct(report.missRate)}`,
    `- review: ${pct(report.reviewRate)}`,
    `- auto-improvement: ${report.autoImprovementAllowed ? "allowed" : "blocked"} — ${report.autoImprovementReason}`,
    ...patternLines,
  ].join("\n");
}
```

- [ ] **Step 6: Verify store and weekly tests pass**

Run:

```bash
pnpm vitest run tests/dogfood-store.test.ts tests/dogfood-weekly.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add extensions/ddotz-autopilot/dogfood-store.ts extensions/ddotz-autopilot/dogfood-weekly.ts tests/dogfood-store.test.ts tests/dogfood-weekly.test.ts
git commit -m "feat: store dogfood cases and weekly reports"
```

## Task 4: Hook collector and `/dogfood` commands

**Files:**
- Create: `extensions/ddotz-autopilot/dogfood-collector.ts`
- Modify: `extensions/ddotz-autopilot/index.ts`
- Test: `tests/dogfood-commands.test.ts`

- [ ] **Step 1: Write command and hook integration tests**

Create `tests/dogfood-commands.test.ts` with:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import ddotzAutopilot from "../extensions/ddotz-autopilot/index";

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown | Promise<unknown>;

interface RegisteredCommand {
  handler: (args: string, ctx: { cwd: string; ui: { notify: ReturnType<typeof vi.fn> } }) => Promise<void>;
}

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<void> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "ddotz-pi-dogfood-test-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
}

function setupAutopilot(): { handlers: Map<string, EventHandler[]>; commands: Map<string, RegisteredCommand> } {
  const handlers = new Map<string, EventHandler[]>();
  const commands = new Map<string, RegisteredCommand>();
  ddotzAutopilot({
    on: (event: string, handler: EventHandler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerCommand: (name: string, definition: RegisteredCommand) => {
      commands.set(name, definition);
    },
    registerTool: vi.fn(),
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
    exec: vi.fn(),
    getFlag: vi.fn(),
  } as never);
  return { handlers, commands };
}

async function emitAll(handlers: Map<string, EventHandler[]>, eventName: string, event: Record<string, unknown>, cwd = "/Users/hyuns/Code/example"): Promise<void> {
  for (const handler of handlers.get(eventName) ?? []) await handler(event, { cwd, hasUI: false, ui: {} });
}

describe("dogfood commands and hook capture", () => {
  it("registers /dogfood and captures a clean cross-project case without raw prompt text", async () => {
    await useTempAgentDir();
    const { handlers, commands } = setupAutopilot();
    const notify = vi.fn();
    const prompt = "비밀 토큰 sk-test-123은 저장하지 말고 테스트를 고쳐줘";

    expect(commands.has("dogfood")).toBe(true);

    await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt, systemPrompt: "base", systemPromptOptions: {} });
    await emitAll(handlers, "tool_call", { type: "tool_call", toolCallId: "bash-1", toolName: "bash", input: { command: "pnpm run test" } });
    await emitAll(handlers, "tool_result", { type: "tool_result", toolCallId: "bash-1", toolName: "bash", input: { command: "pnpm run test" }, isError: false, content: [{ type: "text", text: "Tests passed" }], details: {} });
    await emitAll(handlers, "tool_result", { type: "tool_result", toolCallId: "gate-1", toolName: "structural_gate", input: {}, isError: false, content: [{ type: "text", text: "Structural gate passed." }], details: { ok: true } });
    await emitAll(handlers, "message_end", { type: "message_end", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "완료했습니다." }], provider: "test", model: "test-model" } });

    await commands.get("dogfood")!.handler("weekly", { cwd: "/Users/hyuns/Code/example", ui: { notify } });

    const output = notify.mock.calls.at(-1)?.[0] as string;
    expect(output).toContain("Dogfood weekly report");
    expect(output).toContain("eligible cases: 1");
    expect(output).toContain("clean hit rate: 100.0%");
    expect(output).not.toContain("sk-test-123");
    expect(output).not.toContain(prompt);
  });

  it("reports status and review queue", async () => {
    await useTempAgentDir();
    const { commands } = setupAutopilot();
    const notify = vi.fn();

    await commands.get("dogfood")!.handler("status", { cwd: "/repo", ui: { notify } });
    await commands.get("dogfood")!.handler("queue", { cwd: "/repo", ui: { notify } });

    expect(notify.mock.calls[0][0]).toContain("dogfood status");
    expect(notify.mock.calls[1][0]).toContain("review queue: 0");
  });
});
```

- [ ] **Step 2: Run command tests and confirm they fail**

Run:

```bash
pnpm vitest run tests/dogfood-commands.test.ts
```

Expected: `/dogfood` command is not registered and dogfood collector modules do not exist.

- [ ] **Step 3: Implement collector**

Create `extensions/ddotz-autopilot/dogfood-collector.ts` with:

```ts
import { randomUUID } from "node:crypto";
import type { DogfoodCase } from "./dogfood-types";
import { classifyPromptForDogfood, dogfoodHash, isoWeekId, safeProjectLabel } from "./dogfood-privacy";
import { scoreDogfoodCase } from "./dogfood-scoring";
import type { DogfoodStore } from "./dogfood-store";
import { appendDogfoodEvent, writeDogfoodCase } from "./dogfood-store";

export interface ActiveDogfoodCaseState {
  current?: DogfoodCase;
}

export function createActiveDogfoodCaseState(): ActiveDogfoodCaseState {
  return {};
}

function commandFromInput(input: unknown): string | undefined {
  const value = input && typeof input === "object" ? (input as { command?: unknown }).command : undefined;
  return typeof value === "string" ? value.trim() : undefined;
}

function isVerificationCommand(command: string | undefined): command is string {
  if (!command) return false;
  return /\b(pnpm|npm|yarn)\s+(run\s+)?(check|test|lint|typecheck|version:check)\b/i.test(command) || /\b(vitest|pytest|tsc|eslint|oxlint)\b/i.test(command);
}

export async function startDogfoodCase(state: ActiveDogfoodCaseState, store: DogfoodStore, input: {
  prompt: string;
  cwd: string;
  salt: string;
  workMode: string;
  executionIntensity: string;
  model?: string;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const classified = classifyPromptForDogfood(input.prompt);
  state.current = {
    id: randomUUID(),
    week: isoWeekId(now),
    startedAt: now.toISOString(),
    promptHash: dogfoodHash(input.prompt, input.salt),
    promptSummary: classified.summary,
    cwdHash: dogfoodHash(input.cwd, input.salt),
    projectLabel: safeProjectLabel(input.cwd),
    workMode: input.workMode,
    executionIntensity: input.executionIntensity,
    model: input.model,
    taskType: classified.taskType,
    toolCounts: {},
    verification: { required: false, passed: false, failedCommands: [], passedCommands: [] },
    gates: { structuralRequired: false, structuralPassed: false, loopTransitions: 0, repairQueued: false },
    userSteeringSignals: [],
    outcome: "review",
    outcomeConfidence: "Low",
    ruleReasons: [],
  };
  await appendDogfoodEvent(store, { type: "case_started", caseId: state.current.id, at: state.current.startedAt, week: state.current.week });
}

export function recordDogfoodToolCall(state: ActiveDogfoodCaseState, toolName: string): void {
  const current = state.current;
  if (!current) return;
  current.toolCounts[toolName] = (current.toolCounts[toolName] ?? 0) + 1;
  if (toolName === "structural_gate") current.gates.structuralRequired = true;
  if (toolName === "loop_transition") current.gates.loopTransitions += 1;
}

export function recordDogfoodToolResult(state: ActiveDogfoodCaseState, event: { toolName: string; input?: unknown; isError?: boolean; details?: unknown; content?: unknown }): void {
  const current = state.current;
  if (!current) return;
  if (event.toolName === "bash") {
    const command = commandFromInput(event.input);
    if (isVerificationCommand(command)) {
      current.verification.required = true;
      if (event.isError) current.verification.failedCommands.push(command);
      else current.verification.passedCommands.push(command);
      current.verification.passed = current.verification.passedCommands.length > 0 && current.verification.failedCommands.length === 0;
      if (current.verification.failedCommands.length > 0 && current.verification.passedCommands.length > 0) current.verification.passed = true;
    }
  }
  if (event.toolName === "structural_gate") {
    current.gates.structuralRequired = true;
    const details = event.details && typeof event.details === "object" ? event.details as { ok?: unknown } : {};
    current.gates.structuralPassed = details.ok === true || (Array.isArray(event.content) && JSON.stringify(event.content).includes("Structural gate passed"));
  }
}

export async function finishDogfoodCase(state: ActiveDogfoodCaseState, store: DogfoodStore, now = new Date()): Promise<DogfoodCase | undefined> {
  const current = state.current;
  if (!current) return undefined;
  if (current.endedAt) return current;
  const scored = scoreDogfoodCase({ ...current, endedAt: now.toISOString() });
  state.current = scored;
  await writeDogfoodCase(store, scored);
  await appendDogfoodEvent(store, { type: "case_finished", caseId: scored.id, at: scored.endedAt, outcome: scored.outcome });
  return scored;
}
```

- [ ] **Step 4: Wire hooks and command in `index.ts`**

Modify `extensions/ddotz-autopilot/index.ts`:

1. Add imports near other local imports:

```ts
import { createActiveDogfoodCaseState, finishDogfoodCase, recordDogfoodToolCall, recordDogfoodToolResult, startDogfoodCase } from "./dogfood-collector";
import { createDogfoodStore, listDogfoodCases, readDogfoodQueue, readDogfoodWeeklyReport, writeDogfoodWeeklyReport } from "./dogfood-store";
import { isoWeekId } from "./dogfood-privacy";
import { buildDogfoodWeeklyReport, formatDogfoodWeeklyReport } from "./dogfood-weekly";
```

2. Add helpers after `statePath()`:

```ts
function dogfoodRootPath(): string {
  return join(agentDir(), "ddotz-pi", "dogfood");
}

function dogfoodSaltPath(): string {
  return join(agentDir(), "ddotz-pi", "dogfood", "salt");
}

async function dogfoodSalt(): Promise<string> {
  try {
    return (await readFile(dogfoodSaltPath(), "utf8")).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const salt = randomUUID();
    await mkdir(join(agentDir(), "ddotz-pi", "dogfood"), { recursive: true });
    await writeFile(dogfoodSaltPath(), `${salt}\n`, "utf8");
    return salt;
  }
}
```

Also add `import { randomUUID } from "node:crypto";` near Node imports.

3. Add a module-level state inside `ddotzAutopilot` before hooks:

```ts
const dogfoodCases = createActiveDogfoodCaseState();
```

4. In `before_agent_start`, after `const state = await loadState();` and before the return, start the dogfood case:

```ts
const dogfoodStore = createDogfoodStore(dogfoodRootPath());
await startDogfoodCase(dogfoodCases, dogfoodStore, {
  prompt: event.prompt ?? "",
  cwd,
  salt: await dogfoodSalt(),
  workMode,
  executionIntensity,
});
```

5. In `tool_call`, after approval boundary and before ledger update, record the tool call:

```ts
recordDogfoodToolCall(dogfoodCases, event.toolName);
```

6. In `tool_result`, before `updateLedgerForToolResult`, record the tool result:

```ts
recordDogfoodToolResult(dogfoodCases, event);
```

7. In the `message_end` handler, before web/adoption guard processing returns final result, close only final assistant messages:

```ts
if (event.message.role === "assistant" && event.message.stopReason !== "toolUse" && event.message.stopReason !== "error" && event.message.stopReason !== "aborted") {
  await finishDogfoodCase(dogfoodCases, createDogfoodStore(dogfoodRootPath()));
}
```

8. Register `/dogfood` near other commands:

```ts
pi.registerCommand("dogfood", {
  description: "Show cross-project dogfooding quality status and weekly reports",
  handler: async (args: string, ctx: ExtensionCommandContext) => {
    const store = createDogfoodStore(dogfoodRootPath());
    const [command = "status", ...rest] = args.trim().split(/\s+/).filter(Boolean);
    const week = rest[0] && /^\d{4}-W\d{2}$/.test(rest[0]) ? rest[0] : isoWeekId(new Date());

    if (command === "status") {
      const cases = await listDogfoodCases(store, week);
      const latest = await readDogfoodWeeklyReport(store, week);
      ctx.ui.notify(`dogfood status ${week}: ${cases.length}/25 cases, latest report: ${latest ? "yes" : "no"}`, "info");
      return;
    }

    if (command === "weekly") {
      const cases = await listDogfoodCases(store, week);
      const report = buildDogfoodWeeklyReport(week, cases);
      await writeDogfoodWeeklyReport(store, report);
      ctx.ui.notify(formatDogfoodWeeklyReport(report), "info");
      return;
    }

    if (command === "report") {
      const report = await readDogfoodWeeklyReport(store, week);
      ctx.ui.notify(report ? formatDogfoodWeeklyReport(report) : `No dogfood weekly report for ${week}. Run /dogfood weekly ${week}.`, "info");
      return;
    }

    if (command === "queue") {
      const queue = await readDogfoodQueue(store);
      ctx.ui.notify(`review queue: ${queue.length}`, "info");
      return;
    }

    if (command === "explain") {
      const [id] = rest;
      const cases = await listDogfoodCases(store);
      const found = cases.find((item) => item.id === id);
      ctx.ui.notify(found ? `${found.id}: ${found.outcome} (${found.outcomeConfidence}) — ${found.ruleReasons.join(", ")}` : `No dogfood case found for id: ${id ?? ""}`, "info");
      return;
    }

    ctx.ui.notify("Usage: /dogfood [status|weekly|report|queue|explain <id>] [YYYY-WW]", "error");
  },
});
```

- [ ] **Step 5: Verify command tests pass**

Run:

```bash
pnpm vitest run tests/dogfood-commands.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit Task 4**

Run:

```bash
git add extensions/ddotz-autopilot/index.ts extensions/ddotz-autopilot/dogfood-collector.ts tests/dogfood-commands.test.ts
git commit -m "feat: capture dogfood cases from pi hooks"
```

## Task 5: Documentation and quality gate

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README dogfood section**

Add this subsection under the architecture area after Context ledger, memory, and source registry:

```md
### Dogfooding quality system

`ddotz-pi` records privacy-preserving cross-project quality cases under `~/.pi/agent/ddotz-pi/dogfood/`. It does not store raw prompt text by default. Each case stores a salted prompt hash, safe project label, work mode, task type, tool counts, verification signals, structural gate signals, and a deterministic `clean / assisted / miss / review` outcome.

Use `/dogfood status` to see the current week sample count, `/dogfood weekly` to generate a deterministic weekly report, `/dogfood report` to show the latest report, `/dogfood queue` to inspect ambiguous cases, and `/dogfood explain <id>` to explain a case without raw prompt text.

Auto-improvement requires at least 25 eligible weekly cases and at least 3 repeated assisted/miss cases for the same pattern. The MVP does not run hidden background LLM judging or store raw prompt/tool output.
```

- [ ] **Step 2: Run the focused dogfood test suite**

Run:

```bash
pnpm vitest run tests/dogfood-privacy.test.ts tests/dogfood-scoring.test.ts tests/dogfood-store.test.ts tests/dogfood-weekly.test.ts tests/dogfood-commands.test.ts
```

Expected: all focused dogfood tests pass.

- [ ] **Step 3: Run default quality gate**

Run:

```bash
pnpm run version:check && pnpm run lint && pnpm run typecheck && pnpm run test
```

Expected: version sync OK, lint passes with 0 warnings/errors, typecheck passes, all Vitest tests pass.

- [ ] **Step 4: Reload Pi runtime**

Run the Pi reload tool after extension changes:

```text
reload_runtime
```

Expected: direct reload succeeds or tmux self-input queues `/reload-runtime --continue` and the reloaded runtime resumes automatically.

- [ ] **Step 5: Manual dogfood smoke test**

Run in Pi after reload:

```text
/dogfood status
/dogfood weekly
/dogfood report
```

Expected: commands return a current-week status, generate a report, and show the generated report without raw prompt text.

- [ ] **Step 6: Commit and push Task 5**

Run:

```bash
git add README.md
git commit -m "docs: document dogfood quality commands"
git push
```

## Final verification checklist

- [ ] `pnpm run version:check && pnpm run lint && pnpm run typecheck && pnpm run test` passes.
- [ ] `/dogfood status`, `/dogfood weekly`, and `/dogfood report` work after runtime reload.
- [ ] New dogfood files do not store raw prompt text in tests or reports.
- [ ] New dogfood state lives under `~/.pi/agent/ddotz-pi/dogfood/`.
- [ ] Structural gate passes before final reporting.
