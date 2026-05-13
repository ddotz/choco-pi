# Self-Improvement Control Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first development slice for choco-pi self-improvement: project-scoped capture control, memory-mode gating, sanitized flow signatures, and weekly reporting hooks that make later automatic skill generation safe.

**Architecture:** Extend the existing dogfood MVP instead of adding a separate telemetry system. A new `improvement-scope` module resolves `off | readonly | manual | auto` behavior and project/personal/scratch/off scope. Existing dogfood case collection records only sanitized tool/command flow metadata and refuses automatic capture outside a Git-root project unless an explicit profile/mode enables it.

**Tech Stack:** TypeScript, Pi extension hooks, Node `fs/promises`, Node `crypto`, Vitest, existing choco-pi dogfood modules and command tests.

---

## File structure

- Create `extensions/choco-autopilot/improvement-scope.ts`
  - Own memory-mode parsing, Git root discovery, scope resolution, and safe project identifiers.
- Modify `extensions/choco-autopilot/verification-command.ts`
  - Add sanitized command-class detection for flow mining without storing raw shell commands.
- Modify `extensions/choco-autopilot/dogfood-types.ts`
  - Add `DogfoodMemoryMode`, scope metadata, and sanitized `flow` fields to `DogfoodCase`.
- Modify `extensions/choco-autopilot/dogfood-collector.ts`
  - Start cases only when capture policy allows it; record tool sequence and command classes.
- Modify `extensions/choco-autopilot/dogfood-weekly.ts`
  - Include scope/mode summary and top flow signatures in weekly report.
- Modify `extensions/choco-autopilot/index.ts`
  - Resolve scope in `before_agent_start` and pass it into `startDogfoodCase`.
- Add `tests/improvement-scope.test.ts`
- Modify `tests/dogfood-privacy.test.ts`
- Modify `tests/dogfood-scoring.test.ts`
- Modify `tests/dogfood-weekly.test.ts`
- Modify `tests/dogfood-commands.test.ts`

## Task 1: Scope and memory-mode policy

**Files:**
- Create: `extensions/choco-autopilot/improvement-scope.ts`
- Modify: `extensions/choco-autopilot/dogfood-types.ts`
- Modify: `extensions/choco-autopilot/dogfood-privacy.ts`
- Test: `tests/improvement-scope.test.ts`

- [ ] **Step 1: Write failing scope tests**

Create `tests/improvement-scope.test.ts` with:

```ts
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureAllowedForScope, findGitRoot, parseDogfoodMemoryMode, resolveDogfoodScope } from "../extensions/choco-autopilot/improvement-scope";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("self-improvement scope policy", () => {
  it("parses supported memory modes and falls back to auto for invalid values", () => {
    expect(parseDogfoodMemoryMode(undefined)).toBe("auto");
    expect(parseDogfoodMemoryMode("off")).toBe("off");
    expect(parseDogfoodMemoryMode("readonly")).toBe("readonly");
    expect(parseDogfoodMemoryMode("manual")).toBe("manual");
    expect(parseDogfoodMemoryMode("auto")).toBe("auto");
    expect(parseDogfoodMemoryMode("surprise")).toBe("auto");
  });

  it("uses the git root, not the nested cwd, as the project identity", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "choco-scope-"));
    await mkdir(join(tempDir, ".git"));
    await mkdir(join(tempDir, "packages", "api"), { recursive: true });

    const nested = join(tempDir, "packages", "api");
    const gitRoot = await findGitRoot(nested);
    const scope = await resolveDogfoodScope({ cwd: nested, mode: "auto" });

    expect(gitRoot).toBe(await realpath(tempDir));
    expect(scope.kind).toBe("project");
    expect(scope.projectRoot).toBe(await realpath(tempDir));
    expect(scope.projectLabel).toBe(await realpath(tempDir).then((root) => root.split("/").at(-1)));
    expect(scope.projectId).toMatch(/^[a-f0-9]{16}$/);
    expect(scope.capture).toBe(true);
  });

  it("turns capture off outside git repos unless an explicit profile is selected", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "choco-noscope-"));

    const offScope = await resolveDogfoodScope({ cwd: tempDir, mode: "auto" });
    expect(offScope).toMatchObject({ kind: "off", capture: false, reason: "cwd is outside a git project and no profile was selected" });

    const personal = await resolveDogfoodScope({ cwd: tempDir, mode: "auto", profile: "personal" });
    expect(personal).toMatchObject({ kind: "personal", projectLabel: "personal", capture: true });
  });

  it("allows automatic capture only in auto mode and keeps readonly/manual non-capturing", () => {
    expect(captureAllowedForScope({ mode: "auto", kind: "project" })).toBe(true);
    expect(captureAllowedForScope({ mode: "manual", kind: "project" })).toBe(false);
    expect(captureAllowedForScope({ mode: "readonly", kind: "project" })).toBe(false);
    expect(captureAllowedForScope({ mode: "off", kind: "project" })).toBe(false);
    expect(captureAllowedForScope({ mode: "auto", kind: "off" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm vitest run tests/improvement-scope.test.ts
```

