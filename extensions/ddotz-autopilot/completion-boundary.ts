export type FollowUpKind = "in-scope-required" | "nice-to-have" | "new-scope";

export interface CompletionState {
  requestedOutcomeSatisfied: boolean;
  verificationPassed: boolean;
  criticalIssuesRemaining: boolean;
  approvalBoundaryHit: boolean;
  followUpKind: FollowUpKind;
}

export function classifyFollowUp(text: string): FollowUpKind {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return "nice-to-have";

  if (/nice[- ]?to[- ]?have|polish later|optional|could also|추가로\s*하면\s*좋/i.test(normalized)) {
    return "nice-to-have";
  }
  if (/\b(someday|eventually|new scope|separate task|separate project)\b/i.test(normalized)) return "new-scope";
  if (/언젠가|나중에|별도\s*(작업|범위|프로젝트)|새로운\s*범위/i.test(text)) return "new-scope";
  if (/fail|failing|broken|regression|critical|blocker|introduced by this change|검증\s*실패|회귀|치명|블로커/i.test(text)) {
    return "in-scope-required";
  }
  return "nice-to-have";
}

export function shouldContinueAutonomousWork(state: CompletionState): boolean {
  if (state.approvalBoundaryHit) return false;
  if (!state.requestedOutcomeSatisfied) return true;
  if (!state.verificationPassed) return true;
  if (state.criticalIssuesRemaining) return true;
  return state.followUpKind === "in-scope-required";
}

export function buildCompletionBoundaryGuidance(): string {
  return [
    "### Completion boundary",
    "Stop when the requested outcome is satisfied, verification has passed, and no critical in-scope issue remains.",
    "Continue only for unmet requested outcomes, failed verification, or critical issues introduced by the current work.",
    "Stop at approval boundaries instead of continuing blindly.",
    "Do not convert nice-to-have or new-scope ideas into active work during the current run.",
    "Report follow-ups explicitly as optional or new-scope items instead of silently expanding the task.",
    "A final answer should include what was completed, verification evidence, and any deferred follow-ups.",
  ].join("\n");
}
