import { classifyApprovalBoundaryCommand } from "./approval-boundary";
import type { AutonomyProtocolKind, AutonomyProtocolTaskStatus } from "./autonomy-protocol";
import { explicitNoExternalResearchRequested, hasReportIntent } from "./mode";

export interface AutonomyRouterCurrentProtocol {
  id: string;
  kind: AutonomyProtocolKind;
  taskStatus?: AutonomyProtocolTaskStatus;
  requiredTools: string[];
  satisfiedTools?: string[];
  blockedTools?: unknown[];
}

export interface AutonomyRouterInput {
  prompt: string;
  cwd: string;
  sessionId: string;
  hasActiveManifest: boolean;
  activeLaneId?: string;
  currentBranch?: string | null;
  currentProtocol?: AutonomyRouterCurrentProtocol;
}

export interface AutonomyRouterDecision {
  protocolKind: AutonomyProtocolKind;
  requiredTools: string[];
  hardBoundary?: string;
  reason: string;
  resumeExisting?: boolean;
}

const PARALLEL_PATTERNS = [
  /병렬/,
  /멀티세션/,
  /나눠서/,
  /parallel/i,
  /multi[- ]?session/i,
];

const BRANCH_PATTERNS = [
  /브랜치/,
  /\bbranch\b/i,
  /\b(?:feature|fix|bugfix|hotfix|release|chore)\/[A-Za-z0-9._/-]+\b/,
];

const CONTINUATION_PATTERNS = [
  /계속/,
  /이어/,
  /진행/,
  /다음/,
  /마저/,
  /continue/i,
  /resume/i,
  /proceed/i,
  /next/i,
];

const INTEGRATION_PATTERNS = [
  /마무리/,
  /완료/,
  /통합/,
  /머지/,
  /마쳐/,
  /merge/i,
  /integrat(?:e|ion)/i,
  /finish/i,
  /complete/i,
];

const MICRO_CODING_PATTERNS = [
  /오타/,
  /문구/,
  /한\s*줄/,
  /이름만/,
  /간단히/,
  /small/i,
  /typo/i,
  /rename/i,
  /one[- ]?line/i,
];

const NON_TRIVIAL_DEEP_PATTERNS = [
  /전체/,
  /끝까지/,
  /구조/,
  /리팩터링|리팩토링/,
  /구현/,
  /버그/,
  /테스트/,
  /검증/,
  /implement/i,
  /refactor/i,
];

const ULW_EXPLICIT_PATTERNS = [
  /\bulw\b/i,
  /\bulw-loop\b/i,
  /\bultrawork\b/i,
  /울트라워크/,
];

const ULW_AUTONOMOUS_PATTERNS = [
  /완전\s*자율/,
  /알아서/,
  /끝까지/,
  /완료까지/,
  /검증까지/,
  /하네스/,
  /컨텍스트/,
  /\bautonomous\b/i,
  /\bharness\b/i,
  /preserv(?:e|ing)\s+context/i,
  /\bcontext\b/i,
  /\btmux\b/i,
  /검증/,
  /\bevidence\b/i,
  /evidence[- ]?led/i,
  /manual[- ]?qa/i,
  /(?:to|until)\s+completion/i,
];

const ACTION_PATTERNS = [
  /구현/,
  /수정/,
  /고쳐/,
  /버그/,
  /테스트/,
  /검증/,
  /만들/,
  /반영/,
  /적용/,
  /리팩터링|리팩토링/,
  /실행/,
  /진행/,
  /fix/i,
  /implement/i,
  /build/i,
  /test/i,
  /verify/i,
  /run/i,
];

const PROMPT_APPROVAL_PATTERNS: Array<{ kind: string; pattern: RegExp; command: string }> = [
  { kind: "deployment", pattern: /\bnpm\s+publish\b|\bpnpm\s+publish\b|\bdeploy\b|배포|publish/i, command: "npm publish" },
  { kind: "payment", pattern: /payment|stripe|paypal|결제|환불/i, command: "stripe charges" },
  { kind: "secret-or-account", pattern: /secret|credential|token|account|logout|비밀|토큰|계정|로그인\s*(?:해|하|시도|진행)|\blogin\s+(?:to|with)\b/i, command: "gh auth login" },
  { kind: "large-delete", pattern: /rm\s+-rf|대량\s*삭제|전부\s*삭제/i, command: "rm -rf /" },
  { kind: "external-data-transfer", pattern: /private\s*data|upload|scp|rsync|외부\s*전송|개인정보/i, command: "scp file host:/tmp" },
  { kind: "irreversible", pattern: /reset\s+--hard|git\s+clean|force\s+push|강제\s*푸시|되돌릴\s*수\s*없/i, command: "git reset --hard" },
];

const APPROVAL_REFERENCE_PATTERNS = [
  /\bPRD\b|product\s+requirements?|requirements?\s+doc|기획서|요구사항|비목표|non[- ]?goals?/i,
  /Acceptance\s+Criteria|Expected|Prompt:|예시|시나리오|approval[- ]boundary|hard\s+boundary/i,
  /자동\s*(?:우회|실행\s*제외)/i,
  /(?:배포|publish|deploy)(?:하지\s*(?:말|않)|\s*(?:없이|제외|금지))|(?:do\s+not|don't|without)\s+(?:deploy|publish)/i,
];

function matchesAny(prompt: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(prompt));
}