Expected: FAIL because `improvement-scope.ts` does not exist.

- [ ] **Step 3: Add scope types to dogfood-types**

Add these exports to `extensions/choco-autopilot/dogfood-types.ts`:

```ts
export type DogfoodMemoryMode = "off" | "readonly" | "manual" | "auto";
export type DogfoodScopeKind = "project" | "personal" | "scratch" | "off";

export interface DogfoodScopeSignals {
  kind: DogfoodScopeKind;
  memoryMode: DogfoodMemoryMode;
  projectId?: string;
  projectRootHash?: string;
  projectLabel?: string;
  capture: boolean;
  reason?: string;
}
```

Add `scope: DogfoodScopeSignals;` to `DogfoodCase`.

- [ ] **Step 4: Implement scope resolver**

Create `extensions/choco-autopilot/improvement-scope.ts` with:

```ts
import { createHash } from "node:crypto";
import { stat, realpath } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import type { DogfoodMemoryMode, DogfoodScopeKind, DogfoodScopeSignals } from "./dogfood-types";

export type DogfoodProfile = "personal" | "scratch";

export function parseDogfoodMemoryMode(value: string | undefined): DogfoodMemoryMode {
  if (value === "off" || value === "readonly" || value === "manual" || value === "auto") return value;
  return "auto";
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

async function hasGitDir(path: string): Promise<boolean> {
  try {
    await stat(resolve(path, ".git"));
    return true;
  } catch {
    return false;
  }
}

export async function findGitRoot(cwd: string): Promise<string | undefined> {
  let current = await realpath(resolve(cwd || process.cwd()));
  while (true) {
    if (await hasGitDir(current)) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function captureAllowedForScope(input: { mode: DogfoodMemoryMode; kind: DogfoodScopeKind }): boolean {
  return input.mode === "auto" && input.kind !== "off";
}

export async function resolveDogfoodScope(input: {
  cwd: string;
  mode?: DogfoodMemoryMode;
  profile?: DogfoodProfile;
}): Promise<DogfoodScopeSignals & { projectRoot?: string }> {
  const mode = input.mode ?? parseDogfoodMemoryMode(process.env.CHOCO_PI_IMPROVEMENT_MODE);
  if (mode === "off") return { kind: "off", memoryMode: mode, capture: false, reason: "memory mode is off" };

  if (input.profile === "personal" || input.profile === "scratch") {
    return {
      kind: input.profile,
      memoryMode: mode,
      projectId: input.profile,
      projectLabel: input.profile,
      capture: captureAllowedForScope({ mode, kind: input.profile }),
      reason: input.profile === "personal" ? "explicit personal profile" : "explicit scratch profile",
    };
  }

  const gitRoot = await findGitRoot(input.cwd);
  if (!gitRoot) {
    return {
      kind: "off",
      memoryMode: mode,
      capture: false,
      reason: "cwd is outside a git project and no profile was selected",
    };
  }

  return {
    kind: "project",
    memoryMode: mode,
    projectId: shortHash(gitRoot),
    projectRoot: gitRoot,
    projectRootHash: shortHash(gitRoot),
    projectLabel: basename(gitRoot) || "project",
    capture: captureAllowedForScope({ mode, kind: "project" }),
  };
}
```

- [ ] **Step 5: Run GREEN**

Run:

```bash
pnpm vitest run tests/improvement-scope.test.ts
```

Expected: PASS.

## Task 2: Sanitized flow and command-class capture

**Files:**
- Modify: `extensions/choco-autopilot/verification-command.ts`
- Modify: `extensions/choco-autopilot/dogfood-types.ts`
- Modify: `extensions/choco-autopilot/dogfood-collector.ts`
- Test: `tests/dogfood-scoring.test.ts`

- [ ] **Step 1: Write failing flow tests**

Add to `tests/dogfood-scoring.test.ts`:

```ts
import { commandClassFromInput } from "../extensions/choco-autopilot/verification-command";

it("classifies command flows without storing raw commands", () => {
  expect(commandClassFromInput({ command: "pnpm run test -- --runInBand" })).toBe("test");
  expect(commandClassFromInput({ command: "pnpm run lint" })).toBe("lint");
  expect(commandClassFromInput({ command: "pnpm run typecheck" })).toBe("typecheck");
  expect(commandClassFromInput({ command: "git status --short" })).toBe("git");
  expect(commandClassFromInput({ command: "curl https://example.com" })).toBe("web-fetch");
  expect(commandClassFromInput({ command: "echo sk-test-123" })).toBe("other");
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm vitest run tests/dogfood-scoring.test.ts
```

