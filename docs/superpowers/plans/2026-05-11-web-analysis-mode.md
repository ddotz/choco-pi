# Web Analysis Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `web-analysis` as the first non-default ddotz-pi work mode, using fivetaku/insane-search for retrieval-first external research and mode-scoped hook/guardrail checks that raise web research answer quality without changing `default`.

**Architecture:** Keep the autonomous PM base global, but move web-analysis behavior into a mode-scoped overlay that is appended only when `runtime.workMode === "web-analysis"`. Stage 1 implements the isolated mode overlay and resource policy, then self-reviews and patches leakage or coverage gaps. Stage 2 adds process-level quality guardrails through mode-scoped prompt requirements and final-output validation helpers; it does not build a search engine, router, product UI, saved research service, or custom retrieval backend. `insane-search` remains an external dependency/reference, not vendored into ddotz-pi.

**Tech Stack:** Pi extension hooks (`before_agent_start`, `message_end`, `/mode` command), TypeScript pure policy modules, Vitest contract tests, Pi mode files under `modes/<mode-id>/MODE.md`, external fivetaku/insane-search skill/engine via GitHub/MIT reference.

---

## Non-Negotiable Constraints

1. **Mode isolation is mandatory for every mode change.** Any new mode policy, skill guidance, plugin/extension guidance, tool priority, or output contract must be active-mode-only.
2. **Default must not change behavior.** `buildAutopilotSystemPrompt({ workMode: "default" })` must not include web-analysis overlay names, retrieval-first workflow, source scoring rubric, or fivetaku-specific engine instructions beyond the already-existing minimal base policy mention of `insane-search` for blocked sites.
3. **No vendoring insane-search.** Use `https://github.com/fivetaku/insane-search` as an external dependency/reference. Do not copy its engine into `ddotz-pi`; do not reimplement its bypass chain.
4. **No global Pi package install in this implementation.** Public package candidates remain optional adapters. Installing a Pi package globally would affect default unless filtered and mode-scoped, so this version uses local policy/guardrail guidance only.
5. **Activation is explicit.** `/mode set web-analysis` may activate the mode after implementation. Planned modes other than `web-analysis` remain planned.
6. **No search engine/router/service UX in this version.** Query routing, custom search provider orchestration, source explorer UI, saved research, export UI, and product-thread features are out of scope.
7. **Stage steering is required.** Complete Stage 1, run self-review, patch gaps, then steer Stage 2 guardrail implementation from the Stage 1 review findings.

## External Source and Package Investigation Summary

### pi.dev/packages candidates checked

- `pi-web-access` — MIT, high web-access similarity, provides `web_search`, `fetch_content`, GitHub clone, PDF/YouTube/video, smart fallbacks. Rejected as v1 baseline because installing/using it as a package would add global tools and provider/API/cookie behavior; it is broader than mode-isolated web-analysis.
- `pi-smart-fetch` — MIT, strong fetch similarity with browser-like TLS impersonation and Defuddle extraction. Partial future adapter candidate, but it lacks source search, multi-source synthesis, and critical-review workflow.
- `@juicesharp/rpiv-web-tools` — MIT, Brave-backed search/fetch. Lower fit because it needs a Brave API key and does not cover blocked/WAF source handling like insane-search.
- `@ollama/pi-web-search` — MIT, local Ollama web APIs. Lower fit because it depends on Ollama search/fetch availability and is not an evidence-review workflow.
- `pi-oracle` — MIT, async ChatGPT web oracle. Not a retrieval-first web-analysis baseline.

### fivetaku/insane-search source checked

- Repo: `https://github.com/fivetaku/insane-search`
- HEAD observed during planning: `b4ab9384399a8df58503268764ba43ed5520156d`
- License: MIT
- Current package/plugin metadata: Claude plugin `insane-search` v0.4.1
- Core design: Phase 0 official/public APIs, Phase 1 generic fetch chain, WAF profile detection, curl_cffi TLS impersonation grid, Playwright fallback, positive proof validation, No-Site-Name Rule.
- Security review notes: engine uses network access, optional dependency install, curl_cffi, Node/Playwright templates, temp browser profiles. This is acceptable as an external opt-in dependency, not as bundled ddotz-pi runtime code.
- Verification observed: `python3 engine/bias_check.py` passed. `python3 -m engine --help` worked. Smoke test had 7/8 pass locally; the online `example.com` check failed because `curl_cffi` was not installed in the temporary clone, which confirms the implementation plan must detect/report dependency availability.

---

## File Structure

Create and modify these files only:

- Create: `extensions/ddotz-autopilot/mode-resource-policy.ts`
  - One typed source of truth for mode-specific skills, extension/plugin guidance, tool priority, and process priorities.
  - Returns empty/default policy for `default`.
