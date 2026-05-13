# Advanced PRD Architect Design

## Objective

Strengthen choco-pi PRD work with an advanced-user PRD architect skill. The skill should preserve the useful ideas from `fivetaku/show-me-the-prd` while rejecting its beginner interview flow and Claude-specific runtime assumptions.

## External Source Review

Source: `https://github.com/fivetaku/show-me-the-prd` at `b1321f1729b3bd0b958a116f974a5a5072ff4b6f`.

Adopt at idea/prompt-policy depth:

- PRD output should be a coherent document set, not a single vague brief.
- Existing notes/specs should be gap-analyzed before asking anything.
- Research should happen before synthesis and be folded into decisions.
- Domain-specific document sets are useful when they fill requirements, structure, domain constraints, and AI execution rules.

Reject:

- AskUserQuestion-first beginner interview mechanics.
- Plain-language-only / no technical vocabulary stance.
- Claude Code plugin commands and Claude-only plugin dependency checks.
- Mandatory user confirmation for routine document-set selection.
- Code or template copying, because the repo has MIT metadata but no standalone LICENSE file in the checked tree.

Pi package catalog review: `pi.dev/packages` searches for PRD/requirements/product requirements did not show a high-similarity advanced PRD package. Interactive plan/review/question packages exist, but they conflict with the user's no-routine-questions direction.

## Desired Behavior

When the user asks for PRD, 기획서, requirements, product spec, 제품기획, or planning docs:

1. Treat the request as an advanced product/engineering brief, not a beginner interview.
2. Ask only if a missing fact creates a hard approval boundary, irreversible strategic choice, legal/compliance blocker, payment/secret/account issue, or logically contradictory goal with no safe default.
3. Otherwise infer safe defaults, record assumptions, and proceed.
4. Do retrieval-first research when claims depend on market, competitor, platform, regulation, pricing, or stack freshness.
5. Produce a deep document set sized to the problem:
   - `01_PRD.md`: outcome, users, jobs, constraints, scope, non-goals, acceptance signals.
   - `02_SYSTEM_MODEL.md` or domain-specific structure doc: data, workflows, integrations, states, risks.
   - `03_DELIVERY_PLAN.md`: phases, milestones, validation, launch/readiness gates.
   - `04_AGENT_SPEC.md`: AI execution rules, forbidden moves, verification commands, approval boundaries.
   - `README.md`: navigation, assumptions, open risks, next execution prompt.
6. Include decision records, assumptions ledger, risk register, explicit non-goals, and unresolved critical questions only when truly critical.
7. Integrate with dynamic SDD: PRD output can seed `spec_gate start`; PRD deltas should be handled explicitly.

## Implementation Shape

- Add a new Pi skill at `skills/prd-architect/SKILL.md`.
- Register it in `package.json` under `pi.skills`.
- Update `skills/choco-autopilot/SKILL.md` and `prompts/autopilot.md` so choco-pi routes PRD requests to the advanced PRD skill without routine clarification.
- Update README and version-bearing files.
- Add tests that assert the skill is exposed and enforces the advanced no-routine-questions contract.

## Acceptance Criteria

- `package.json` exposes `skills/prd-architect`.
- The skill triggers on PRD/기획서/product requirements/product spec requests.
- The skill explicitly rejects beginner-interview / AskUserQuestion-first behavior.
- The skill says to proceed with assumptions unless the question is critical.
- The skill requires research-backed decisions when external freshness matters.
- The skill requires deep doc sets with PRD, system/domain model, delivery plan, agent spec, and README.
- README/autopilot prompt mention the advanced PRD behavior.
- External source is tracked with `source_registry` as adopted idea/prompt-policy.
- `pnpm run check` passes and runtime reload is performed.

## Risks

- The PRD skill may become too heavy for small requests. Mitigation: scale document depth to task size, but still avoid shallow beginner interview mode.
- The skill may over-infer. Mitigation: assumptions and decision records must be explicit, and critical blockers remain ask-worthy.
- External source license uncertainty. Mitigation: no code/template copying; only idea/prompt-policy adoption.
