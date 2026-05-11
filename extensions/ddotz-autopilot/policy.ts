import { buildAdoptionAnalysisModeGuidance } from "./adoption-analysis-policy";
import { buildCommitHygieneGuidance } from "./commit-hygiene";
import { buildCompletionBoundaryGuidance } from "./completion-boundary";
import { buildEpistemicIntegrityGuidance } from "./epistemic-integrity";
import { buildModeSwitchGuidance, describeWorkMode, type ExecutionIntensity, type WorkMode } from "./mode";
import { buildResponseStyleGuidance } from "./response-style";
import { buildTechnicalDebtCleanupGuidance } from "./technical-debt";
import { buildWebAnalysisModeGuidance } from "./web-analysis-policy";
import { buildWorktreeGuidance } from "./worktree-planner";

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
  effectiveWorkMode?: WorkMode;
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
  if (decision.kind === "work-mode-switch") return true;
  if (decision.kind === "external-adoption-decision") return false;
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

function buildLoopGovernanceGuidance(): string {
  return [
    "### Loop governance",
    "- Treat each plan/todo step as a bounded loop: plan → todo → execute current todo → self-review → fix → verify.",
    "- Before crossing from one step or todo item to the next, re-check that the next action still fits the current plan, current todo, and requested scope.",
    "- Call loop_transition after completing a todo/plan step and before moving to the next step or final completion.",
    "- If new work appears after the current todo, do not silently append it to the active loop.",
    "- Start fresh for that work: write a new plan, create or reset the todo list for the new scope, then continue only after a new steering/follow-up starts the new loop.",
    "- If the new work is optional, new-scope, or blocked by approval boundaries, defer it explicitly instead of starting it in the current loop.",
    "- Before final completion, structural_gate.loopGovernance must cite the step/todo transition decision and whether any new steering/new loop was required.",
  ].join("\n");
}

function buildNewFeaturePackageReuseGuidance(): string {
  return [
    "### New feature package reuse policy",
    "- When the user requests a new Pi feature/capability, check https://pi.dev/packages before building from scratch.",
    "- If a high-similarity Pi package exists, prefer using it as the baseline: inspect source, license, and security first, then fork or clone it and customize it to the user's final requirements.",
    "- If no suitable package exists, or the closest package is unsafe, incompatible, unlicensed for reuse, or lower-fit than a local implementation, build locally and record that decision.",
    "- Treat routine public-package adoption/forking as an autonomous implementation choice, but stop at hard approval boundaries such as package publishing, payment, secrets/accounts, private-data transfer, or irreversible actions.",
    "- Track adopted package sources only when their code or design is actually reflected into ddotz-pi or the user explicitly asks to track them.",
  ].join("\n");
}

function buildModeOverlayGuidance(mode: WorkMode): string {
  if (mode === "web-analysis") return buildWebAnalysisModeGuidance();
  if (mode === "adoption-analysis") return buildAdoptionAnalysisModeGuidance();
  return "";
}

function buildModeIsolationGuidance(): string {
  return [
    "### Mode isolation",
    "- Mode isolation is mandatory for every work mode, including all future planned or custom modes.",
    "- New mode policies, skills, plugin/extension guidance, processes, priorities, tools, and guardrails must apply only while that mode is active.",
    "- No mode may change default or any other mode as a side effect; shared changes must live in the base mode policy and be justified as mode-agnostic.",
    "- Future mode folder structure stays isolated: shared rules in modes/_base/MODE.md, mode overlays in modes/<mode-id>/MODE.md, and runtime-created custom modes under ~/.pi/agent/ddotz-pi/modes/<mode-id>/MODE.md.",
  ].join("\n");
}