- Create: `extensions/ddotz-autopilot/web-analysis-policy.ts`
  - Web-analysis-only prompt overlay, source quality rubric, required answer contract, and guardrail prompt requirements.
  - Mentions fivetaku/insane-search only inside this active-mode overlay.
- Create: `extensions/ddotz-autopilot/web-research-quality.ts`
  - Pure helpers for final-answer quality checks: citation/provenance hints, critical-review presence, confidence gating, and default-mode bypass.
  - No search engine, no router, no UI, no network access.
- Modify: `extensions/ddotz-autopilot/policy.ts`
  - Import mode overlay builder.
  - Append overlay only when active mode returns non-empty guidance.
- Modify: `extensions/ddotz-autopilot/mode.ts`
  - Mark `web-analysis` as implemented.
  - Keep `coding`, `report`, and `adoption-analysis` planned.
- Modify: `extensions/ddotz-autopilot/work-mode-registry.ts`
  - Registry status for `web-analysis` becomes `implemented`.
- Modify: `extensions/ddotz-autopilot/index.ts`
  - `/mode set web-analysis` works through existing `isWorkModeImplemented` path.
  - Add no global tool mutation unless Task 6 optional tool-priority status is implemented safely.
- Modify: `modes/web-analysis/MODE.md`
  - Replace planned overlay with implemented mode instructions.
- Modify: `README.md`
  - Status, architecture, commands, mode folder structure, and runtime behavior docs.
- Modify: `skills/ddotz-autopilot/SKILL.md`
  - Document `web-analysis` as implemented and mode-isolated.
- Modify: `prompts/autopilot.md`
  - Keep default-safe wording; mention that specialized mode policies apply only when the mode is active.
- Test: `tests/web-analysis-mode.test.ts`
  - New mode isolation, overlay, implemented-mode, and resource-policy tests.
- Test: `tests/web-research-quality.test.ts`
  - Stage 2 guardrail helper tests for missing evidence, missing critical review, weak confidence eligibility, and default bypass.
- Modify: `tests/policy.test.ts`
  - Update implemented/planned mode expectations.
- Modify: `tests/work-mode-registry.test.ts`
  - Update registry status expectations.
- Modify: `tests/extension-commands.test.ts`
  - Verify `/mode set web-analysis` activates it and `/mode set default` restores default.

---

### Task 1: Write failing mode-isolation tests

**Files:**
- Create: `tests/web-analysis-mode.test.ts`
- Modify: `tests/policy.test.ts`
- Modify: `tests/work-mode-registry.test.ts`
- Modify: `tests/extension-commands.test.ts`

- [ ] **Step 1: Create failing web-analysis isolation tests**

Create `tests/web-analysis-mode.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAutopilotSystemPrompt } from "../extensions/ddotz-autopilot/policy";
import { buildModeResourcePolicy } from "../extensions/ddotz-autopilot/mode-resource-policy";

function promptFor(workMode: "default" | "web-analysis"): string {
  return buildAutopilotSystemPrompt({
    workMode,
    executionIntensity: "standard",
    cwd: "/repo",
  });
}

describe("web-analysis mode isolation", () => {
  it("does not leak web-analysis overlay into default mode", () => {
    const prompt = promptFor("default");

    expect(prompt).not.toContain("### Web Analysis Mode");
    expect(prompt).not.toContain("Retrieval-first external research pipeline");
    expect(prompt).not.toContain("Source confidence matrix");
    expect(prompt).not.toContain("Use fivetaku/insane-search as the primary retrieval playbook");
  });

  it("adds retrieval-first and critical-review guidance only in web-analysis mode", () => {
    const prompt = promptFor("web-analysis");

    expect(prompt).toContain("### Web Analysis Mode");
    expect(prompt).toContain("Mode isolation: this section applies only while Work mode is web-analysis");
    expect(prompt).toContain("Retrieval-first external research pipeline");
    expect(prompt).toContain("Use fivetaku/insane-search as the primary retrieval playbook");
    expect(prompt).toContain("Source confidence matrix");
    expect(prompt).toContain("Critical review pass");
    expect(prompt).toContain("Do not apply this overlay in default mode");
  });

  it("returns empty resource policy for default and web resources for web-analysis", () => {
    expect(buildModeResourcePolicy("default")).toEqual({
      mode: "default",
      skills: [],
      extensionGuidance: [],
      toolPriority: [],
      processPriorities: [],
    });

    const policy = buildModeResourcePolicy("web-analysis");
    expect(policy.mode).toBe("web-analysis");
    expect(policy.skills).toContain("insane-search");
    expect(policy.extensionGuidance).toContain("Use external fivetaku/insane-search; do not vendor it into ddotz-pi.");
    expect(policy.toolPriority[0]).toBe("external retrieval before synthesis");
    expect(policy.processPriorities).toContain("critical review before final answer");
  });
});
```

