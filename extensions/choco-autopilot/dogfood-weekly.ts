import {
  DOGFOOD_MIN_REPEATED_PATTERN_COUNT,
  DOGFOOD_MIN_WEEKLY_CASES,
  type DogfoodCase,
  type DogfoodWeeklyReport,
} from "./dogfood-types";
import { repeatedDogfoodPatterns } from "./dogfood-scoring";

function roundRate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function flowSignature(item: DogfoodCase): string | undefined {
  const flow = item.flow ?? { toolSequence: [], commandSequence: [] };
  const tools = flow.toolSequence.join(">");
  const commands = flow.commandSequence.join(">");
  if (!tools && !commands) return undefined;
  return `tools:${tools || "none"} | commands:${commands || "none"}`;
}

function topFlowPatterns(cases: DogfoodCase[]): DogfoodWeeklyReport["topFlows"] {
  const grouped = new Map<string, DogfoodCase[]>();
  for (const item of cases) {
    const signature = flowSignature(item);
    if (!signature) continue;
    grouped.set(signature, [...(grouped.get(signature) ?? []), item]);
  }
  return [...grouped.entries()]
    .map(([signature, items]) => ({
      signature,
      count: items.length,
      sampleCaseIds: items.slice(0, 5).map((item) => item.id),
    }))
    .sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature))
    .slice(0, 5);
}

export function buildDogfoodWeeklyReport(week: string, cases: DogfoodCase[], generatedAt = new Date()): DogfoodWeeklyReport {
  const eligibleCases = cases.length;
  const clean = cases.filter((item) => item.outcome === "clean").length;
  const assisted = cases.filter((item) => item.outcome === "assisted").length;
  const miss = cases.filter((item) => item.outcome === "miss").length;
  const review = cases.filter((item) => item.outcome === "review").length;
  const repeatedPatterns = repeatedDogfoodPatterns(cases, DOGFOOD_MIN_REPEATED_PATTERN_COUNT);
  const topFlows = topFlowPatterns(cases);
  const sampleOk = eligibleCases >= DOGFOOD_MIN_WEEKLY_CASES;
  const patternOk = repeatedPatterns.length > 0;

  return {
    week,
    generatedAt: generatedAt.toISOString(),
    eligibleCases,
    clean,
    assisted,
    miss,
    review,
    cleanHitRate: eligibleCases ? roundRate(clean / eligibleCases) : 0,
    assistedRate: eligibleCases ? roundRate(assisted / eligibleCases) : 0,
    missRate: eligibleCases ? roundRate(miss / eligibleCases) : 0,
    reviewRate: eligibleCases ? roundRate(review / eligibleCases) : 0,
    repeatedPatterns,
    topFlows,
    autoImprovementAllowed: sampleOk && patternOk,
    autoImprovementReason: !sampleOk
      ? `Need at least ${DOGFOOD_MIN_WEEKLY_CASES} eligible cases before auto-improvement.`
      : !patternOk
        ? `Need at least ${DOGFOOD_MIN_REPEATED_PATTERN_COUNT} repeated assisted/miss cases for the same pattern.`
        : "Minimum sample and repeated-pattern thresholds passed.",
  };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatDogfoodWeeklyReport(report: DogfoodWeeklyReport): string {
  const patternLines = report.repeatedPatterns.length === 0
    ? ["- repeated patterns: none"]
    : report.repeatedPatterns.map((item) => `- ${item.key}: ${item.count} ${item.outcome} case(s)`);
  const flowLines = report.topFlows.length === 0
    ? ["- top flows: none"]
    : ["- top flows:", ...report.topFlows.map((item) => `  - ${item.signature}: ${item.count} case(s)`)];

  return [
    `Dogfood weekly report ${report.week}`,
    `- eligible cases: ${report.eligibleCases}`,
    `- clean hit rate: ${pct(report.cleanHitRate)}`,
    `- assisted: ${pct(report.assistedRate)}`,
    `- miss: ${pct(report.missRate)}`,
    `- review: ${pct(report.reviewRate)}`,
    `- auto-improvement: ${report.autoImprovementAllowed ? "allowed" : "blocked"} — ${report.autoImprovementReason}`,
    ...patternLines,
    ...flowLines,
  ].join("\n");
}
