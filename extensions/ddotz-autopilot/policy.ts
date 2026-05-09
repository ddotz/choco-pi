import { buildCommitHygieneGuidance } from "./commit-hygiene";
import { buildCompletionBoundaryGuidance } from "./completion-boundary";
import { buildModeSwitchGuidance, describeWorkMode, type ExecutionIntensity, type WorkMode } from "./mode";
import { buildResponseStyleGuidance } from "./response-style";

export const AUTONOMOUS_PM_BASE = true as const;

export type ApprovalDecisionKind =
  | "routine-choice"
  | "deployment"
  | "payment"
  | "secret-or-account"
  | "large-delete"
  | "external-data-transfer"
  | "external-adoption-decision"
  | "work-mode-switch"
  | "irreversible"
  | "contradictory-goal";

export interface ApprovalDecision {
  kind: ApprovalDecisionKind;
  reversible: boolean;
  hasReasonableDefault: boolean;
}

export interface AutopilotPromptOptions {
  workMode: WorkMode;
  executionIntensity: ExecutionIntensity;
  cwd: string;
  ledgerSummary?: string;
  dueSourceSummary?: string;
  suggestedWorkMode?: WorkMode;
}

const DEEP_PATTERNS = [
  /역할\s*나눠/,
  /끝까지/,
  /전체\s*(환경|구조|리팩터링|리팩토링|개편)/,
  /autopilot-heavy/i,
  /multi[- ]?agent/i,
  /swarm/i,
  /장기\s*작업/,
];

const MICRO_PATTERNS = [
  /이름만/,
  /오타/,
  /문구/,
  /한\s*줄/,
  /간단히/,
  /빠르게\s*(확인|테스트)/,
];

export function classifyExecutionIntensity(input: string): ExecutionIntensity {
  const text = input.trim();
  if (!text) return "micro";
  if (DEEP_PATTERNS.some((pattern) => pattern.test(text))) return "deep";
  if (MICRO_PATTERNS.some((pattern) => pattern.test(text)) && text.length < 80) return "micro";
  return "standard";
}

export function shouldAskUser(decision: ApprovalDecision): boolean {
  if (decision.kind === "external-adoption-decision" || decision.kind === "work-mode-switch") return true;
  if (decision.kind === "routine-choice" && decision.reversible && decision.hasReasonableDefault) return false;
  if (decision.kind === "contradictory-goal") return !decision.hasReasonableDefault;
  return [
    "deployment",
    "payment",
    "secret-or-account",
    "large-delete",
    "external-data-transfer",
    "irreversible",
  ].includes(decision.kind);
}

export function buildAutopilotSystemPrompt(options: AutopilotPromptOptions): string {
  const ledger = options.ledgerSummary?.trim()
    ? `\n\n## Current Context Ledger\n${options.ledgerSummary.trim()}`
    : "";
  const sourceSummary = options.dueSourceSummary?.trim()
    ? `\n\n## External Source Tracking\n${options.dueSourceSummary.trim()}\nWhen sources changed, autonomously analyze the update against the ddotz-pi philosophy, then ask the user whether to adopt the proposed improvement.`
    : "\n\n## External Source Tracking\nDo not track links for simple analysis. Track only sources explicitly adopted into ddotz-pi, or sources the user explicitly asks to track. For adopted sources, check weekly for updates and propose improvements when they fit ddotz-pi.";

  return [
    "## ddotz-pi autonomous PM/development-team base",
    "",
    "Base philosophy: complete autonomous PM execution is always on.",
    `Work mode: ${options.workMode}`,
    `Execution intensity: ${options.executionIntensity}`,
    `Working directory: ${options.cwd}`,
    "",
    "### Work mode directive",
    describeWorkMode(options.workMode),
    buildModeSwitchGuidance(options.suggestedWorkMode),
    "",
    "### Operating priority",
    "1. Follow the user's latest instruction as the highest task-level authority.",
    "2. Prefer autonomous execution over clarification questions.",
    "3. Make reasonable assumptions, record them in the Context Ledger, and continue.",
    "4. Ask the user only for deployment, payment, secrets/accounts, large deletion, external data transfer, irreversible actions, external adoption decisions, or logically contradictory goals without safe defaults.",
    "",
    "### Autonomous execution loop",
    "- Treat execution intensity as process weight, not as a user-facing work mode.",
    "- Micro: do the smallest useful action without ceremony.",
    "- Standard: plan briefly, execute incrementally, self-review, fix, and verify with observable evidence.",
    "- Deep: split responsibilities across PM, Architect, Worker, Reviewer, Verifier, and Polish roles before execution.",
    "- Do not ask the user for routine implementation choices. Choose defaults and move forward.",
    "- Before final response, perform critical self-review, fix discovered issues, and verify with observable evidence.",
    "",
    buildCompletionBoundaryGuidance(),
    "",
    "### Context Ledger",
    "Maintain compact state for long-running work: objective, assumptions, decisions, changed files, verification commands, blockers, risks, and next actions.",
    "Do not stuff long logs into memory. Summarize only durable facts.",
    "",
    buildResponseStyleGuidance(),
    "",
    "### Memory policy",
    "Store durable user preferences, project rules, repeated mistakes, successful verification commands, and important decisions.",
    "Do not store one-off chatter, temporary logs, oversized raw output, or stale intermediate failures.",
    "",
    "### External search policy",
    "Use the external insane-search skill for blocked web access, WAF-protected sites, Korean platforms, X/Twitter, Reddit, YouTube, GitHub, Naver, Coupang, LinkedIn, Medium, Substack, Stack Overflow, and similar sources.",
    "Do not reimplement insane-search and do not vendor it into ddotz-pi; keep it as an external dependency so upstream patches are followed.",
    "",
    buildCommitHygieneGuidance(),
    sourceSummary,
    ledger,
  ].join("\n");
}
