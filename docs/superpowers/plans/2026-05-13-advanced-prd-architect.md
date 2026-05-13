# Advanced PRD Architect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an advanced PRD architect skill that adapts show-me-the-prd ideas into deep, autonomous, high-signal PRD work for choco-pi.

**Architecture:** Implement this as a Pi skill plus lightweight autopilot documentation/prompt routing. Do not vendor the external Claude plugin or copy its templates. Keep the behavior policy-first: advanced PRD generation, retrieval-first evidence, explicit assumptions, decision records, and critical-question-only escalation.

**Tech Stack:** Markdown Pi skill, package.json skill registration, Vitest doc/config tests, pnpm.

---

## File Structure

- Create `skills/prd-architect/SKILL.md`: advanced PRD workflow and output contract.
- Create `tests/prd-architect-skill.test.ts`: package exposure and skill contract tests.
- Modify `package.json`: add `skills/prd-architect`, bump version.
- Modify `extensions/choco-autopilot/version.ts`: sync version.
- Modify `skills/choco-autopilot/SKILL.md`: route PRD requests to the new advanced skill.
- Modify `prompts/autopilot.md`: mention advanced PRD behavior.
- Modify `README.md`: document the new skill and source adoption.

## Task 1: RED tests

**Files:**
- Create: `tests/prd-architect-skill.test.ts`

- [ ] **Step 1: Write tests**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { pi: { skills: string[] } };
const skill = () => readFileSync(join(process.cwd(), "skills/prd-architect/SKILL.md"), "utf8");

describe("advanced PRD architect skill", () => {
  it("is exposed as a Pi skill", () => {
    expect(packageJson.pi.skills).toContain("skills/prd-architect");
  });

  it("uses advanced autonomous PRD behavior instead of beginner interviews", () => {
    const content = skill();
    expect(content).toContain("Advanced PRD Architect");
    expect(content).toContain("critical questions only");
    expect(content).toContain("Do not run a beginner interview");
    expect(content).toContain("AskUserQuestion-first");
    expect(content).toContain("assumption ledger");
    expect(content).toContain("Decision Records");
    expect(content).toContain("retrieval-first");
  });

  it("defines a deep document set for advanced users", () => {
    const content = skill();
    expect(content).toContain("01_PRD.md");
    expect(content).toContain("02_SYSTEM_MODEL.md");
    expect(content).toContain("03_DELIVERY_PLAN.md");
    expect(content).toContain("04_AGENT_SPEC.md");
    expect(content).toContain("README.md");
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/prd-architect-skill.test.ts`

Expected: FAIL because the skill is not registered and file does not exist.

## Task 2: Implement skill and routing docs

**Files:**
- Create: `skills/prd-architect/SKILL.md`
- Modify: `package.json`
- Modify: `skills/choco-autopilot/SKILL.md`
- Modify: `prompts/autopilot.md`
- Modify: `README.md`
- Modify: `extensions/choco-autopilot/version.ts`

- [ ] **Step 1: Create skill**

Write an advanced PRD skill with these sections:

- trigger metadata for PRD/기획서/product requirements/product spec,
- critical questions only,
- external research/source confidence,
- advanced PRD workflow,
- document set contract,
- quality gate,
- anti-patterns.

- [ ] **Step 2: Register skill and bump version**

Add `skills/prd-architect` to package skills and bump version from `0.11.0` to `0.12.0` in `package.json`, `extensions/choco-autopilot/version.ts`, and README current version.

- [ ] **Step 3: Update routing docs**

Update autopilot skill and prompt so PRD requests use the advanced PRD skill and avoid routine clarification.

- [ ] **Step 4: Run GREEN targeted tests**

Run: `pnpm vitest run tests/prd-architect-skill.test.ts tests/package-config.test.ts`.

Expected: PASS.

## Task 3: Source tracking, full verification, reload, commit

**Files:**
- All changed files.

- [ ] **Step 1: Track source adoption**

Use `source_registry` to add/adopt `https://github.com/fivetaku/show-me-the-prd` with `adoptionDepth: prompt-policy`, adopted items as ideas only, and rejected items as Claude plugin/runtime and beginner interview flow.

- [ ] **Step 2: Full quality gate**

Run: `pnpm run check`.

Expected: PASS.

- [ ] **Step 3: Technical-debt cleanup**

Review diff, remove accidental generated/private files, confirm no copied external templates/code.

- [ ] **Step 4: Re-run gate and reload**

Run `pnpm run check` again after cleanup, then `reload_runtime`.

- [ ] **Step 5: Commit and push**

Commit in-scope files and push to configured remote.