- [ ] **Step 2: Update existing policy expectations to fail until implementation changes**

In `tests/policy.test.ts`, change the first test expectations:

```ts
expect(IMPLEMENTED_WORK_MODES).toEqual(["default", "web-analysis"]);
expect(PLANNED_WORK_MODES).toEqual(["coding", "report", "adoption-analysis"]);
expect(isWorkModeImplemented("default")).toBe(true);
expect(isWorkModeImplemented("web-analysis")).toBe(true);
expect(isWorkModeImplemented("coding")).toBe(false);
```

Also update the prompt test to assert the default prompt still says default is implemented but no longer says only default is implemented:

```ts
expect(prompt).toContain("Work mode: default");
expect(prompt).toContain("Default mode is active");
expect(prompt).not.toContain("Only default work mode is currently implemented");
```

- [ ] **Step 3: Update work-mode registry expectations**

In `tests/work-mode-registry.test.ts`, update the first test:

```ts
expect(registry.modes.find((mode) => mode.id === "default")?.status).toBe("implemented");
expect(registry.modes.find((mode) => mode.id === "web-analysis")?.status).toBe("implemented");
expect(registry.modes.find((mode) => mode.id === "web-analysis")?.instructionFile).toBe("modes/web-analysis/MODE.md");
expect(registry.modes.find((mode) => mode.id === "coding")?.status).toBe("planned");
expect(registry.modes.find((mode) => mode.id === "report")?.status).toBe("planned");
```

- [ ] **Step 4: Add command activation test**

Append to `tests/extension-commands.test.ts`:

```ts
it("allows switching to implemented web-analysis mode without changing command names", async () => {
  await useTempAgentDir();
  const commands = registeredCommands();
  const notify = vi.fn();

  await commands.get("mode")!.handler("set web-analysis", { ui: { notify } });
  await commands.get("mode")!.handler("status", { ui: { notify } });

  expect(notify).toHaveBeenCalledWith(expect.stringContaining("mode: web-analysis"), "info");
  expect([...commands.keys()].filter((name) => name.startsWith("ddotz-"))).toEqual([]);
});
```

- [ ] **Step 5: Run tests and verify RED**

Run:

```bash
cd /Users/hyuns/code/ddotz-pi
pnpm vitest run tests/web-analysis-mode.test.ts tests/policy.test.ts tests/work-mode-registry.test.ts tests/extension-commands.test.ts
```

Expected: FAIL because `mode-resource-policy.ts` does not exist, `web-analysis` is not implemented, and no overlay is appended.

---

### Task 2: Add mode resource policy and web-analysis overlay

**Files:**
- Create: `extensions/ddotz-autopilot/mode-resource-policy.ts`
- Create: `extensions/ddotz-autopilot/web-analysis-policy.ts`

- [ ] **Step 1: Create mode resource policy module**

Create `extensions/ddotz-autopilot/mode-resource-policy.ts`:

```ts
import type { WorkMode } from "./mode";

export interface ModeResourcePolicy {
  mode: WorkMode;
  skills: string[];
  extensionGuidance: string[];
  toolPriority: string[];
  processPriorities: string[];
}

const EMPTY_POLICY: ModeResourcePolicy = {
  mode: "default",
  skills: [],
  extensionGuidance: [],
  toolPriority: [],
  processPriorities: [],
};

const WEB_ANALYSIS_POLICY: ModeResourcePolicy = {
  mode: "web-analysis",
  skills: ["insane-search"],
  extensionGuidance: [
    "Use external fivetaku/insane-search; do not vendor it into ddotz-pi.",
    "Use mode-scoped web-analysis retrieval and review instructions only when web-analysis is active.",
    "Keep default mode prompt, resource guidance, and priorities unchanged.",
  ],
  toolPriority: [
    "external retrieval before synthesis",
    "source extraction before interpretation",
    "source scoring before final answer",
    "critical review before completion",
  ],
  processPriorities: [
    "freshness and provenance before narrative polish",
    "primary sources before summaries",
    "conflict detection before recommendation",
    "critical review before final answer",
  ],
};

export function buildModeResourcePolicy(mode: WorkMode): ModeResourcePolicy {
  if (mode === "web-analysis") return WEB_ANALYSIS_POLICY;
  return { ...EMPTY_POLICY, mode };
}

export function formatModeResourcePolicy(policy: ModeResourcePolicy): string {
  if (policy.skills.length === 0 && policy.extensionGuidance.length === 0 && policy.toolPriority.length === 0) {
    return "";
  }

  return [
    "#### Mode-scoped resources",
    `- Skills active by policy: ${policy.skills.join(", ") || "none"}`,
    "- Extension/plugin guidance:",
    ...policy.extensionGuidance.map((item) => `  - ${item}`),
    "- Tool/process priority:",
    ...policy.toolPriority.map((item) => `  - ${item}`),
  ].join("\n");
}
```

