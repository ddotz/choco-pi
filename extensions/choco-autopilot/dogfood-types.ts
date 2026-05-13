export type DogfoodOutcome = "clean" | "assisted" | "miss" | "review";
export type DogfoodConfidence = "High" | "Medium" | "Low";
export type DogfoodMemoryMode = "off" | "readonly" | "manual" | "auto";
export type DogfoodScopeKind = "project" | "personal" | "scratch" | "global" | "off";

export interface DogfoodVerificationSignals {
  required: boolean;
  passed: boolean;
  failedCommands: string[];
  passedCommands: string[];
}

export interface DogfoodGateSignals {
  structuralRequired: boolean;
  structuralPassed: boolean;
  loopTransitions: number;
  repairQueued: boolean;
}

export interface DogfoodScopeSignals {
  kind: DogfoodScopeKind;
  memoryMode: DogfoodMemoryMode;
  projectId?: string;
  projectRootHash?: string;
  projectLabel?: string;
  capture: boolean;
  reason?: string;
}

export interface DogfoodFlowSignals {
  toolSequence: string[];
  commandSequence: string[];
}

export interface DogfoodCase {
  id: string;
  week: string;
  startedAt: string;
  endedAt?: string;
  promptHash: string;
  promptSummary?: string;
  cwdHash?: string;
  projectLabel?: string;
  workMode: string;
  executionIntensity: string;
  taskType: string;
  model?: string;
  toolCounts: Record<string, number>;
  scope: DogfoodScopeSignals;
  flow: DogfoodFlowSignals;
  verification: DogfoodVerificationSignals;
  gates: DogfoodGateSignals;
  userSteeringSignals: string[];
  outcome: DogfoodOutcome;
  outcomeConfidence: DogfoodConfidence;
  ruleReasons: string[];
  judgeReason?: string;
  repeatedPatternKey?: string;
}

export interface DogfoodWeeklyPattern {
  key: string;
  outcome: Exclude<DogfoodOutcome, "clean" | "review">;
  count: number;
  sampleCaseIds: string[];
  reasons: string[];
}

export interface DogfoodFlowPattern {
  signature: string;
  count: number;
  sampleCaseIds: string[];
}

export interface DogfoodWeeklyReport {
  week: string;
  generatedAt: string;
  eligibleCases: number;
  clean: number;
  assisted: number;
  miss: number;
  review: number;
  cleanHitRate: number;
  assistedRate: number;
  missRate: number;
  reviewRate: number;
  repeatedPatterns: DogfoodWeeklyPattern[];
  topFlows: DogfoodFlowPattern[];
  autoImprovementAllowed: boolean;
  autoImprovementReason: string;
}

export const DOGFOOD_DETAIL_RETENTION_WEEKS = 12;
export const DOGFOOD_MIN_WEEKLY_CASES = 25;
export const DOGFOOD_MIN_REPEATED_PATTERN_COUNT = 3;
