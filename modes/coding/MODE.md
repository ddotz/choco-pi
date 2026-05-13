# Coding Mode

Status: implemented.

Mode isolation: this overlay applies only while work mode is `coding`. Do not apply this strict coding contract in `default`.

Purpose:

- Execute implementation, refactoring, debugging, tests, and build fixes with tight verification loops.
- Bias toward caution over speed. For trivial tasks, use judgment, but still keep changes surgical and verification explicit.
- Prevent common LLM coding mistakes: unsupported assumptions, speculative abstractions, broad refactors, weak success criteria, and unverified completion claims.

## Philosophy

### Think Before Coding

- Do not assume. State assumptions explicitly when ambiguity or tradeoffs exist.
- Do not hide confusion. If something is unclear but has a safe, reversible default, state the assumption and continue; ask only when no safe default exists or the goal is contradictory.
- If multiple interpretations exist, choose the safe, reversible default and present the assumption unless approval-boundary risk requires asking.
- If a simpler approach solves the problem, use it and push back on unnecessary complexity.

### Simplicity First

- Write the minimum code that solves the verified problem.
- No features beyond what was asked.
- No abstractions for single-use code.
- No flexibility or configurability that was not requested.
- No error handling for impossible scenarios.
- If a solution is much longer than necessary, simplify before final verification.

### Surgical Changes

- Touch only what the current goal requires.
- Match existing style, even if a different style seems preferable.
- Do not improve adjacent code, comments, or formatting unless required.
- Do not refactor unrelated code.
- Remove imports, variables, functions, tests, and files that your own changes made unused.
- Mention unrelated dead code or debt; do not delete it unless asked.
- Every changed line should trace directly to the user's request or to cleanup caused by the current change.

### Goal-Driven Execution

- Convert each task into verifiable goals before editing.
- `Add validation` means write tests for invalid inputs, then make them pass.
- `Fix the bug` means reproduce with a failing test or observable symptom, then make it pass.
- `Refactor X` means verify before and after.
- Multi-step work needs a brief plan with a verification check per step.

### Dynamic SDD before TDD

- For non-trivial coding work, start from a Working Spec before editing: objective, scope, acceptance criteria, test strategy, and risks.
- Use `spec_gate` when available to record the Working Spec, Spec Deltas, and snapshots.
- Record discovered requirements or constraints as Spec Deltas; in-scope deltas may update the accepted spec, while deferred/new-loop/new-steering/approval-boundary deltas must not mutate the active scope.
- SDD does not replace TDD. The Working Spec defines the target; RED/GREEN verification proves behavior.
- Do not rewrite the spec to make a failing test pass. Fix the code or route the change through loop governance.

## Required coding loop

1. Define assumptions, Working Spec/scope, success criteria, and files likely to change.
2. Write or identify a failing test / failing symptom / baseline verification before implementation.
3. Run it and record RED, or explain why a test cannot be created and what observable symptom substitutes for it.
4. Implement the smallest surgical change.
5. Run targeted verification.
6. Fix failures by returning to root-cause investigation, not by guessing.
7. Run the full relevant quality gate before completion.
8. Review diff for simplicity, scope control, orphaned code, and commit hygiene.
9. Report Result, Verification, Confidence; for bugfixes include RED, Root cause, Fix, GREEN.

## Debugging rule

- Use systematic debugging before fixing unexpected behavior.
- Reproduce consistently, read the error, inspect recent changes, trace data flow, form one hypothesis, test it minimally, and only then implement.
- If three fix attempts fail, stop and question the architecture instead of piling on another patch.

## Verification rule

- Default project gate for Node/choco-pi work: `pnpm run version:check && pnpm run lint && pnpm run typecheck && pnpm run test`.
- Run targeted tests first, then full gate for non-trivial changes.
- UI or browser-impacting changes require gstack QA evidence or a concrete blocker; without that, do not claim `Confidence: High` for UI behavior.
- If verification cannot run, report the blocker and lower confidence.

## Coding quality guard

- Final completion reports must include `Result`, `Verification`, and `Confidence`.
- Bugfix/regression-fix reports must also include `RED`, `Root cause`, `Fix`, and `GREEN`.
- Do not claim completion with missing verification, vague `should work` language, or Medium confidence.
- The mode-scoped message-end quality guard may block incomplete coding completion reports and ask for repair.

## External workflow adoption stance

- OMC/OMO/Claude Code-style lifecycle ideas may inform hooks and role discipline, but Claude-only runtime state, commands, or hooks must not be copied into Pi.
- bkit-style PDCA/context-engineering ideas may inform planning language, but wholesale workflow vendoring is not required.
- gstack is an optional QA adapter for browser/UI flows, not the coding-mode core.
- Prefer choco-pi local guardrails and Pi-native tools before adopting external dependencies.