- [ ] **Step 2: Create web-analysis policy overlay module**

Create `extensions/ddotz-autopilot/web-analysis-policy.ts`:

```ts
import { buildModeResourcePolicy, formatModeResourcePolicy } from "./mode-resource-policy";

export function buildWebAnalysisModeGuidance(): string {
  const resourcePolicy = formatModeResourcePolicy(buildModeResourcePolicy("web-analysis"));

  return [
    "### Web Analysis Mode",
    "Mode isolation: this section applies only while Work mode is web-analysis. Do not apply this overlay in default mode.",
    "",
    resourcePolicy,
    "",
    "#### Retrieval-first external research pipeline",
    "1. Clarify internally what the user needs: decision, explanation, comparison, fact check, trend, or source review. Ask only when the question is logically impossible without missing constraints.",
    "2. Collect sources before synthesis. Use fivetaku/insane-search as the primary retrieval playbook for blocked/WAF-protected sources, GitHub, Reddit, YouTube, Naver, X/Twitter, Medium, Substack, Stack Overflow, Coupang, LinkedIn, and Korean web sources.",
    "3. For keyword-only requests, search first to obtain URLs, then fetch/extract source content. For direct URLs, fetch/extract first and escalate through the insane-search phases only when needed.",
    "4. Prefer primary sources, official docs, source repositories, standards, release notes, papers, court/government filings, and direct data over reposts or summaries.",
    "5. Capture provenance for every important claim: URL, publisher/author, publication or update date when available, retrieval method, and whether content was full text, metadata-only, archived, or inferred.",
    "",
    "#### Source confidence matrix",
    "Score sources before relying on them:",
    "- Relevance: directly answers the user's question or only provides background.",
    "- Recency: current enough for the claim; stale sources are allowed only for historical context.",
    "- Authority: primary/official > expert with evidence > reputable secondary > unattributed aggregation.",
    "- Independence: multiple sources that share the same upstream report count as one evidence family.",
    "- Evidence quality: raw data, reproducible method, quoted primary material, or only assertion.",
    "- Access quality: full text > partial text > metadata/preview > archive/cache fallback.",
    "",
    "#### Critical review pass",
    "Before answering, actively look for conflicts, outdated claims, missing base rates, incentives, selection bias, measurement ambiguity, regional/language skew, and cases where search results may be SEO spam or generated content.",
    "If evidence conflicts, explain the conflict and prefer the better-supported source instead of averaging claims.",
    "If current evidence is weak, say what would change confidence and avoid presenting weak evidence as settled fact.",
    "",
    "#### Output contract",
    "Return structured, current, and critical answers by default:",
    "- Conclusion: concise answer or decision.",
    "- Evidence: source-backed bullets with citations/provenance.",
    "- Critical review: conflicts, caveats, and what might be wrong.",
    "- Confidence: High only when sources are current, relevant, independent, and conflict-reviewed; otherwise explain the blocker instead of overstating.",
  ].filter(Boolean).join("\n");
}
```

- [ ] **Step 3: Run focused tests and verify still RED for mode activation**

Run:

```bash
cd /Users/hyuns/code/ddotz-pi
pnpm vitest run tests/web-analysis-mode.test.ts tests/policy.test.ts
```

Expected: tests still FAIL until `policy.ts` appends the overlay and `mode.ts` marks web-analysis implemented.

---

### Task 3: Mark web-analysis implemented without changing default semantics

**Files:**
- Modify: `extensions/ddotz-autopilot/mode.ts`
- Modify: `extensions/ddotz-autopilot/work-mode-registry.ts`

- [ ] **Step 1: Update implemented/planned mode constants**

In `extensions/ddotz-autopilot/mode.ts`, replace the constants with:

```ts
export const IMPLEMENTED_WORK_MODES: WorkMode[] = ["default", "web-analysis"];
export const PLANNED_WORK_MODES: Exclude<WorkMode, "default" | "web-analysis">[] = ["coding", "report", "adoption-analysis"];
```

- [ ] **Step 2: Update mode descriptions**

In `describeWorkMode`, replace the `web-analysis` and `default` cases:

```ts
    case "web-analysis":
      return "Web-analysis mode is active. Apply only the web-analysis mode-scoped overlay for retrieval-first external research, source confidence scoring, and critical review; keep default mode behavior isolated.";
    case "default":
      return "Default mode is active. Execute autonomously using the base PM philosophy without specialized mode overlays.";
```

- [ ] **Step 3: Update mode switch guidance**

