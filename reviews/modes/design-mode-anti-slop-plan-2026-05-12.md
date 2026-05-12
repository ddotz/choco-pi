# Design Mode Anti-Slop & Korean Typography Improvement Plan

Date: 2026-05-12
Scope: `design` work-mode overlay only. Default/coding/report/web/adoption modes must not inherit these design defaults.

## Research findings

### Current choco-pi state

- `modes/design/MODE.md` and `extensions/choco-autopilot/design-policy.ts` already require a design brief, existing design-system scan, visual thesis, responsive/accessibility states, and browser-backed QA.
- `extensions/choco-autopilot/mode-resource-policy.ts` currently names `frontend-ui-ux`, `taste-skill`, `web-design-guidelines`, and `gstack`, but does not name `taste-ko` or slide-specific skills.
- `tests/design-mode.test.ts` verifies mode isolation and basic design guidance, but does not cover Korean line breaking, anti-slop language, or platform/artifact-specific design tracks.
- There is no design-mode message-end quality guard equivalent to `coding-quality`, `report-quality`, `web-research-quality`, or `adoption-analysis-quality`.

### Pi runtime constraints

- Pi skills are progressive-disclosure resources. The mode prompt should explicitly name the skills the model should load when relevant.
- Pi extensions can enforce quality in `message_end` and queue hidden repair follow-ups; existing choco-pi guard architecture already supports this pattern.
- Resource changes to prompts/extensions/skills require runtime reload after verification.

### Skill and guideline synthesis

- `taste-skill`: useful as the anti-slop base. Adopt locally as policy ideas only: concrete visual thesis, anti-Inter/default-SaaS bias, one accent color, no generic purple/blue glow, no 3-column card slop, full interaction states, motion/performance constraints.
- `taste-ko`: required for Korean-specific design. Adopt locally as policy ideas only: Pretendard-first Korean typography, `word-break: keep-all`, `text-wrap: balance`, Korean headings avoid `leading-none`, natural Korean copy, no Korean AI clichés, realistic Korean names/company/data, mobile tap target minimums.
- `web-design-guidelines`: use for browser UI QA. Key items to reflect: semantic controls, visible focus, labels, reduced motion, no `transition: all`, explicit image dimensions, safe areas, `Intl.*`, text overflow, empty states.
- `gstack`: browser-backed visual/DOM QA for web and slide HTML/PDF artifacts; native app work needs emulator/device evidence or a concrete blocker.
- `slides-grab` / `frontend-slides`: use when the requested design artifact is a presentation deck. Slide work needs story arc and export QA, not normal app flow/state QA.

### Pi package search

- `https://pi.dev/packages` was checked. The closest package was `@juicesharp/rpiv-pi@1.4.2`, MIT, a broad research/design/plan/implement/validate workflow.
- Decision: do not add it as a dependency. It is a workflow package, not a Korean UI typography/design-mode overlay, and would overlap choco-pi’s existing autonomy/guard system.
- Rejected scope: wholesale package adoption, vendoring its agents/skills, or replacing choco-pi mode flow.
- Idea-only note: its `frontend-design` skill reinforces style-system scan before aesthetic direction and explicit anti-slop aesthetic checkpoints. That idea matches existing choco-pi direction and is reflected as local policy language, not copied code.

## Product decision

Design mode must start by classifying the output artifact. A mobile app, desktop dashboard, and slide deck should not share the same checklist.

### Artifact tracks

| Track | Triggers | Primary design questions | QA evidence |
| --- | --- | --- | --- |
| Mobile web | mobile web, responsive page, landing page, PWA | thumb zones, safe areas, 360-430px layouts, 48px tap targets, viewport stability, no horizontal scroll | gstack responsive screenshots at mobile/tablet/desktop, DOM checks, console/network checks when implemented |
| Mobile app | iOS/Android app, native app, Expo/React Native/Flutter | platform navigation, tab/sheet patterns, touch states, safe-area insets, one-handed flow, offline/loading/error states | simulator/device screenshots or explicit blocker; web-only gstack is not enough |
| Desktop web | dashboard, SaaS web, admin, browser app | information density, keyboard/focus, URL state, hover/active states, wide breakpoints, tables/forms, empty/loading/error | gstack desktop and responsive screenshots, accessibility/DOM checks, console errors |
| Desktop app | Electron/Tauri/native desktop | window chrome, menus/shortcuts, resizable panes, command palette, platform conventions, file/open/save states | app runtime screenshots or explicit blocker; if app is webview, also run browser/webview QA where possible |
| Presentation slides | deck, 발표 자료, pitch deck, HTML slides, PPT/PDF | audience, narrative arc, slide sequence, visual rhythm, per-slide message, speaker notes, export format | HTML/PDF screenshot QA with gstack or export artifact inspection; app-state checklist is not applicable |

If the artifact type is unclear, choose the safest likely track from the user’s nouns and state the assumption. Ask only when mutually exclusive tracks would change the deliverable.

## Required design-mode behavior

1. **Artifact classification first**
   - Name the track before visual decisions.
   - Do not apply mobile heuristics to desktop apps or app-state heuristics to slide decks.

2. **Existing system scan**
   - Inspect `DESIGN.md`, tokens, CSS variables, Tailwind/theme config, component libraries, screenshots, and brand references before inventing visuals.
   - Existing project systems win unless the user explicitly requests an override.