export function requiredToolsForProtocol(kind: AutonomyProtocolKind): string[] {
  if (kind === "micro-coding") return ["structural_gate"];
  if (kind === "single-branch") return ["branch_switch_guard", "structural_gate"];
  if (kind === "coding") return ["spec_gate", "structural_gate"];
  if (kind === "parallel-work") return ["spec_gate", "parallel_work_plan", "agent_orchestrator", "worktree_manage", "integration_verifier", "structural_gate"];
  if (kind === "worktree-lane") return ["agent_orchestrator", "worktree_manage", "write_scope_guard", "structural_gate"];
  if (kind === "integration") return ["integration_verifier", "structural_gate"];
  if (kind === "ulw") return ["spec_gate", "ulw_harness", "structural_gate"];
  if (kind === "report-research") return ["spec_gate", "report_research_gate", "structural_gate"];
  return [];
}

function approvalBoundaryReferenceOnly(prompt: string): boolean {
  return matchesAny(prompt, APPROVAL_REFERENCE_PATTERNS);
}

function approvalBoundaryForPrompt(prompt: string): string | undefined {
  if (approvalBoundaryReferenceOnly(prompt)) return undefined;
  const direct = classifyApprovalBoundaryCommand(prompt);
  if (direct) return direct.kind;
  for (const candidate of PROMPT_APPROVAL_PATTERNS) {
    if (!candidate.pattern.test(prompt)) continue;
    return classifyApprovalBoundaryCommand(candidate.command)?.kind ?? candidate.kind;
  }
  return undefined;
}

function decision(protocolKind: AutonomyProtocolKind, reason: string, hardBoundary?: string, options: { resumeExisting?: boolean; requiredTools?: string[] } = {}): AutonomyRouterDecision {
  return {
    protocolKind,
    requiredTools: options.requiredTools ?? requiredToolsForProtocol(protocolKind),
    hardBoundary,
    reason,
    resumeExisting: options.resumeExisting,
  };
}

function isContinuationPrompt(prompt: string): boolean {
  return matchesAny(prompt, CONTINUATION_PATTERNS);
}

function isResumableProtocol(protocol: AutonomyRouterCurrentProtocol | undefined): boolean {
  if (!protocol) return false;
  if (protocol.kind === "none" || protocol.kind === "approval-boundary") return false;
  return protocol.taskStatus === undefined || protocol.taskStatus === "active" || protocol.taskStatus === "blocked";
}

function isMicroCodingPrompt(prompt: string): boolean {
  const text = prompt.trim();
  if (!text || text.includes("\n")) return false;
  const hasMicroSignal = text.length <= 80 || matchesAny(text, MICRO_CODING_PATTERNS);
  if (!hasMicroSignal) return false;
  if (matchesAny(text, NON_TRIVIAL_DEEP_PATTERNS)) return false;
  return matchesAny(text, MICRO_CODING_PATTERNS) || matchesAny(text, ACTION_PATTERNS);
}

function isUlwPrompt(prompt: string): boolean {
  if (matchesAny(prompt, ULW_EXPLICIT_PATTERNS)) return true;
  const signalCount = ULW_AUTONOMOUS_PATTERNS.filter((pattern) => pattern.test(prompt)).length;
  const delegatedEndToEnd = /알아서|자율|autonomous/i.test(prompt) && /끝까지|완료까지|검증까지|until\s+completion/i.test(prompt);
  return (signalCount >= 4 || delegatedEndToEnd) && matchesAny(prompt, ACTION_PATTERNS);
}

export function routeAutonomyProtocol(input: AutonomyRouterInput): AutonomyRouterDecision {
  const prompt = input.prompt.trim();
  if (!prompt) return decision("none", "empty prompt");

  const hardBoundary = approvalBoundaryForPrompt(prompt);
  if (hardBoundary) return decision("approval-boundary", `hard approval boundary detected: ${hardBoundary}`, hardBoundary);

  if (isUlwPrompt(prompt)) return decision("ulw", "ULW autonomous harness intent detected");

  if (hasReportIntent(prompt)) {
    const noExternal = explicitNoExternalResearchRequested(prompt);
    return decision(
      "report-research",
      noExternal
        ? "report mode requires report_research_gate evidence boundary because external research was explicitly forbidden"
        : "report mode requires web-analysis-backed external research",
    );
  }
  if (matchesAny(prompt, PARALLEL_PATTERNS)) return decision("parallel-work", "parallel or multi-session intent detected");
  if (input.hasActiveManifest && matchesAny(prompt, INTEGRATION_PATTERNS)) return decision("integration", "active manifest completion/integration intent detected");
  if (input.activeLaneId && (matchesAny(prompt, ACTION_PATTERNS) || isContinuationPrompt(prompt))) return decision("worktree-lane", `active lane ${input.activeLaneId} with implementation intent`);
  if (matchesAny(prompt, BRANCH_PATTERNS)) return decision("single-branch", "branch intent detected");
  if (isContinuationPrompt(prompt) && isResumableProtocol(input.currentProtocol) && (input.hasActiveManifest || input.currentProtocol?.taskStatus === "blocked")) {
    return decision(
      input.currentProtocol!.kind,
      `continuation prompt resumes existing ${input.currentProtocol!.kind} protocol`,
      undefined,
      { resumeExisting: true, requiredTools: input.currentProtocol!.requiredTools },
    );
  }
  if (isMicroCodingPrompt(prompt)) return decision("micro-coding", "micro coding intent detected");
  if (matchesAny(prompt, ACTION_PATTERNS)) return decision("coding", "general implementation or verification intent detected");

  return decision("none", "no autonomous execution protocol required");
}
