# Dynamic SDD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight dynamic Spec-Driven Development layer to choco-pi with a `spec_gate` tool, policy guidance, docs, tests, version sync, and runtime reload.

**Architecture:** Implement a focused `dynamic-sdd.ts` tool with per-turn in-memory state, a small `dynamic-sdd-policy.ts` guidance module, and registration from `index.ts`. Keep structural gate and TDD unchanged; dynamic SDD supplies the working spec and deltas that final acceptance should reference.

**Tech Stack:** TypeScript, Pi Extension API, typebox schemas, Vitest, pnpm.

---

## File Structure

- Create `extensions/choco-autopilot/dynamic-sdd.ts`: `spec_gate` tool, state helpers, validation, formatting, install hook.
- Create `extensions/choco-autopilot/dynamic-sdd-policy.ts`: prompt guidance builder.
- Create `tests/dynamic-sdd.test.ts`: tool registration and state-transition tests.
- Modify `extensions/choco-autopilot/index.ts`: import and call `installDynamicSdd(pi)`.
- Modify `extensions/choco-autopilot/policy.ts`: import/inject dynamic SDD guidance.
- Modify `tests/policy.test.ts`: assert prompt includes dynamic SDD layer and TDD-preserving rules.
- Modify `modes/_base/MODE.md`, `modes/coding/MODE.md`, `skills/choco-autopilot/SKILL.md`, `prompts/autopilot.md`, `README.md`: document the layer.
- Modify `package.json`, `extensions/choco-autopilot/version.ts`: bump `0.10.5` to `0.11.0` for a new capability.

## Task 1: TDD for `spec_gate`

**Files:**
- Create: `tests/dynamic-sdd.test.ts`
- Create later: `extensions/choco-autopilot/dynamic-sdd.ts`
- Modify later: `extensions/choco-autopilot/index.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it, vi } from "vitest";
import chocoAutopilot from "../extensions/choco-autopilot/index";

interface RegisteredTool {
  name: string;
  execute: (toolCallId: string, params: Record<string, unknown>, signal: AbortSignal | undefined, onUpdate: undefined, ctx: { cwd: string }) => Promise<{ content: Array<{ type: string; text: string }>; details?: unknown }>;
}

function registeredTools(): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  chocoAutopilot({
    on: vi.fn(),
    registerCommand: vi.fn(),
    registerTool: (definition: RegisteredTool) => tools.set(definition.name, definition),
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
    const result = await tool.execute("1", { action: "start", objective: "Ship dynamic SDD" }, undefined, undefined, { cwd: "/repo" });
    expect(result.details).toMatchObject({ ok: false, reason: expect.stringContaining("scope") });
  });

  it("starts, records an in-scope delta, and snapshots the accepted spec", async () => {
    const tool = registeredTools().get("spec_gate")!;
    await tool.execute("1", {
      action: "start",
      objective: "Add dynamic SDD",
      scope: ["spec_gate tool"],
      acceptanceCriteria: ["spec_gate is registered"],
      testStrategy: ["vitest covers tool behavior"],
      risks: ["scope creep"],
    }, undefined, undefined, { cwd: "/repo" });

    const delta = await tool.execute("2", {
      action: "delta",
      delta: "Need a list action for final review.",
      deltaHandling: "in-scope",
      acceptanceCriteria: ["list shows working spec and deltas"],
    }, undefined, undefined, { cwd: "/repo" });
    expect(delta.details).toMatchObject({ ok: true });

    const snapshot = await tool.execute("3", { action: "snapshot", label: "before implementation" }, undefined, undefined, { cwd: "/repo" });
    expect(snapshot.content[0].text).toContain("before implementation");
    expect(snapshot.content[0].text).toContain("list shows working spec and deltas");
  });

  it("keeps deferred deltas out of the accepted working spec", async () => {
    const tool = registeredTools().get("spec_gate")!;
    await tool.execute("1", {
      action: "start",
      objective: "Add dynamic SDD",
      scope: ["spec_gate tool"],
      acceptanceCriteria: ["spec_gate is registered"],
      testStrategy: ["vitest covers tool behavior"],
    }, undefined, undefined, { cwd: "/repo" });

    await tool.execute("2", {
      action: "delta",
      delta: "Persist specs across sessions later.",
      deltaHandling: "deferred",
      scope: ["persistent spec history"],
    }, undefined, undefined, { cwd: "/repo" });

    const listed = await tool.execute("3", { action: "list" }, undefined, undefined, { cwd: "/repo" });
    expect(listed.content[0].text).toContain("Persist specs across sessions later.");
    expect(listed.content[0].text).not.toContain("Scope:\n- spec_gate tool\n- persistent spec history");
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/dynamic-sdd.test.ts`