3. **Anti-slop visual thesis**
   - Reject vague direction such as “modern”, “clean”, “polished”, or “premium” unless translated into concrete choices.
   - The thesis must specify tone, typography, color, spacing, surface/background, motion, interaction feel, and differentiation.
   - Ban common AI tells by default: Inter-as-premium, purple/blue neon SaaS glow, centered hero by default, three equal feature cards, generic startup names, round fake metrics, emoji decoration, and empty gradient-text drama.

4. **Korean-native typography and copy**
   - For Korean UI/copy: Pretendard-first body stack, `word-break: keep-all`, headings with `text-wrap: balance`, and `leading-tight` to `leading-snug`; never `leading-none` for Korean headings.
   - Avoid unnatural Korean line breaks by designing text containers for Korean phrase units and reviewing mobile/slide breakpoints visually.
   - Use natural 존댓말 copy. Avoid Korean AI clichés such as “혁신적인”, “차세대”, “획기적인”, “게임 체인저”, “한 차원 높은”, and “~의 세계로”.
   - Use realistic Korean names, companies, and organic numbers when examples are needed.

5. **Track-specific state and accessibility**
   - Web/app artifacts require empty, loading, error, disabled, hover, active, keyboard/focus, and reduced-motion states.
   - Slides require title/body hierarchy, speaker flow, export-safe typography, and overrun checks rather than form states.

6. **Verification contract**
   - Browser-impacting web/slide work needs gstack screenshots/DOM evidence before `Confidence: High`.
   - Native app work needs simulator/device/runtime evidence or an explicit blocker.
   - Design-only briefs are verified by traceability: every recommendation maps to a goal, existing evidence, track rule, or explicit assumption.

## Implementation plan

### Task 1: Prompt/resource policy tests

Files:

- Modify: `tests/design-mode.test.ts`
- Modify: `extensions/choco-autopilot/mode-resource-policy.ts`
- Modify: `extensions/choco-autopilot/design-policy.ts`
- Modify: `modes/design/MODE.md`

Steps:

1. Add failing tests that design mode includes `taste-ko`, slide-specific resources, anti-slop constraints, Korean line-break rules, and artifact-track classification.
2. Run targeted test: `pnpm vitest run tests/design-mode.test.ts` and confirm it fails for missing `taste-ko` / artifact-track content.
3. Update resource policy and design guidance.
4. Update `modes/design/MODE.md` so docs match runtime prompt.
5. Re-run targeted test and confirm green.

### Task 2: Design quality guard tests and implementation

Files:

- Create: `extensions/choco-autopilot/design-quality.ts`
- Create: `tests/design-quality.test.ts`
- Modify: `extensions/choco-autopilot/index.ts`

Steps:

1. Add failing tests for `evaluateDesignQuality()`:
   - bypasses non-design modes,
   - flags design completions without artifact track,
   - flags design completions without visual thesis,
   - flags design completions without Korean typography/line-break criteria,
   - passes a structured design-mode answer,
   - does not block plain status answers.
2. Add failing integration test that `message_end` queues a hidden design-quality repair in design mode.
3. Run targeted test: `pnpm vitest run tests/design-quality.test.ts` and confirm RED.
4. Implement `design-quality.ts` using the existing guard pattern.
5. Wire it into `index.ts` repair state and guard pipeline.
6. Re-run targeted test and confirm GREEN.

### Task 3: README and version sync

Files:

- Modify: `README.md`
- Maybe modify: `package.json`, `extensions/choco-autopilot/version.ts`

Steps:

1. Document that design mode now includes anti-slop, Korean typography, and artifact-track routing.
2. Choose patch bump because this is a small runtime behavior change to design mode guidance/guardrails.
3. Keep `package.json`, `extensions/choco-autopilot/version.ts`, and README current version synchronized.
4. Run `pnpm run version:check`.

### Task 4: Full verification, cleanup, reload, commit, push

Steps:

1. Run targeted tests first:
   - `pnpm vitest run tests/design-mode.test.ts tests/design-quality.test.ts`
2. Run full gate:
   - `pnpm run version:check && pnpm run lint && pnpm run typecheck && pnpm run test`
3. Do a small technical-debt cleanup pass: duplicate text, stale names, mode isolation, prompt/doc drift.
4. Re-run full gate.
5. Inspect `git status --short --untracked-files=all` and exclude generated/temp files.
6. Reload Pi runtime with `reload_runtime` because extension and mode prompt behavior changed.
7. Commit and push intentional changes if a remote is configured.

## Acceptance criteria

- Design mode resources include `taste-ko` and slide-oriented skills without leaking to default mode.
- Design mode prompt and `modes/design/MODE.md` require artifact-track classification first.
- Korean UI/copy guidance explicitly requires Pretendard-first typography, `word-break: keep-all`, `text-wrap: balance`, non-`leading-none` Korean headings, natural Korean copy, and AI cliché avoidance.
- Anti-slop guidance explicitly rejects generic modern/clean/premium language unless converted into concrete design choices.
- Design quality guard blocks incomplete design-mode completion answers and self-repairs via hidden follow-up.
- Plain design-mode status answers are not blocked.
- Full project quality gate passes after cleanup.
