export function buildDynamicSddGuidance(): string {
  return [
    "### Dynamic SDD layer",
    "- Use dynamic Spec-Driven Development as a lightweight layer above implementation: Working Spec → TDD → implementation → Spec Delta handling → structural_gate.",
    "- For non-trivial feature, behavior, mode, runtime, or multi-file work, call spec_gate start before implementation with objective, scope, acceptanceCriteria, testStrategy, and risks.",
    "- For micro tasks, an inline Working Spec is acceptable, but final acceptance still compares the result against the user's latest request and assumptions.",
    "- Record a Spec Delta with spec_gate delta whenever new facts, constraints, interpretations, or scope changes appear during work.",
    "- Handle every Spec Delta explicitly as in-scope, deferred, new-steering, new-loop, or approval-boundary; never silently append scope to the active loop.",
    "- In-scope deltas may update the Working Spec; deferred/new-loop/new-steering/approval-boundary deltas must not mutate the accepted active scope.",
    "- SDD does not replace TDD: the Working Spec defines what to build, and TDD/verification proves the behavior.",
    "- Do not change the Working Spec just to make a failing test pass; fix the implementation or route the change through a fresh loop/approval boundary.",
    "- Before final completion, structural_gate.acceptanceFit should compare the actual result against the latest accepted Working Spec and any handled Spec Delta.",
  ].join("\n");
}