In `buildModeSwitchGuidance`, keep `web-analysis` from being treated as planned:

```ts
export function buildModeSwitchGuidance(suggestedMode: WorkMode | undefined): string {
  if (!suggestedMode || suggestedMode === "default") {
    return "Default mode is active unless the user explicitly switches to another implemented mode.";
  }
  if (isWorkModeImplemented(suggestedMode)) {
    return `This task resembles implemented ${suggestedMode} mode. Do not switch automatically; use the current active mode unless the user explicitly switches.`;
  }
  return [
    "Some specialized modes are planned but not implemented.",
    `This task resembles planned ${suggestedMode} mode, but do not switch automatically.`,
    "If the user explicitly asks to use or add this mode, ask once whether to implement/switch it; otherwise continue in the active implemented mode.",
  ].join("\n");
}
```

- [ ] **Step 4: Update work-mode registry built-in status**

In `extensions/ddotz-autopilot/work-mode-registry.ts`, replace the `web-analysis` definition with:

```ts
  {
    id: "web-analysis",
    description: "Implemented mode for retrieval-first external web research, source confidence scoring, and critical review.",
    status: "implemented",
    custom: false,
  },
```

- [ ] **Step 5: Run mode tests**

Run:

```bash
cd /Users/hyuns/code/ddotz-pi
pnpm vitest run tests/policy.test.ts tests/work-mode-registry.test.ts tests/extension-commands.test.ts
```

Expected: some tests pass; overlay tests still fail until Task 4.

---

### Task 4: Append mode overlay only for active web-analysis mode

**Files:**
- Modify: `extensions/ddotz-autopilot/policy.ts`

- [ ] **Step 1: Import web-analysis overlay**

At the top of `extensions/ddotz-autopilot/policy.ts`, add:

```ts
import { buildWebAnalysisModeGuidance } from "./web-analysis-policy";
```

- [ ] **Step 2: Add a mode overlay dispatcher inside policy.ts**

Add below `buildNewFeaturePackageReuseGuidance()`:

```ts
function buildModeOverlayGuidance(mode: WorkMode): string {
  if (mode === "web-analysis") return buildWebAnalysisModeGuidance();
  return "";
}
```

- [ ] **Step 3: Append overlay conditionally in `buildAutopilotSystemPrompt`**

Inside `buildAutopilotSystemPrompt`, before the returned array, add:

```ts
  const modeOverlay = buildModeOverlayGuidance(options.workMode);
```

Then insert these entries after `buildModeSwitchGuidance(options.suggestedWorkMode),`:

```ts
    ...(modeOverlay ? ["", modeOverlay] : []),
```

This exact placement keeps the overlay near work-mode rules and ensures default mode gets no added strings.

- [ ] **Step 4: Run isolation tests**

Run:

```bash
cd /Users/hyuns/code/ddotz-pi
pnpm vitest run tests/web-analysis-mode.test.ts tests/policy.test.ts
```

Expected: PASS for mode overlay and default non-leak tests.

---

### Task 5: Update web-analysis mode docs and user-facing docs

**Files:**
- Modify: `modes/web-analysis/MODE.md`
- Modify: `README.md`
- Modify: `skills/ddotz-autopilot/SKILL.md`
- Modify: `prompts/autopilot.md`

- [ ] **Step 1: Replace `modes/web-analysis/MODE.md` content**

Overwrite `modes/web-analysis/MODE.md` with:

```md
# Web Analysis Mode

Status: implemented.

Mode isolation is mandatory. These instructions apply only when `Work mode: web-analysis` is active. Do not apply them in `default`.

## Purpose

Use this mode for external web research, source review, current-information questions, fact checks, trend analysis, and evidence-backed recommendations.

## Mode-scoped resources

- Preferred external skill: `insane-search` from `https://github.com/fivetaku/insane-search`.
- Do not vendor or reimplement insane-search inside `ddotz-pi`.
- Use Pi package candidates only as future adapters if they can be isolated from default mode.

## Retrieval-first process

1. Define the information need and freshness requirement.
2. Collect sources before synthesis.
3. Use fivetaku/insane-search routing for blocked/WAF-protected sites and platforms that need special handling.
4. Prefer primary and official sources.
5. Record provenance: URL, publisher, date, retrieval method, and access quality.
6. Score source confidence.
7. Run a critical review pass before answering.

## Output priorities

1. Current and source-backed information.
2. Clear separation of fact, inference, and recommendation.
3. Conflict and uncertainty disclosure.
4. Concise final answer with `Confidence: High` only when evidence supports it.
```

- [ ] **Step 2: Update README status and mode table**

In `README.md`, update the status bullets:

```md
- Implemented work modes: `default`, `web-analysis`.
- Planned work modes: `coding`, `report`, `adoption-analysis`.
```

Update the mode folder structure comment:

```text
  web-analysis/MODE.md         # implemented web research overlay
