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

export function buildDogfoodWeeklyReport(week: string, cases: DogfoodCase[], generatedAt = new Date()): DogfoodWeeklyReport {
  const eligibleCases = cases.length;
  const clean = cases.filter((item) => item.outcome === "clean").length;
  const assisted = cases.filter((item) => item.outcome === "assisted").length;
  const miss = cases.filter((item) => item.outcome === "miss").length;
  const review = cases.filter((item) => item.outcome === "review").length;
  const repeatedPatterns = repeatedDogfoodPatterns(cases, DOGFOOD_MIN_REPEATED_PATTERN_COUNT);
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

  return [
    `Dogfood weekly report ${report.week}`,
    `- eligible cases: ${report.eligibleCases}`,
    `- clean hit rate: ${pct(report.cleanHitRate)}`,
    `- assisted: ${pct(report.assistedRate)}`,
    `- miss: ${pct(report.missRate)}`,
    `- review: ${pct(report.reviewRate)}`,
    `- auto-improvement: ${report.autoImprovementAllowed ? "allowed" : "blocked"} — ${report.autoImprovementReason}`,
    ...patternLines,
  ].join("\n");
}