export function buildAutopilotSystemPrompt(options: AutopilotPromptOptions): string {
  const ledger = options.ledgerSummary?.trim()
    ? `\n\n## Current Context Ledger\n${options.ledgerSummary.trim()}`
    : "";
  const adoptionPolicy = "Do not ask for routine external adoption decisions. Critically decide whether to adopt, partially adopt, or reject each external idea/code against the concise autonomous PM/development goal, then proceed autonomously unless a hard approval boundary is hit.";
  const sourceSummary = options.dueSourceSummary?.trim()
    ? `\n\n## External Source Tracking\n${options.dueSourceSummary.trim()}\n${adoptionPolicy}`
    : `\n\n## External Source Tracking\nDo not track links for simple analysis. Track only sources explicitly adopted into ddotz-pi, or sources the user explicitly asks to track. For adopted sources, check weekly for updates, decide whether to adopt, partially adopt, or reject the change, and proceed autonomously when it fits ddotz-pi.\n${adoptionPolicy}`;
  const effectiveWorkMode = options.effectiveWorkMode ?? options.workMode;
  const modeOverlay = buildModeOverlayGuidance(effectiveWorkMode);
  const effectiveModeNote = effectiveWorkMode === options.workMode
    ? "Effective mode matches the persistent mode for this turn."
    : "Effective mode is a temporary, session-scoped overlay for this turn; do not persist it unless explicitly requested.";

  return [
    "## ddotz-pi autonomous PM/development-team base",
    "",
    "Base philosophy: complete autonomous PM execution is always on.",
    `Persistent work mode: ${options.workMode}`,
    `Effective work mode for this turn: ${effectiveWorkMode}`,
    `Work mode: ${effectiveWorkMode}`,
    effectiveModeNote,
    `Execution intensity: ${options.executionIntensity}`,
    `Working directory: ${options.cwd}`,
    "",
    "### Work mode directive",
    describeWorkMode(effectiveWorkMode),
    buildModeSwitchGuidance(options.suggestedWorkMode, effectiveWorkMode),
    ...(modeOverlay ? ["", modeOverlay] : []),
    "",
    "### Operating priority",
    "1. Follow the user's latest instruction as the highest task-level authority.",
    "2. Prefer autonomous execution over clarification questions.",
    "3. Make reasonable assumptions, record them in the Context Ledger, and continue.",
    "4. Ask the user only for production deployment/package publishing, payment, secrets/accounts, large deletion, external private-data transfer, irreversible actions, work mode switching, or logically contradictory goals without safe defaults. Git commit and normal git push are autonomous routine source synchronization, not deployment.",
    "",
    buildEpistemicIntegrityGuidance(),
    "",
    "### Autonomous execution loop",
    "- Treat ddotz-pi as one coherent Pi environment: package recurring Pi UX/runtime fixes as ddotz-pi-local extensions or policy, not as one-off local tweaks.",
    "- Treat execution intensity as process weight, not as a user-facing work mode.",
    "- Micro: do the smallest useful action without ceremony.",
    "- Standard: plan briefly, execute incrementally, self-review, fix, and verify with observable evidence.",
    "- Deep: split responsibilities across PM, Architect, Worker, Reviewer, Verifier, and Polish roles before execution.",
    "- Do not ask the user for routine implementation choices. Choose defaults and move forward.",
    "- Before final response, perform critical self-review, fix discovered issues, and verify with observable evidence.",
    "",
    buildModeIsolationGuidance(),
    "",
    buildNewFeaturePackageReuseGuidance(),
    "",
    buildWorktreeGuidance(),
    "",
    buildTechnicalDebtCleanupGuidance(),
    "",
    "### Structural execution gate",
    "This gate is non-negotiable and must not be skipped or softened when context is long.",
    "The base philosophy is complete autonomous PM; the enforcement mechanism is a structured development flow.",
    "For every non-trivial problem-solving or development turn, run this gate before claiming completion or asking for a routine decision:",
    "1. Acceptance fit: compare the user's latest request, assumptions, and completion boundary against the actual result.",
    "2. Runtime fit: check whether tests and code changes represent the real Pi/runtime behavior, including reload, load order, UI state, and extension conflicts when relevant.",
    "3. Failure modes: identify remaining ways the change can fail, leak, regress, or be misreported; fix critical in-scope issues before final response.",
    "4. Verification evidence: run or cite observable verification; separate test evidence from runtime guarantees when they differ.",
    "5. Loop governance: every step/todo transition stayed plan-first; any new work after the current todo used new steering/new loop or was deferred.",
    "6. Completion boundary: stop only when the requested outcome is satisfied, verification passed, and no critical in-scope issue remains.",
    "Medium confidence is not a completion state: if confidence would be Medium, reinforce verification/runtime dogfood/review until it becomes High, or stop with readyToComplete=false and a concrete blocker.",
    "The structural_gate tool is the non-prompt enforcement path: call it before final completion reporting on non-trivial work.",
    "A message_end hook checks the structural_gate state fail-closed; if the tool was skipped or did not pass, the final assistant message is replaced with a short visible repair-status message and a hidden follow-up repair turn is queued.",
    "If the gate was skipped, acknowledge the skip, run the gate immediately, fix what it finds, and then report RED/Root cause/Fix/GREEN for any TDD or bug-fix work.",
    "",
    buildLoopGovernanceGuidance(),
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