```

Add a runtime behavior bullet:

```md
- Mode-specific skills, extension/plugin guidance, processes, and priorities must be mode-isolated. `web-analysis` retrieval/review policy is injected only while that mode is active.
```

- [ ] **Step 3: Update ddotz-autopilot skill mode section**

In `skills/ddotz-autopilot/SKILL.md`, replace the Work Modes list with:

```md
- **default**: implemented base autonomous PM/development mode.
- **web-analysis**: implemented mode-scoped retrieval-first external research with source confidence scoring and critical review.
- **coding/report/adoption-analysis**: planned modes. Do not claim they are active. If the user explicitly asks to use one, ask whether to implement/switch it.
- Every mode policy, skill guidance, plugin/extension guidance, process, and priority must be mode-isolated; do not let specialized mode behavior leak into `default`.
```

- [ ] **Step 4: Update prompt template with mode isolation rule**

In `prompts/autopilot.md`, add this bullet after the `/mode` bullet:

```md
- Mode-specific skills, plugin/extension guidance, processes, and priorities apply only while that mode is active; keep `default` isolated from specialized mode behavior.
```

- [ ] **Step 5: Run docs and policy tests**

Run:

```bash
cd /Users/hyuns/code/ddotz-pi
pnpm vitest run tests/language-style-docs.test.ts tests/policy.test.ts tests/web-analysis-mode.test.ts
```

Expected: PASS.

---

### Task 6: Add command-level activation coverage and avoid global tool mutation

**Files:**
- Modify: `tests/extension-commands.test.ts`
- Modify: `extensions/ddotz-autopilot/index.ts` only if the test reveals stale status text or planned-mode warning.

- [ ] **Step 1: Add activation and restoration test**

Append to `tests/extension-commands.test.ts`:

```ts
it("switches from web-analysis back to default without planned-mode warnings", async () => {
  await useTempAgentDir();
  const commands = registeredCommands();
  const notify = vi.fn();

  await commands.get("mode")!.handler("set web-analysis", { ui: { notify } });
  await commands.get("mode")!.handler("set default", { ui: { notify } });
  await commands.get("mode")!.handler("status", { ui: { notify } });

  expect(notify).toHaveBeenCalledWith("mode: web-analysis", "info");
  expect(notify).toHaveBeenCalledWith("mode: default", "info");
  expect(notify).toHaveBeenLastCalledWith(expect.stringContaining("mode: default"), "info");
  expect(notify.mock.calls.flat().join("\n")).not.toContain("planned but not implemented");
});
```

- [ ] **Step 2: Keep v1 from mutating active tools globally**

Do not call `pi.setActiveTools()` for web-analysis in v1. The reason is explicit mode isolation: active tool mutation is session-global and can accidentally remove structural tools or persist into default. Use prompt-level resource priority first; add mode-scoped active-tool profiles later only with snapshot/restore tests.

- [ ] **Step 3: Run command tests**

Run:

```bash
cd /Users/hyuns/code/ddotz-pi
pnpm vitest run tests/extension-commands.test.ts tests/web-analysis-mode.test.ts
```

Expected: PASS.

---

### Task 7: Stage 2 — Add web research quality guardrails, no search engine/router

**Files:**
- Create: `extensions/ddotz-autopilot/web-research-quality.ts`
- Create: `tests/web-research-quality.test.ts`
- Modify: `extensions/ddotz-autopilot/web-analysis-policy.ts`
- Modify: `tests/web-analysis-mode.test.ts`

- [ ] **Step 1: Write failing guardrail tests**

Create `tests/web-research-quality.test.ts` with tests for:

```ts
import { describe, expect, it } from "vitest";
import { evaluateWebResearchQuality } from "../extensions/ddotz-autopilot/web-research-quality";