Expected: FAIL because `commandClassFromInput` is missing.

- [ ] **Step 3: Add flow types**

Add to `extensions/choco-autopilot/dogfood-types.ts`:

```ts
export interface DogfoodFlowSignals {
  toolSequence: string[];
  commandSequence: string[];
}
```

Add `flow: DogfoodFlowSignals;` to `DogfoodCase`.

- [ ] **Step 4: Implement command classing**

Add to `extensions/choco-autopilot/verification-command.ts`:

```ts
export function commandClassFromInput(input: unknown): string | undefined {
  const command = objectInput(input)?.command;
  if (typeof command !== "string") return undefined;
  const trimmed = command.trim();
  if (!trimmed) return undefined;
  if (/\b(version:check)\b/i.test(trimmed)) return "version-check";
  if (/\b(test|vitest|pytest)\b/i.test(trimmed)) return "test";
  if (/\b(lint|eslint|oxlint)\b/i.test(trimmed)) return "lint";
  if (/\b(typecheck|tsc)\b/i.test(trimmed)) return "typecheck";
  if (/\b(git)\b/i.test(trimmed)) return "git";
  if (/\b(curl|wget|python3?\s+-.*urllib|https?:\/\/)\b/i.test(trimmed)) return "web-fetch";
  if (/\b(pnpm|npm|yarn)\s+(install|add|remove|update)\b/i.test(trimmed)) return "package-manager";
  return "other";
}
```

- [ ] **Step 5: Record flow in collector**

Update `startDogfoodCase` initial case with:

```ts
flow: { toolSequence: [], commandSequence: [] },
```

Update `recordDogfoodToolCall`:

```ts
current.flow.toolSequence.push(toolName);
current.flow.toolSequence = current.flow.toolSequence.slice(-40);
```

Update `recordDogfoodToolResult` bash branch:

```ts
const commandClass = commandClassFromInput(event.input);
if (commandClass) current.flow.commandSequence = [...current.flow.commandSequence, commandClass].slice(-40);
```

- [ ] **Step 6: Run GREEN**

Run:

```bash
pnpm vitest run tests/dogfood-scoring.test.ts tests/dogfood-commands.test.ts
```

Expected: PASS.

## Task 3: Wire scope into dogfood capture

**Files:**
- Modify: `extensions/choco-autopilot/dogfood-collector.ts`
- Modify: `extensions/choco-autopilot/index.ts`
- Modify: `tests/dogfood-commands.test.ts`

- [ ] **Step 1: Write failing command hook tests**

Modify `tests/dogfood-commands.test.ts` so the clean capture test creates a temp Git project and emits events from that cwd:

```ts
const projectDir = await mkdtemp(join(tmpdir(), "choco-pi-project-"));
await mkdir(join(projectDir, ".git"));
await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt, systemPrompt: "base", systemPromptOptions: {} }, projectDir);
```

Add a second test:

```ts
it("does not auto-capture outside git projects", async () => {
  await useTempAgentDir();
  const { handlers, commands } = setupAutopilot();
  const notify = vi.fn();
  const scratch = await mkdtemp(join(tmpdir(), "choco-pi-scratch-"));

  await emitAll(handlers, "before_agent_start", { type: "before_agent_start", prompt: "임시 질문", systemPrompt: "base", systemPromptOptions: {} }, scratch);
  await emitAll(handlers, "message_end", { type: "message_end", message: { role: "assistant", stopReason: "stop", content: [], provider: "test", model: "test" } }, scratch);
  await commands.get("dogfood")!.handler("weekly", { cwd: scratch, ui: { notify } });

  expect(notify.mock.calls.at(-1)?.[0]).toContain("eligible cases: 0");
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm vitest run tests/dogfood-commands.test.ts
```

Expected: FAIL because current dogfood starts outside Git scopes and lacks scope fields.

- [ ] **Step 3: Update startDogfoodCase signature**

Modify `startDogfoodCase` input type to include:

```ts
scope: DogfoodScopeSignals;
```

At the top of `startDogfoodCase`, add:

```ts
if (!input.scope.capture) {
  state.current = undefined;
  await appendDogfoodEvent(store, { type: "case_skipped", at: now.toISOString(), reason: input.scope.reason, scope: input.scope.kind, memoryMode: input.scope.memoryMode });
  return;
}
```

Add these fields to the case:

```ts
scope: input.scope,
cwdHash: input.scope.projectRootHash ?? dogfoodHash(input.cwd, input.salt),
projectLabel: input.scope.projectLabel ?? safeProjectLabel(input.cwd),
```

- [ ] **Step 4: Resolve scope in index.ts**

Import:

```ts
import { parseDogfoodMemoryMode, resolveDogfoodScope } from "./improvement-scope";
```

Before `startDogfoodCase`, add:

