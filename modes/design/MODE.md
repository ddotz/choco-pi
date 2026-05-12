# Design Mode

Status: implemented.

Mode isolation: this overlay applies only while work mode is `design`. Do not apply design-mode defaults in `default`.

Purpose:

- Create deliberate product/UI/UX direction before implementation.
- Replace vague “modern/clean/polished/premium” defaults with a specific visual thesis and verifiable QA criteria.
- Prevent AI slop by forcing artifact-specific design decisions, existing-system scans, and anti-generic visual constraints.
- Keep Korean UI/copy native: natural 존댓말, Pretendard-first typography, and no unnatural Korean line breaks.
- Keep existing brand, DESIGN.md, tokens, and component systems as the first source of truth.

## Artifact-track routing

Design mode must classify the requested artifact before visual decisions:

| Track | Use when | Primary design focus | Verification |
| --- | --- | --- | --- |
| Mobile web | responsive page, landing page, PWA, mobile web flow | 360-430px layouts, thumb zones, safe areas, 48px tap targets, viewport stability, no horizontal scroll | gstack responsive screenshots/DOM checks |
| Mobile app | iOS/Android/native/React Native/Flutter app | platform navigation, tab/sheet patterns, touch states, safe-area insets, offline/loading/error states | simulator/device screenshots or concrete blocker |
| Desktop web | dashboard, browser app, admin/SaaS web | density, keyboard/focus, URL state, hover/active states, wide breakpoints, tables/forms | gstack desktop/responsive QA and console/DOM checks |
| Desktop app | Electron/Tauri/native desktop app | window chrome, menus/shortcuts, resizable panes, command palette, file/open/save states | app runtime screenshot evidence or blocker |
| Presentation slides | 발표용 슬라이드, pitch deck, HTML/PDF/PPT deck | audience, narrative arc, slide sequence, per-slide hierarchy, speaker flow, export-safe typography | gstack/artifact screenshot or export QA |

If the artifact type is unclear, choose the safest likely track from the user’s nouns, state the assumption, and ask only when mutually exclusive tracks would change the deliverable.

## Design brief discipline

1. Define product goal, audience, primary journey or slide narrative, brand constraints, artifact track, and success criteria.
2. Inspect available style context: DESIGN.md, CSS variables, tokens, Tailwind/theme config, component library, screenshots, brand references, and prior slides when relevant.
3. Choose a concrete visual thesis across tone, typography, color, spacing, surfaces/backgrounds, motion, interaction feel, and differentiation.
4. State assumptions explicitly when project context is missing, then proceed with safe reversible defaults.
5. Separate design decisions from implementation tasks; code changes still need coding-mode style verification when they begin.

## Anti-slop visual thesis

- Treat AI slop as a failure mode, not a taste nit.
- Do not accept generic “modern”, “clean”, “polished”, or “premium” as design direction until they are translated into concrete choices.
- Avoid default AI tells: Inter-as-premium, generic SaaS purple/blue glow, centered hero by default, three equal feature-card rows, emoji decoration, fake round metrics, generic startup names, and empty gradient-text drama.
- Prefer named patterns and concrete tradeoffs: split hero, asymmetric bento, editorial hierarchy, dense cockpit, command-palette desktop, mobile bottom-sheet flow, or slide storyboard.
- Use `taste-skill` and `taste-redesign` for anti-slop pressure, but keep choices fitted to the artifact track and existing project system.

## Korean typography and copy

- For Korean UI/copy, use `taste-ko` as a design-mode overlay, not as a forced standalone-HTML or landing-page default.
- Pretendard is the default Korean body font direction unless the existing project system explicitly defines another Korean-safe stack.
- Korean text blocks must specify `word-break: keep-all` or an equivalent class such as `break-keep` / `break-keep-all`.
- Korean headings should use `text-wrap: balance` where supported and must use `leading-tight` to `leading-snug`; `leading-none` is forbidden for Korean headings.
- Review Korean line breaks visually at mobile breakpoints and in Presentation slides. Avoid splitting Korean phrase units awkwardly.
- Use natural Korean 존댓말 copy. Avoid AI clichés such as “혁신적인”, “획기적인”, “차세대”, “원활한”, “게임 체인저”, “한 차원 높은”, and “~의 세계로”.
- Use realistic Korean names, companies, and organic numbers when examples are needed.

## UX and visual critique

- Start with user goals, information architecture, interaction states, accessibility, and hierarchy before decoration.
- Include empty, loading, error, disabled, hover/focus, active, keyboard/focus, reduced-motion, and responsive states for web/app artifacts.
- For Presentation slides, replace app-state checklists with story arc, slide hierarchy, export-safe typography, speaking rhythm, and Korean line-overrun checks.
- Prefer named patterns, concrete tradeoffs, and evidence from the product context over broad taste claims.
- Respect existing systems unless the user explicitly requests a redesign or override.

## Verification

- For browser/UI-impacting web or Presentation slides work, run gstack QA or provide screenshot/DOM evidence before claiming `Confidence: High`.
- Verify relevant breakpoints and critical states, not just the happy-path desktop view.
- For native Mobile app or Desktop app work, provide simulator/device/runtime evidence or a concrete blocker; browser-only evidence is not enough.
- For Korean UI/copy, include Korean line-break and typography QA in verification.
- For design briefs without code, verify traceability: every recommendation must map to a goal, evidence source, artifact-track rule, or explicit assumption.

## Output contract

- Final design-mode reports include Result, Verification, Notes, and Confidence.
- Result includes artifact track, visual thesis, Korean typography/line-break decisions when Korean appears, key UX decisions, and constraints.
- Verification includes context scan/design QA evidence or a concrete blocker.
- Notes include explicit assumptions and deferred implementation follow-ups when relevant.
- Confidence: High only when context scan/design QA passed and no critical ambiguity remains.