describe("web research quality guardrails", () => {
  it("bypasses non-web-analysis modes", () => {
    const result = evaluateWebResearchQuality("default", "짧은 일반 답변");
    expect(result.required).toBe(false);
    expect(result.passed).toBe(true);
  });

  it("flags web-analysis answers without provenance", () => {
    const result = evaluateWebResearchQuality("web-analysis", "Conclusion: 최신 정보입니다. Confidence: High");
    expect(result.required).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.issues).toContain("missing-evidence-or-provenance");
  });

  it("flags web-analysis answers without critical review", () => {
    const answer = [
      "Conclusion: A가 더 낫습니다.",
      "Evidence: https://example.com — published 2026-05-01 — full text.",
      "Confidence: High",
    ].join("\n");
    const result = evaluateWebResearchQuality("web-analysis", answer);
    expect(result.passed).toBe(false);
    expect(result.issues).toContain("missing-critical-review");
  });

  it("blocks High confidence when evidence is too thin", () => {
    const answer = [
      "Conclusion: A가 더 낫습니다.",
      "Evidence: https://example.com — published 2026-05-01 — full text.",
      "Critical review: caveat checked; conflict not found.",
      "Confidence: High",
    ].join("\n");
    const result = evaluateWebResearchQuality("web-analysis", answer);
    expect(result.passed).toBe(false);
    expect(result.issues).toContain("high-confidence-with-thin-evidence");
  });

  it("passes structured web-analysis answers with enough provenance and critical review", () => {
    const answer = [
      "Conclusion: A가 더 낫습니다.",
      "Evidence: https://example.com/a — published 2026-05-01 — full text.",
      "Evidence: https://example.org/b — updated 2026-05-02 — full text.",
      "Critical review: sources are independent; one caveat is regional coverage.",
      "Confidence: High",
    ].join("\n");
    const result = evaluateWebResearchQuality("web-analysis", answer);
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });
});
```

Run:

```bash
pnpm vitest run tests/web-research-quality.test.ts
```

Expected: RED because helper does not exist.

- [ ] **Step 2: Implement pure quality helper**

Create `extensions/ddotz-autopilot/web-research-quality.ts`:

```ts
import type { WorkMode } from "./mode";

export type WebResearchQualityIssue =
  | "missing-evidence-or-provenance"
  | "missing-critical-review"
  | "missing-confidence"
  | "high-confidence-with-thin-evidence";

export interface WebResearchQualityResult {
  required: boolean;
  passed: boolean;
  issues: WebResearchQualityIssue[];
  evidenceCount: number;
}

function evidenceCount(text: string): number {
  const urlMatches = text.match(/https?:\/\/\S+/g) ?? [];
  const evidenceLines = text.split("\n").filter((line) => /Evidence:|출처|근거|published|updated|retrieved|full text|metadata/i.test(line));
  return Math.max(new Set(urlMatches).size, evidenceLines.length);
}