Expected: FAIL because `spec_gate` is not registered yet.

## Task 2: Implement `spec_gate`

**Files:**
- Create: `extensions/choco-autopilot/dynamic-sdd.ts`
- Modify: `extensions/choco-autopilot/index.ts`

- [ ] **Step 1: Add the tool implementation**

Implement `SPEC_GATE_TOOL_NAME = "spec_gate"`, a `DynamicSddState`, `recordSpecGateAction`, `formatSpecGateState`, and `installDynamicSdd(pi)`.

- [ ] **Step 2: Register the tool**

Add `import { installDynamicSdd } from "./dynamic-sdd";` and call `installDynamicSdd(pi);` inside `chocoAutopilot`.

- [ ] **Step 3: Run GREEN**

Run: `pnpm vitest run tests/dynamic-sdd.test.ts`

Expected: PASS.

## Task 3: Policy prompt integration

**Files:**
- Create: `extensions/choco-autopilot/dynamic-sdd-policy.ts`
- Modify: `extensions/choco-autopilot/policy.ts`
- Modify: `tests/policy.test.ts`

- [ ] **Step 1: Write prompt assertions**

Add expectations that the system prompt contains `Dynamic SDD`, `spec_gate`, `Working Spec`, `Spec Delta`, and `SDD does not replace TDD`.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/policy.test.ts`

Expected: FAIL because dynamic SDD guidance is not injected yet.

- [ ] **Step 3: Implement policy guidance**

Create `buildDynamicSddGuidance()` and inject it near the autonomous execution loop / structural gate guidance.

- [ ] **Step 4: Run GREEN**

Run: `pnpm vitest run tests/policy.test.ts`

Expected: PASS.

## Task 4: Documentation, mode files, and version sync

**Files:**
- Modify: `modes/_base/MODE.md`
- Modify: `modes/coding/MODE.md`
- Modify: `skills/choco-autopilot/SKILL.md`
- Modify: `prompts/autopilot.md`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `extensions/choco-autopilot/version.ts`

- [ ] **Step 1: Document the layer**

Add concise dynamic SDD guidance to base mode, coding mode, autopilot skill, and README guard/tool sections.

- [ ] **Step 2: Bump version**

Change `0.10.5` to `0.11.0` in both version-bearing files.

- [ ] **Step 3: Run version check**

Run: `pnpm run version:check`

Expected: PASS.

## Task 5: Full verification, reload, and source sync

**Files:**
- All modified files from Tasks 1-4.

- [ ] **Step 1: Run full gate**

Run: `pnpm run check`

Expected: PASS.

- [ ] **Step 2: Technical-debt cleanup pass**

Review diff for dead helpers, over-broad docs, unnecessary files, version mismatch, and accidental runtime artifacts.

- [ ] **Step 3: Re-run full gate**

Run: `pnpm run check`

Expected: PASS after cleanup.

- [ ] **Step 4: Reload runtime**

Run the Pi runtime reload path because extension/tools/policy changed.

- [ ] **Step 5: Commit and push**

Run `git status --short --untracked-files=all`, commit only in-scope files, and `git push` if a remote is configured.
