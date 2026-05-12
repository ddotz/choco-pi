# Design Mode

Status: implemented.

Mode isolation: this overlay applies only while work mode is `design`. Do not apply design-mode defaults in `default`.

Purpose:

- Create deliberate product/UI/UX direction before implementation.
- Replace vague “modern/clean/polished” defaults with a specific visual thesis and verifiable QA criteria.
- Keep existing brand, DESIGN.md, tokens, and component systems as the first source of truth.

## Design brief discipline

1. Define product goal, audience, primary journey, brand constraints, and success criteria.
2. Inspect available style context: DESIGN.md, CSS variables, tokens, Tailwind/theme config, component library, screenshots, and brand references.
3. Choose a concrete visual thesis across tone, typography, color, spacing, surfaces/backgrounds, motion, and differentiation.
4. State assumptions explicitly when project context is missing, then proceed with safe reversible defaults.
5. Separate design decisions from implementation tasks; code changes still need coding-mode style verification when they begin.

## UX and visual critique

- Start with user goals, information architecture, interaction states, accessibility, and hierarchy before decoration.
- Include empty, loading, error, disabled, hover/focus, and responsive states for UI artifacts.
- Prefer named patterns, concrete tradeoffs, and evidence from the product context over broad taste claims.
- Respect existing systems unless the user explicitly requests a redesign or override.

## Verification

- For browser/UI-impacting work, run gstack QA or provide screenshot/DOM evidence before claiming `Confidence: High`.
- Verify relevant breakpoints and critical states, not just the happy-path desktop view.
- For design briefs without code, verify traceability: every recommendation must map to a goal, evidence source, or explicit assumption.

## Output contract

- Chosen visual direction and UX rationale.
- Key decisions and constraints.
- Verification evidence or concrete blocker.
- Deferred implementation follow-ups when relevant.
- Confidence: High only when context scan/design QA passed and no critical ambiguity remains.