export function evaluateWebResearchQuality(mode: WorkMode, answer: string): WebResearchQualityResult {
  if (mode !== "web-analysis") return { required: false, passed: true, issues: [], evidenceCount: 0 };

  const issues: WebResearchQualityIssue[] = [];
  const evidence = evidenceCount(answer);
  const hasCriticalReview = /Critical review|비판|한계|caveat|conflict|충돌|불확실/i.test(answer);
  const hasConfidence = /Confidence:\s*(High|Medium|Low)/.test(answer);
  const claimsHigh = /Confidence:\s*High/.test(answer);

  if (evidence === 0) issues.push("missing-evidence-or-provenance");
  if (!hasCriticalReview) issues.push("missing-critical-review");
  if (!hasConfidence) issues.push("missing-confidence");
  if (claimsHigh && evidence < 2) issues.push("high-confidence-with-thin-evidence");

  return { required: true, passed: issues.length === 0, issues, evidenceCount: evidence };
}
```

- [ ] **Step 3: Strengthen prompt guardrails instead of building product UX**

Update `web-analysis-policy.ts` so the overlay explicitly says:

- `web-analysis` final answers must include `Conclusion`, `Evidence`, `Critical review`, and `Confidence`.
- `Confidence: High` is allowed only with at least two relevant source/provenance items and a critical review pass.
- If the answer lacks enough sources, it must report a blocker or lower confidence instead of claiming High.
- These requirements are mode-scoped and must not apply in default.

- [ ] **Step 4: Run Stage 2 tests**

Run:

```bash
pnpm vitest run tests/web-research-quality.test.ts tests/web-analysis-mode.test.ts
```

Expected: PASS.

- [ ] **Step 5: Retry/review loop**

If any Stage 2 test fails, do not weaken the guardrail. Fix the helper or prompt text, rerun focused tests, then proceed only after green.

---

### Task 8: Add full verification and version policy

**Files:**
- Modify: `package.json`
- Modify: `extensions/ddotz-autopilot/version.ts`
- Modify: `README.md`
- Existing footer tests only if version assertions fail.

- [ ] **Step 1: Choose version bump**

This is a meaningful new capability: bump minor from `0.1.7` to `0.2.0`.

In `package.json`:

```json
"version": "0.2.0"
```

In `extensions/ddotz-autopilot/version.ts`:

```ts
export const DDOTZ_PI_VERSION = "0.2.0" as const;
```

In `README.md` status:

```md
- Current package version: `0.2.0`.
```

- [ ] **Step 2: Run version and focused tests**

Run:

```bash
cd /Users/hyuns/code/ddotz-pi
pnpm run version:check
pnpm vitest run tests/web-analysis-mode.test.ts tests/policy.test.ts tests/work-mode-registry.test.ts tests/extension-commands.test.ts
```

Expected: version check OK and focused tests PASS.

- [ ] **Step 3: Run full gate**

Run:

```bash
cd /Users/hyuns/code/ddotz-pi
pnpm run check
```

Expected: `version:check`, `lint`, `typecheck`, and all Vitest tests PASS.

- [ ] **Step 4: Reload Pi runtime**

Run the LLM tool after code changes:

```text
reload_runtime
```

Expected: direct reload succeeds or tmux self-input queues `/reload-runtime --continue`; post-reload continue is received.

- [ ] **Step 5: Manual runtime dogfood**

In the reloaded Pi session, run:

```text
/mode set web-analysis
/mode status
```

Expected: UI notification includes `mode: web-analysis`.

Then ask a small web-analysis prompt:

```text
최근 pi.dev packages에서 web search 관련 패키지 후보를 근거 중심으로 비교해줘
```

Expected: response starts by collecting sources, cites package candidates, separates package facts from judgment, includes critical review, and uses web-analysis-specific source confidence language.

Switch back:

```text
/mode set default
```

Ask a non-web prompt:

```text
이 저장소 상태만 짧게 확인해줘
```

Expected: response does not include `Web Analysis Mode`, source confidence matrix, or retrieval-first workflow language.

---

### Task 9: Commit and push after verification

**Files:**
- All intentional implementation, docs, and test files.

- [ ] **Step 1: Inspect working tree**

Run:

```bash
cd /Users/hyuns/code/ddotz-pi
git status --short --untracked-files=all
```

Expected: only intentional source, docs, and test files are changed. No temp clone paths, caches, logs, private files, or generated artifacts.

- [ ] **Step 2: Commit**

Run:

```bash
git add extensions/ddotz-autopilot mode* README.md prompts/autopilot.md skills/ddotz-autopilot/SKILL.md tests package.json
git commit -m "feat: implement web-analysis mode"
```

If the broad `git add` includes unintended files, reset and add exact paths instead:

```bash
git reset
git add extensions/ddotz-autopilot/mode.ts extensions/ddotz-autopilot/mode-resource-policy.ts extensions/ddotz-autopilot/policy.ts extensions/ddotz-autopilot/version.ts extensions/ddotz-autopilot/web-analysis-policy.ts extensions/ddotz-autopilot/work-mode-registry.ts modes/web-analysis/MODE.md README.md prompts/autopilot.md skills/ddotz-autopilot/SKILL.md tests/web-analysis-mode.test.ts tests/policy.test.ts tests/work-mode-registry.test.ts tests/extension-commands.test.ts package.json
git commit -m "feat: implement web-analysis mode"
```

- [ ] **Step 3: Push**

Run:

```bash
git push origin main
```

Expected: push to `origin/main` succeeds. This is routine source synchronization, not package publishing or deployment.

---

## Acceptance Criteria

- `/mode set web-analysis` activates an implemented mode.
- `default` remains isolated: no web-analysis overlay strings, resource policy, retrieval-first workflow, or source confidence matrix appears in default prompt.
- `web-analysis` prompt includes fivetaku/insane-search retrieval guidance, source confidence scoring, and critical review.
- `coding`, `report`, and `adoption-analysis` remain planned.
- No Pi package is installed globally for web-analysis v1.
- No insane-search code is vendored into ddotz-pi.
- Tests cover mode isolation, mode activation, registry status, prompt overlay behavior, and web research quality guardrail helpers.
- `pnpm run check` passes.
- Runtime reload and mode dogfood pass.

## Deferred Follow-ups

These are deliberately not part of v1:

- Mode-scoped `pi.setActiveTools()` profiles with snapshot/restore. This needs careful tests to avoid disabling structural tools or leaking tool state into default.
- Optional adapter to `pi-smart-fetch` or `pi-web-access` if a future version can load it under a mode-scoped package filter without default contamination.
- A dedicated `web_research` Pi tool that wraps an installed external insane-search engine. This remains out of scope because the requested version manages research quality through mode-scoped process hooks and guardrails, not a search engine/router.
- Service UX features such as saved research, source explorer UI, exports, follow-up prompt UI, and product thread management.

## Self-Review

- Spec coverage: covers user request to start web-analysis development with fivetaku/insane-search, structured/latest/critical review, and mode isolation.
- Completeness scan: no unfinished markers, vague deferred implementation steps, or unspecified tests are present.
- Type consistency: `WorkMode`, `ModeResourcePolicy`, `buildModeResourcePolicy`, and `buildWebAnalysisModeGuidance` names are consistent across tasks.
- Scope check: this is one implementable mode-overlay milestone. Tool activation profiles and wrapper tools are deferred to avoid default-mode leakage.
