import type { DogfoodCase, DogfoodWeeklyPattern } from "./dogfood-types";

export function scoreDogfoodCase(input: DogfoodCase): DogfoodCase {
  const reasons: string[] = [];
  let outcome: DogfoodCase["outcome"] = "review";
  let confidence: DogfoodCase["outcomeConfidence"] = "Medium";
  let repeatedPatternKey: string | undefined;

  if (input.verification.required && input.verification.passed) reasons.push("verification passed");
  if (input.gates.structuralRequired && input.gates.structuralPassed) reasons.push("required structural gate passed");

  const failedVerification = input.verification.required && !input.verification.passed;
  const failedGate = input.gates.structuralRequired && !input.gates.structuralPassed;
  if (failedVerification || failedGate) {
    outcome = "miss";
    confidence = "High";
    repeatedPatternKey = `${input.taskType}:verification-or-gate-failed`;
    if (failedVerification) reasons.push("required verification failed");
    if (failedGate) reasons.push("required structural gate failed");
  } else if (input.gates.repairQueued || input.verification.failedCommands.length > 0 || input.userSteeringSignals.length > 0) {
    outcome = "assisted";
    confidence = "High";
    repeatedPatternKey = `${input.taskType}:repair-or-recovery`;
    if (input.gates.repairQueued) reasons.push("internal repair was needed");
    if (input.verification.failedCommands.length > 0) reasons.push("verification recovered after failure");
    if (input.userSteeringSignals.length > 0) reasons.push("user steering was needed");
  } else if ((input.verification.required ? input.verification.passed : true) && (input.gates.structuralRequired ? input.gates.structuralPassed : true)) {
    outcome = input.verification.required || input.gates.structuralRequired ? "clean" : "review";
    confidence = outcome === "clean" ? "High" : "Medium";
    if (outcome === "clean") reasons.push("no repair or steering signals detected");
    if (outcome === "review") reasons.push("no strong automatic outcome signal");
  }

  return { ...input, outcome, outcomeConfidence: confidence, ruleReasons: reasons, repeatedPatternKey };
}

export function repeatedDogfoodPatterns(cases: DogfoodCase[], minimumCount: number): DogfoodWeeklyPattern[] {
  const grouped = new Map<string, DogfoodCase[]>();
  for (const item of cases) {
    if ((item.outcome !== "assisted" && item.outcome !== "miss") || !item.repeatedPatternKey) continue;
    grouped.set(item.repeatedPatternKey, [...(grouped.get(item.repeatedPatternKey) ?? []), item]);
  }

  return [...grouped.entries()]
    .filter(([, items]) => items.length >= minimumCount)
    .map(([key, items]) => ({
      key,
      outcome: items.some((item) => item.outcome === "miss") ? "miss" : "assisted",
      count: items.length,
      sampleCaseIds: items.slice(0, 5).map((item) => item.id),
      reasons: Array.from(new Set(items.flatMap((item) => item.ruleReasons))).slice(0, 8),
    }));
}
