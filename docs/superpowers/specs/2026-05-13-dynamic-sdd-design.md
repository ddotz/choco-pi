# Dynamic SDD Design

## Objective

Add a lightweight dynamic Spec-Driven Development layer to choco-pi so non-trivial work can start from a working spec, record spec deltas during execution, and compare completion against the latest accepted spec without replacing TDD or structural gates.

## Context

- choco-pi already injects default/autopilot policy, loop governance, structural gate, coding-mode TDD discipline, context ledger, and source tracking.
- The user approved adding Spec-Driven Development as a layer above the current TDD-first flow.
- `https://pi.dev/packages?search=spec|plan|sdd` showed adjacent packages (`@plannotator/pi-extension`, `taskplane`) but no high-fit package for this local dynamic SDD guard. Local implementation is lower-risk and better aligned with existing choco-pi policy/tools.

## Scope

In scope:

- Add a Pi-native `spec_gate` tool for per-turn working specs, snapshots, and deltas.
- Add prompt policy that tells agents when and how to use dynamic SDD.
- Keep TDD as the implementation proof layer.
- Update mode/skill/docs so behavior is durable and reproducible.
- Add tests for tool registration, validation, state transitions, and policy injection.

Out of scope:

- Persisting full spec history across sessions.
- Blocking every small task until a spec document exists.
- Replacing `structural_gate`, `loop_transition`, or TDD.
- Adopting/forking external packages.

## Architecture

- `extensions/choco-autopilot/dynamic-sdd.ts` owns the `spec_gate` tool and in-memory per-turn state.
- `extensions/choco-autopilot/dynamic-sdd-policy.ts` owns prompt guidance for the dynamic SDD layer.
- `extensions/choco-autopilot/index.ts` registers the tool alongside structural and source tools.
- `extensions/choco-autopilot/policy.ts` injects the dynamic SDD guidance into every choco-pi system prompt.
- Docs and mode files describe the layer as a lightweight base invariant, with coding mode applying it before TDD on non-trivial work.

## Tool behavior

`spec_gate` supports five actions:

1. `start`: create the working spec for the current turn.
2. `delta`: record a new fact, interpretation, or constraint discovered during work.
3. `snapshot`: capture the current accepted spec at a boundary.
4. `list`: show the current working spec, deltas, and snapshots.
5. `clear`: reset the current working spec.

Delta handling values:

- `in-scope`: merge provided scope/criteria/test/risk changes into the working spec.
- `deferred`: record as known but outside the active loop.
- `new-steering`: record that the user/agent needs a new steering loop.
- `new-loop`: record that follow-up implementation must start from a fresh loop.
- `approval-boundary`: record that the delta is blocked by a hard boundary.

## Acceptance Criteria

- `spec_gate` is registered by the choco-autopilot extension.
- `start` rejects missing objective, scope, acceptance criteria, or test strategy.
- `delta` rejects calls before `start` and requires explicit handling.
- In-scope deltas merge new scope/criteria/test/risk entries without duplicates.
- Non-in-scope deltas are recorded but do not silently mutate the accepted working spec.
- `snapshot` requires an active working spec and records a readable boundary snapshot.
- Policy prompt includes dynamic SDD guidance, spec delta rules, and the rule that SDD does not replace TDD.
- Base/coding/skill/README docs reflect the new layer.
- Version-bearing files are synchronized.
- `pnpm run check` passes.

## Risks

- Over-enforcement could slow down micro tasks. Mitigation: guidance says non-trivial work uses the tool; micro tasks can use inline spec.
- Agents might mutate specs to excuse failing tests. Mitigation: guidance explicitly forbids changing specs to make tests pass.
- Scope creep could be disguised as an in-scope delta. Mitigation: delta handling includes `new-loop`, `new-steering`, `deferred`, and approval-boundary choices, and loop governance still applies.