```ts
const scope = await resolveDogfoodScope({
  cwd,
  mode: parseDogfoodMemoryMode(process.env.CHOCO_PI_IMPROVEMENT_MODE),
  profile: process.env.CHOCO_PI_IMPROVEMENT_PROFILE === "personal" || process.env.CHOCO_PI_IMPROVEMENT_PROFILE === "scratch"
    ? process.env.CHOCO_PI_IMPROVEMENT_PROFILE
    : undefined,
});
```

Pass `scope` to `startDogfoodCase`.

- [ ] **Step 5: Run GREEN**

Run:

```bash
pnpm vitest run tests/improvement-scope.test.ts tests/dogfood-commands.test.ts
```

Expected: PASS.

## Task 4: Weekly flow summary

**Files:**
- Modify: `extensions/choco-autopilot/dogfood-weekly.ts`
- Modify: `extensions/choco-autopilot/dogfood-types.ts`
- Test: `tests/dogfood-weekly.test.ts`

- [ ] **Step 1: Write failing weekly flow test**

Add to `tests/dogfood-weekly.test.ts`:

```ts
it("summarizes top sanitized flow signatures", () => {
  const cases = [
    dogCase("a", "assisted", "coding:repair-or-recovery", { toolSequence: ["grep", "read", "edit", "bash"], commandSequence: ["test"] }),
    dogCase("b", "assisted", "coding:repair-or-recovery", { toolSequence: ["grep", "read", "edit", "bash"], commandSequence: ["test"] }),
    dogCase("c", "miss", "coding:verification-or-gate-failed", { toolSequence: ["read", "bash"], commandSequence: ["typecheck"] }),
  ];

  const report = buildDogfoodWeeklyReport("2026-W20", cases, new Date("2026-05-11T00:00:00Z"));
  expect(report.topFlows[0]).toMatchObject({ signature: "tools:grep>read>edit>bash | commands:test", count: 2 });
  expect(formatDogfoodWeeklyReport(report)).toContain("top flows");
});
```

Update helper `dogCase` to accept a `flow` override and include default `scope`.

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm vitest run tests/dogfood-weekly.test.ts
```

Expected: FAIL because `topFlows` is missing.

- [ ] **Step 3: Add weekly flow types and formatter**

Add to `DogfoodWeeklyReport`:

```ts
topFlows: Array<{ signature: string; count: number; sampleCaseIds: string[] }>;
```

In `dogfood-weekly.ts`, add a helper that builds signatures from `flow.toolSequence` and `flow.commandSequence`, groups counts, and returns top 5.

- [ ] **Step 4: Run GREEN**

Run:

```bash
pnpm vitest run tests/dogfood-weekly.test.ts
```

Expected: PASS.

## Task 5: Documentation and full verification

**Files:**
- Modify: `docs/operating-policy.md`
- Modify: `docs/design.md`

- [ ] **Step 1: Document the first slice**

Add concise notes:

```md
## Self-improvement capture policy

- Default capture is project-scoped and Git-root based.
- `~/`, Downloads, `/tmp`, and non-Git folders resolve to capture off unless an explicit profile is selected.
- `CHOCO_PI_IMPROVEMENT_MODE=off|readonly|manual|auto` controls automatic capture.
- `readonly` and `manual` do not automatically store dogfood cases.
- Stored flow data is sanitized tool names and command classes, not raw commands or prompt text.
```

- [ ] **Step 2: Run targeted tests**

Run:

```bash
pnpm vitest run tests/improvement-scope.test.ts tests/dogfood-privacy.test.ts tests/dogfood-scoring.test.ts tests/dogfood-weekly.test.ts tests/dogfood-commands.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 3: Run full quality gate**

Run:

```bash
pnpm run version:check && pnpm run lint && pnpm run typecheck && pnpm run test
```

Expected: version sync OK, lint/typecheck pass, all tests pass.

- [ ] **Step 4: Commit**

Run:

```bash
git status --short --untracked-files=all
git add extensions/choco-autopilot tests docs/superpowers/plans/2026-05-13-self-improvement-control-layer.md docs/operating-policy.md docs/design.md
git commit -m "feat: add self-improvement capture controls"
```

- [ ] **Step 5: Push branch**

Run:

```bash
git push -u origin feature/self-improvement-loop
```

---

## Self-review

- Spec coverage: Covers the immediate safe first slice from the research report: memory-mode control, Git-root project scope, non-Git default off, sanitized flow mining foundation, and evidence-backed documentation. Candidate skill generation/eval runner/canary promotion remain later phases and are intentionally not implemented in this first development slice.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: `DogfoodMemoryMode`, `DogfoodScopeSignals`, `DogfoodFlowSignals`, and `DogfoodWeeklyReport.topFlows` are introduced before use.
- Scope control: No raw prompt, raw tool output, or raw command persistence is introduced.
