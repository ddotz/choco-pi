# Adoption Analysis Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `adoption-analysis` as a mode-scoped quality overlay for external source/package/repo adoption decisions, including explicit adoption depth review.

**Architecture:** Keep the existing default adoption capability in place. Activate `adoption-analysis` as an implemented mode that adds stricter prompt guidance and a message-end quality guard only while that mode is active. Extend the source registry data model to record how much of a source was adopted without forcing that strict structure into default mode.

**Tech Stack:** TypeScript, Pi extension hooks/commands/tools, Vitest, `pnpm run check`.

---

## File Structure

- Modify: `extensions/choco-autopilot/mode.ts` — mark `adoption-analysis` implemented and describe its active mode behavior.
- Modify: `extensions/choco-autopilot/work-mode-registry.ts` — show `adoption-analysis` as implemented in `/mode` selector/list.
- Create: `extensions/choco-autopilot/adoption-depth.ts` — shared adoption-depth enum and formatter.
- Modify: `extensions/choco-autopilot/source-registry.ts` — add optional structured adoption depth/review fields while preserving old `markSourceAdopted(..., adoptedItems[])` calls.
- Create: `extensions/choco-autopilot/adoption-analysis-policy.ts` — mode-scoped prompt overlay with decision + depth contract.
- Modify: `extensions/choco-autopilot/mode-resource-policy.ts` — add adoption-analysis resource/process priorities without affecting default.
- Create: `extensions/choco-autopilot/adoption-analysis-quality.ts` — message-end quality evaluator/repair prompt for adoption-analysis only.
- Modify: `extensions/choco-autopilot/policy.ts` — include adoption-analysis overlay only for that mode.
- Modify: `extensions/choco-autopilot/index.ts` — run adoption-analysis quality guard in `message_end` only when active.
- Modify: `modes/adoption-analysis/MODE.md`, `README.md`, `prompts/autopilot.md`, `skills/choco-autopilot/SKILL.md` — document implemented mode and adoption-depth contract.
- Modify: `package.json`, `extensions/choco-autopilot/version.ts`, `README.md` — bump to `0.3.0` because this is a meaningful new mode capability.
- Tests:
  - Create: `tests/adoption-analysis-mode.test.ts`
  - Create: `tests/adoption-analysis-quality.test.ts`
  - Modify: `tests/source-registry.test.ts`
  - Modify: `tests/policy.test.ts`
  - Modify: `tests/work-mode-registry.test.ts` if selector/list expectations need coverage.

## Task 1: RED — mode activation and policy isolation tests

- [ ] Add tests that `adoption-analysis` is implemented, no longer planned, and appears as implemented in `/mode` selector.
- [ ] Add tests that default prompt does not contain `### Adoption Analysis Mode`, while adoption-analysis prompt contains decision, depth, license/security, mode-isolation, tracking, and confidence contract.
- [ ] Run:

```bash
pnpm vitest run tests/policy.test.ts tests/adoption-analysis-mode.test.ts tests/work-mode-registry.test.ts tests/extension-commands.test.ts
```

Expected: FAIL because adoption-analysis is still planned and no policy overlay exists.

## Task 2: GREEN — mode activation and policy overlay

- [ ] Update `mode.ts` implemented/planned arrays and `describeWorkMode`.
- [ ] Update `work-mode-registry.ts` built-in `adoption-analysis` status/description.
- [ ] Create `adoption-depth.ts` with these exact depths:

```ts
export const ADOPTION_DEPTHS = [
  "idea-only",
  "prompt-policy",
  "test-only",
  "small-local-code",
  "partial-port",
  "dependency",
  "fork-or-vendor",
] as const;
```

- [ ] Create `adoption-analysis-policy.ts` that states `adoption-analysis` is only an overlay on top of default adoption capability and must include:
  - Decision: adopt / partially adopt / reject / watch
  - Adoption depth from the ladder
  - Fit review: choco-pi philosophy, mode isolation, duplication, Pi-native fit
  - Risk review: license, security, privacy, maintenance, reversibility
  - Scope: what to adopt and what not to adopt
  - Tracking decision
  - Confidence
- [ ] Wire the overlay in `policy.ts` only when `workMode === "adoption-analysis"`.
- [ ] Run the focused tests until green.

## Task 3: RED/GREEN — source registry adoption depth

- [ ] Add tests in `tests/source-registry.test.ts` that `markSourceAdopted` can store:
  - `adoptionDepth`
  - `adoptedItems`
  - `rejectedItems`
  - `lastReviewedRef`
  - `lastReviewedAt`
  - `scopeRationale`
  - clear `changedSinceLastCheck` after review when requested
- [ ] First run the source-registry tests and verify RED.
- [ ] Extend `ExternalSource` and `markSourceAdopted` with a backward-compatible options object:

```ts
markSourceAdopted(registry, id, review, {
  adoptionDepth: "partial-port",
  adoptedItems: ["mode-scoped quality guard"],
  rejectedItems: ["vendor whole runtime"],
  reviewedRef: "abc123",
  reviewedAt: new Date("2026-05-11T00:00:00Z"),
  scopeRationale: "Use the idea, not the package boundary.",
  clearChangedFlag: true,
});
```

- [ ] Preserve existing `markSourceAdopted(registry, id, review, ["source-registry"])` behavior.
- [ ] Run source-registry tests until green.

## Task 4: RED/GREEN — adoption-analysis quality guard

- [ ] Create tests for `evaluateAdoptionAnalysisQuality`:
  - default mode bypasses the guard
  - adoption-analysis answer missing decision fails
  - answer missing adoption depth fails
  - answer missing risk review fails
  - answer missing tracking decision fails
  - answer missing Confidence fails
  - structured answer with decision/depth/fit/risk/scope/tracking/confidence passes
- [ ] Add message_end hook test that active adoption-analysis queues `choco.adoption_analysis_quality.repair` for low-quality final answers.
- [ ] Implement `adoption-analysis-quality.ts` and wire it in `index.ts`.
- [ ] Run focused tests until green.

## Task 5: Docs, version, full verification, runtime reload, merge

- [ ] Update docs and mode file to mark adoption-analysis implemented and explain it does not replace default adoption capability.
- [ ] Bump version to `0.3.0` in `package.json`, `extensions/choco-autopilot/version.ts`, and README status.
- [ ] Run:

```bash
pnpm run check
```

Expected: version sync OK, lint OK, typecheck OK, all tests pass.

- [ ] Reload runtime because extension/skill/prompt resources changed.
- [ ] Commit on `feature/adoption-analysis-mode`, merge back to `main`, run `pnpm run check` on main, push.
