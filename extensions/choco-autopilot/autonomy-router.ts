import { classifyApprovalBoundaryCommand } from "./approval-boundary";
import type { AutonomyProtocolKind } from "./autonomy-protocol";

export interface AutonomyRouterInput {
  prompt: string;
  cwd: string;
  sessionId: string;
  hasActiveManifest: boolean;
  activeLaneId?: string;
  currentBranch?: string | null;
}

export interface AutonomyRouterDecision {
  protocolKind: AutonomyProtocolKind;
  requiredTools: string[];
  hardBoundary?: string;
  reason: string;
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
  /실행/,
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
  { kind: "secret-or-account", pattern: /secret|credential|token|account|login|logout|비밀|토큰|계정|로그인/i, command: "gh auth login" },
  { kind: "large-delete", pattern: /rm\s+-rf|대량\s*삭제|전부\s*삭제/i, command: "rm -rf /" },
  { kind: "external-data-transfer", pattern: /private\s*data|upload|scp|rsync|외부\s*전송|개인정보/i, command: "scp file host:/tmp" },
  { kind: "irreversible", pattern: /reset\s+--hard|git\s+clean|force\s+push|강제\s*푸시|되돌릴\s*수\s*없/i, command: "git reset --hard" },
];

function matchesAny(prompt: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(prompt));
}

export function requiredToolsForProtocol(kind: AutonomyProtocolKind): string[] {
  if (kind === "single-branch") return ["branch_switch_guard", "structural_gate"];
  if (kind === "coding") return ["spec_gate", "structural_gate"];
  if (kind === "parallel-work") return ["spec_gate", "parallel_work_plan", "agent_orchestrator", "worktree_manage", "integration_verifier", "structural_gate"];
  if (kind === "worktree-lane") return ["agent_orchestrator", "worktree_manage", "write_scope_guard", "structural_gate"];
  if (kind === "integration") return ["integration_verifier", "structural_gate"];
  return [];
}

function approvalBoundaryForPrompt(prompt: string): string | undefined {
  const direct = classifyApprovalBoundaryCommand(prompt);
  if (direct) return direct.kind;
  for (const candidate of PROMPT_APPROVAL_PATTERNS) {
    if (!candidate.pattern.test(prompt)) continue;
    return classifyApprovalBoundaryCommand(candidate.command)?.kind ?? candidate.kind;
  }
  return undefined;
}

function decision(protocolKind: AutonomyProtocolKind, reason: string, hardBoundary?: string): AutonomyRouterDecision {
  return { protocolKind, requiredTools: requiredToolsForProtocol(protocolKind), hardBoundary, reason };
}

export function routeAutonomyProtocol(input: AutonomyRouterInput): AutonomyRouterDecision {
  const prompt = input.prompt.trim();
  if (!prompt) return decision("none", "empty prompt");

  const hardBoundary = approvalBoundaryForPrompt(prompt);
  if (hardBoundary) return decision("approval-boundary", `hard approval boundary detected: ${hardBoundary}`, hardBoundary);

  if (matchesAny(prompt, PARALLEL_PATTERNS)) return decision("parallel-work", "parallel or multi-session intent detected");
  if (input.hasActiveManifest && matchesAny(prompt, INTEGRATION_PATTERNS)) return decision("integration", "active manifest completion/integration intent detected");
  if (input.activeLaneId && matchesAny(prompt, ACTION_PATTERNS)) return decision("worktree-lane", `active lane ${input.activeLaneId} with implementation intent`);
  if (matchesAny(prompt, BRANCH_PATTERNS)) return decision("single-branch", "branch intent detected");
  if (matchesAny(prompt, ACTION_PATTERNS)) return decision("coding", "general implementation or verification intent detected");

  return decision("none", "no autonomous execution protocol required");
}
