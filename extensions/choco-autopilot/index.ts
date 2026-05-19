import { StringEnum, type AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";
import { ADOPTION_DEPTHS, type AdoptionDepth } from "./adoption-depth";
import {
  autonomyProtocolKey,
  completeAutonomyProtocol,
  createAutonomyProtocol,
  markProtocolSuperseded,
  markProtocolToolBlocked,
  markProtocolToolSatisfied,
  missingRequiredTools,
  normalizeAutonomyProtocol,
  protocolIsActive,
  protocolReadyForCompletion,
  protocolToolSatisfactionFromResult,
  pruneAutonomyProtocols,
  resumeAutonomyProtocol,
  type AutonomyProtocol,
} from "./autonomy-protocol";
import { routeAutonomyProtocol } from "./autonomy-router";
import {
  createEmptyLedger,
  recordChangedFile,
  recordVerification,
  type ContextLedger,
  type VerificationStatus,
  summarizeLedger,
} from "./context-ledger";
import {
  createActiveDogfoodCaseState,
  finishDogfoodCase,
  recordDogfoodRepairQueued,
  recordDogfoodToolCall,
  recordDogfoodToolResult,
  startDogfoodCase,
} from "./dogfood-collector";
import { isoWeekId } from "./dogfood-privacy";
import { cleanupDogfoodCaseRetention, createDogfoodStore, listDogfoodCases, readDogfoodQueue, readDogfoodWeeklyReport, writeDogfoodWeeklyReport } from "./dogfood-store";
import { buildDogfoodWeeklyReport, formatDogfoodWeeklyReport } from "./dogfood-weekly";
import { createStoredMemory, classifyMemoryCandidate, type StoredMemory } from "./memory";
import {
  createRuntimeState,
  DEFAULT_EXECUTION_INTENSITY,
  DEFAULT_WORK_MODE,
  inferPlannedWorkMode,
  inferPlannedWorkModes,
  isWorkModeImplemented,
  parseExecutionIntensity,
  parseWorkMode,
  type ExecutionIntensity,
  type RuntimeState,
  type WorkMode,
} from "./mode";
import { registerAgentOrchestratorTool, type ActiveLaneContext } from "./agent-orchestrator-tool";
import { registerBranchSwitchGuardTool } from "./branch-switch-guard";
import { registerParallelWorkPlanTool } from "./parallel-work-plan-tool";
import {
  activeLaneContextFromEnv,
  detectBashScopeViolations,
  guardToolCallWriteScope,
  recordWriteScopeViolation,
  snapshotGitChangedFiles,
} from "./write-scope-guard";
import { registerWorktreeManageTool } from "./worktree-manage-tool";
import { buildAutopilotSystemPrompt, classifyExecutionIntensity } from "./policy";
import {
  createExternalSource,
  createSourceRegistry,
  gitRemoteUrlForSource,
  markSourceAdopted,
  markSourceRejected,
  markSourceWatching,
  sourcesDueForWeeklyCheck,
  summarizeChangedSources,
  summarizeDueSources,
  upsertExternalSource,
  updateSourceCheckResult,
  type ExternalSource,
  type SourceRegistry,
} from "./source-registry";
import { guardAdoptionAnalysisQualityMessage, type AdoptionAnalysisRepairState } from "./adoption-analysis-quality";
import { classifyApprovalBoundaryToolCall, formatApprovalBoundaryBlock } from "./approval-boundary";
import {
  createAutoUpdateState,
  chocoPiPackageRoot,
  formatAutoUpdateResult,
  formatAutoUpdateStatus,
  formatManualUpdateResult,
  formatPiCliUpdateResult,
  normalizeAutoUpdateState,
  runChocoPiUpdate,
  runPiCliUpdate,
  shouldRunAutoUpdate,
  summarizeAutoUpdateResult,
  type AutoUpdateState,
} from "./auto-update";
import { guardCodingQualityMessage, type CodingRepairState } from "./coding-quality";
import { guardDesignQualityMessage, type DesignRepairState } from "./design-quality";
import { installDynamicSdd } from "./dynamic-sdd";
import { runGuardPipeline } from "./guard-orchestrator";
import { discoverImNotAiSkillPath } from "./im-not-ai-dependency";
import { discoverKamiSkillPath } from "./kami-dependency";
import { currentBranch as gitCurrentBranch, repoRoot as gitRepoRoot } from "./git-runtime";
import { registerIntegrationVerifierTool } from "./integration-verifier-tool";
import { registerModeScaffoldTool } from "./mode-scaffold-tool";
import { parseDogfoodMemoryMode, resolveDogfoodScope } from "./improvement-scope";
import { guardReportQualityMessage, type ReportRepairState } from "./report-quality";
import { registerRuntimeReload } from "./runtime-reload";
import { registerSessionDashboardCommand } from "./session-dashboard";
import { resolveEffectiveWorkMode, sessionIdFromContext, sessionScopedKey } from "./session-scope";
import { installStructuralGate, type StructuralGateReview } from "./structural-gate";
import { discoverSuperpowersSkillPath } from "./superpowers-dependency";
import { withFileLock } from "./state-lock";
import { CHOCO_PI_VERSION } from "./version";
import { registerEffortCommand } from "./effort";
import { verificationCommandFromInput } from "./verification-command";
import { guardWebResearchQualityMessage, type WebResearchRepairState } from "./web-research-quality";
import {
  addCustomWorkMode,
  createWorkModeRegistry,
  ensureBuiltInModes,
  findWorkMode,
  findWorkModeBySelectionOption,
  listWorkModeSelectionOptions,
  listWorkModes,
  removeCustomWorkMode,
  type WorkModeRegistry,
} from "./work-mode-registry";

export interface SessionRuntimeState {
  effectiveWorkMode: WorkMode;
  effectiveModeSequence?: WorkMode[];
  suggestedWorkMode?: WorkMode;
  automaticMode: boolean;
  executionIntensity: ExecutionIntensity;
  updatedAt: string;
}

export interface ActiveLaneRuntimeState extends ActiveLaneContext {
  version: 1;
  sessionId: string;
  cwd: string;
  activatedAt: string;
}

export interface ChocoState {
  version: 5;
  runtime: RuntimeState;
  sessions: Record<string, SessionRuntimeState>;
  activeLanes: Record<string, ActiveLaneRuntimeState>;
  autonomyProtocols: Record<string, AutonomyProtocol>;
  memories: StoredMemory[];
  ledgers: Record<string, ContextLedger>;
  sourceRegistry: SourceRegistry;
  workModeRegistry: WorkModeRegistry;
  autoUpdate: AutoUpdateState;
}

const STATE_VERSION = 5 as const;
const WEB_REPAIR_PROMPT_MARKER = "내부 web-analysis 품질 보강이 필요합니다.";
const ADOPTION_REPAIR_PROMPT_MARKER = "내부 adoption-analysis 품질 보강이 필요합니다.";
const CODING_REPAIR_PROMPT_MARKER = "내부 coding 품질 보강이 필요합니다.";
const REPORT_REPAIR_PROMPT_MARKER = "내부 report 품질 보강이 필요합니다.";
const DESIGN_REPAIR_PROMPT_MARKER = "내부 design 품질 보강이 필요합니다.";

function repairStateFor<T extends { repairQueued: boolean }>(states: Map<string, T>, sessionId: string): T {
  const existing = states.get(sessionId);
  if (existing) return existing;
  const created = { repairQueued: false } as T;
  states.set(sessionId, created);
  return created;
}

function agentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

function statePath(): string {
  return join(agentDir(), "choco-pi", "state.json");
}

function dogfoodRootPath(): string {
  return join(agentDir(), "choco-pi", "dogfood");
}

function dogfoodSaltPath(): string {
  return join(dogfoodRootPath(), "salt");
}

async function dogfoodSalt(): Promise<string> {
  try {
    return (await readFile(dogfoodSaltPath(), "utf8")).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const salt = randomUUID();
    await mkdir(dogfoodRootPath(), { recursive: true });
    await writeFile(dogfoodSaltPath(), `${salt}\n`, "utf8");
    return salt;
  }
}

function modeFilePath(folder: string): string {
  return join(agentDir(), "choco-pi", folder, "MODE.md");
}

async function writeCustomModeFile(id: string, folder: string, description: string): Promise<void> {
  const filePath = modeFilePath(folder);
  await mkdir(join(agentDir(), "choco-pi", folder), { recursive: true });
  await writeFile(
    filePath,
    [`# ${id} Mode`, "", "Status: planned, custom.", "", description.trim(), ""].join("\n"),
    "utf8",
  );
}

async function removeCustomModeFile(folder: string): Promise<void> {
  await rm(join(agentDir(), "choco-pi", folder), { recursive: true, force: true });
}

function emptyState(): ChocoState {
  return {
    version: STATE_VERSION,
    runtime: createRuntimeState(DEFAULT_WORK_MODE, DEFAULT_EXECUTION_INTENSITY),
    sessions: {},
    activeLanes: {},
    autonomyProtocols: {},
    memories: [],
    ledgers: {},
    sourceRegistry: createSourceRegistry(),
    workModeRegistry: createWorkModeRegistry(),
    autoUpdate: createAutoUpdateState(),
  };
}

function migrateLegacyMode(parsed: { mode?: { mode?: string }; runtime?: RuntimeState }): RuntimeState {
  if (parsed.runtime?.workMode && parsed.runtime?.executionIntensity) return parsed.runtime;
  const legacy = parsed.mode?.mode;
  if (legacy === "autopilot-heavy") return createRuntimeState("default", "deep");
  return createRuntimeState("default", "standard");
}

function ledgerKey(cwd: string, sessionId: string): string {
  return sessionScopedKey(cwd || process.cwd(), sessionId);
}

function activeLaneKey(cwd: string, sessionId: string): string {
  return sessionScopedKey(cwd || process.cwd(), sessionId);
}

function activeLaneFromState(state: ChocoState, cwd: string, sessionId: string): ActiveLaneRuntimeState | undefined {
  return state.activeLanes[activeLaneKey(cwd, sessionId)] ?? state.activeLanes[sessionId];
}

function protocolArchiveKey(cwd: string, sessionId: string, protocolId: string): string {
  return `${autonomyProtocolKey(cwd, sessionId)}:${protocolId}`;
}

function protocolShouldCompleteFromTool(protocol: AutonomyProtocol, toolName: string, result: Record<string, unknown> | undefined): boolean {
  if (toolName === "agent_orchestrator" && result?.action === "close" && result.ok === true) return true;
  return protocolReadyForCompletion(protocol);
}

async function hasActiveManifestForCwd(cwd: string): Promise<boolean> {
  const root = await gitRepoRoot(cwd).catch(() => cwd);
  let groupIds: string[] = [];
  try {
    groupIds = await readdir(join(root, ".pi", "agent-runs"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    return false;
  }
  for (const groupId of groupIds) {
    try {
      const raw = await readFile(join(root, ".pi", "agent-runs", groupId, "manifest.json"), "utf8");
      const manifest = JSON.parse(raw) as { status?: string };
      if (manifest.status !== "integrated" && manifest.status !== "closed") return true;
    } catch {
      return true;
    }
  }
  return false;
}

async function loadStateUnlocked(): Promise<ChocoState> {
  try {
    const raw = await readFile(statePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<ChocoState> & { mode?: { mode?: string } };
    return {
      version: STATE_VERSION,
      runtime: migrateLegacyMode(parsed),
      sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
      activeLanes: parsed.activeLanes && typeof parsed.activeLanes === "object" ? parsed.activeLanes as Record<string, ActiveLaneRuntimeState> : {},
      autonomyProtocols: parsed.autonomyProtocols && typeof parsed.autonomyProtocols === "object"
        ? Object.fromEntries(Object.entries(parsed.autonomyProtocols).map(([key, protocol]) => [key, normalizeAutonomyProtocol(protocol as AutonomyProtocol)]))
        : {},
      memories: Array.isArray(parsed.memories) ? parsed.memories : [],
      ledgers: parsed.ledgers && typeof parsed.ledgers === "object" ? parsed.ledgers : {},
      sourceRegistry: parsed.sourceRegistry?.sources ? parsed.sourceRegistry : createSourceRegistry(),
      workModeRegistry: ensureBuiltInModes(parsed.workModeRegistry),
      autoUpdate: normalizeAutoUpdateState(parsed.autoUpdate),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }
}

async function saveStateUnlocked(state: ChocoState): Promise<void> {
  const path = statePath();
  await mkdir(join(agentDir(), "choco-pi"), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(tmpPath, path);
}

export async function loadState(): Promise<ChocoState> {
  return await loadStateUnlocked();
}

export async function updateState<T>(operation: (state: ChocoState) => T | Promise<T>): Promise<T> {
  const path = statePath();
  return await withFileLock(path, async () => {
    const state = await loadStateUnlocked();
    const result = await operation(state);
    await saveStateUnlocked(state);
    return result;
  });
}

function getLedger(state: ChocoState, cwd: string, sessionId: string, prompt?: string): ContextLedger {
  const key = ledgerKey(cwd, sessionId);
  const existing = state.ledgers[key];
  if (existing) return existing;
  const objective = prompt?.trim() ? prompt.trim().slice(0, 240) : `Autonomous work in ${cwd}`;
  const created = createEmptyLedger(objective);
  state.ledgers[key] = created;
  return created;
}

function nowIso(): string {
  return new Date().toISOString();
}

function formatMemories(memories: StoredMemory[]): string {
  if (memories.length === 0) return "No choco-pi memories stored.";
  return memories
    .slice(-20)
    .map((memory) => `- [${memory.kind}] ${memory.text}`)
    .join("\n");
}

function formatSources(registry: SourceRegistry): string {
  if (registry.sources.length === 0) return "No choco-pi external sources tracked.";
  return registry.sources
    .map((source) => {
      const changed = source.changedSinceLastCheck ? " changed" : "";
      const depth = source.adoptionDepth ? ` depth:${source.adoptionDepth}` : "";
      const ref = source.lastKnownRef ? ` @ ${source.lastKnownRef.slice(0, 12)}` : "";
      return `- ${source.id} [${source.status}${changed}${depth}] ${source.label}${ref} — ${source.url}`;
    })
    .join("\n");
}

function maxIntensity(a: ExecutionIntensity, b: ExecutionIntensity): ExecutionIntensity {
  const rank: Record<ExecutionIntensity, number> = { micro: 0, standard: 1, deep: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function splitCommandArgs(args: string): string[] {
  return args.trim().split(/\s+/).filter(Boolean);
}

function configuredImprovementProfile() {
  const value = process.env.CHOCO_PI_IMPROVEMENT_PROFILE;
  return value === "personal" || value === "scratch" ? value : undefined;
}

function configuredImprovementMode() {
  return process.env.CHOCO_PI_IMPROVEMENT_MODE
    ? parseDogfoodMemoryMode(process.env.CHOCO_PI_IMPROVEMENT_MODE)
    : undefined;
}

type SourceRegistryAction = "list" | "add" | "watch" | "adopt" | "reject" | "due" | "changed" | "check";

interface SourceRegistryToolParams {
  action: SourceRegistryAction;
  url?: string;
  id?: string;
  target?: string;
  rationale?: string;
  review?: string;
  adoptionDepth?: AdoptionDepth;
  adoptedItems?: string[];
  rejectedItems?: string[];
  scopeRationale?: string;
  clearChangedFlag?: boolean;
}

const SourceRegistryParams = Type.Object({
  action: StringEnum(["list", "add", "watch", "adopt", "reject", "due", "changed", "check"] as const),
  url: Type.Optional(Type.String({ description: "Source URL for add" })),
  id: Type.Optional(Type.String({ description: "Source id for watch, adopt, reject, and check" })),
  target: Type.Optional(Type.String({ description: "Check target: due, all, or source id" })),
  rationale: Type.Optional(Type.String({ description: "Why this source is relevant" })),
  review: Type.Optional(Type.String({ description: "Adoption/watch/rejection review" })),
  adoptionDepth: Type.Optional(StringEnum(ADOPTION_DEPTHS)),
  adoptedItems: Type.Optional(Type.Array(Type.String())),
  rejectedItems: Type.Optional(Type.Array(Type.String())),
  scopeRationale: Type.Optional(Type.String()),
  clearChangedFlag: Type.Optional(Type.Boolean()),
});

function requireSourceId(id: string | undefined): string {
  if (!id?.trim()) throw new Error("Source id is required");
  return id.trim();
}

function hasSourceId(registry: SourceRegistry, id: string): boolean {
  return registry.sources.some((source) => source.id === id);
}

async function setWorkMode(workMode: WorkMode, ctx: ExtensionCommandContext): Promise<void> {
  if (!isWorkModeImplemented(workMode)) {
    ctx.ui.notify(`Work mode '${workMode}' is planned but not implemented. Staying in default mode.`, "warning");
    return;
  }
  await updateState((state) => {
    state.runtime = createRuntimeState(workMode, state.runtime.executionIntensity);
  });
  ctx.ui.notify(`mode: ${workMode}`, "info");
}

async function setExecutionIntensity(executionIntensity: ExecutionIntensity, ctx: ExtensionCommandContext): Promise<void> {
  await updateState((state) => {
    state.runtime = createRuntimeState(state.runtime.workMode, executionIntensity);
  });
  ctx.ui.notify(`intensity: ${executionIntensity}`, "info");
}

async function selectWorkMode(state: ChocoState, ctx: ExtensionCommandContext): Promise<void> {
  const options = listWorkModeSelectionOptions(state.workModeRegistry, state.runtime.workMode);
  const selected = await ctx.ui.select(`Current mode: ${state.runtime.workMode}`, options);
  if (!selected) {
    ctx.ui.notify(`Mode unchanged: ${state.runtime.workMode}`, "info");
    return;
  }

  const mode = findWorkModeBySelectionOption(state.workModeRegistry, selected, state.runtime.workMode);
  if (!mode) {
    ctx.ui.notify("Selected work mode could not be resolved. Mode unchanged.", "error");
    return;
  }
  if (mode.status !== "implemented") {
    ctx.ui.notify(`Work mode '${mode.id}' is planned but not implemented. Staying in ${state.runtime.workMode} mode.`, "warning");
    return;
  }

  const workMode = parseWorkMode(mode.id);
  if (!workMode || !isWorkModeImplemented(workMode)) {
    ctx.ui.notify(`Work mode '${mode.id}' is registered but cannot be activated by this runtime. Mode unchanged.`, "warning");
    return;
  }

  await setWorkMode(workMode, ctx);
}

interface SourceCheckOutcome {
  id: string;
  label: string;
  checkedAt: Date;
  ok: boolean;
  message: string;
  ref?: string;
}

async function checkSource(pi: ExtensionAPI, source: ExternalSource): Promise<{ id: string; ok: boolean; message: string; ref?: string }> {
  const remote = gitRemoteUrlForSource(source);
  if (!remote) {
    return { id: source.id, ok: false, message: "non-GitHub URL requires model-led analysis" };
  }

  const result = await pi.exec("git", ["ls-remote", remote, "HEAD"], { timeout: 15_000 });
  if (result.code !== 0) {
    return { id: source.id, ok: false, message: result.stderr?.trim() || `git ls-remote exited ${result.code}` };
  }
  const ref = result.stdout.trim().split(/\s+/)[0];
  if (!ref) return { id: source.id, ok: false, message: "empty git ls-remote response" };
  return { id: source.id, ok: true, message: `HEAD ${ref.slice(0, 12)}`, ref };
}

async function checkSources(pi: ExtensionAPI, sources: ExternalSource[]): Promise<SourceCheckOutcome[]> {
  const outcomes: SourceCheckOutcome[] = [];
  for (const source of sources) {
    const checkedAt = new Date();
    try {
      const result = await checkSource(pi, source);
      outcomes.push({
        id: source.id,
        label: source.label,
        checkedAt,
        ok: result.ok,
        message: result.message,
        ref: result.ref,
      });
    } catch (error) {
      outcomes.push({
        id: source.id,
        label: source.label,
        checkedAt,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return outcomes;
}

function applySourceCheckOutcomes(registry: SourceRegistry, outcomes: SourceCheckOutcome[]): { registry: SourceRegistry; messages: string[] } {
  let updated = registry;
  const messages: string[] = [];
  for (const outcome of outcomes) {
    updated = updateSourceCheckResult(updated, outcome.id, {
      checkedAt: outcome.checkedAt,
      upstreamRef: outcome.ref,
      ok: outcome.ok,
      error: outcome.ok ? undefined : outcome.message,
    });
    messages.push(`${outcome.label}: ${outcome.message}`);
  }
  return { registry: updated, messages };
}

function selectSourcesForCheck(registry: SourceRegistry, target: string): ExternalSource[] {
  return target === "all"
    ? registry.sources.filter((source) => source.status !== "rejected")
    : target === "due"
      ? sourcesDueForWeeklyCheck(registry)
      : registry.sources.filter((source) => source.id === target);
}

function registerSourceRegistryTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "source_registry",
    label: "Source registry",
    description: "Track adopted, watched, and rejected external sources for choco-pi adoption analysis.",
    promptSnippet: "source_registry: list/add/watch/adopt/reject/check external sources that are reflected into choco-pi or explicitly requested for tracking.",
    promptGuidelines: [
      "Track sources only when their code/design is reflected into choco-pi or the user explicitly asks to track them.",
      "Use watch for sources that are relevant but not adopted yet, especially when license, security, or freshness is unresolved.",
      "When adopting, record the smallest sufficient adoptionDepth and the concrete adopted/rejected scope.",
    ],
    parameters: SourceRegistryParams,
    renderShell: "self",
    async execute(_toolCallId, params) {
      const input = params as SourceRegistryToolParams;
      const readonlyState = await loadState();
      const readonlyDetails = () => ({ action: input.action, state: readonlyState.sourceRegistry });

      if (input.action === "list") {
        return { content: [{ type: "text", text: formatSources(readonlyState.sourceRegistry) }], details: readonlyDetails() };
      }
      if (input.action === "due") {
        return { content: [{ type: "text", text: summarizeDueSources(readonlyState.sourceRegistry) }], details: readonlyDetails() };
      }
      if (input.action === "changed") {
        return { content: [{ type: "text", text: summarizeChangedSources(readonlyState.sourceRegistry) }], details: readonlyDetails() };
      }
      if (input.action === "add") {
        if (!input.url?.trim()) throw new Error("Source URL is required");
        const source = createExternalSource(input.url, { rationale: input.rationale });
        const registry = await updateState((state) => {
          state.sourceRegistry = upsertExternalSource(state.sourceRegistry, source);
          return state.sourceRegistry;
        });
        return { content: [{ type: "text", text: `Tracked external source: ${source.id}` }], details: { action: input.action, state: registry } };
      }
      if (input.action === "watch") {
        const id = requireSourceId(input.id);
        const registry = await updateState((state) => {
          state.sourceRegistry = markSourceWatching(state.sourceRegistry, id, input.review || "Watching for future adoption analysis.", {
            adoptionDepth: input.adoptionDepth,
            scopeRationale: input.scopeRationale,
            clearChangedFlag: input.clearChangedFlag,
          });
          return state.sourceRegistry;
        });
        return { content: [{ type: "text", text: `Marked watching: ${id}` }], details: { action: input.action, state: registry } };
      }
      if (input.action === "adopt") {
        const id = requireSourceId(input.id);
        const registry = await updateState((state) => {
          state.sourceRegistry = markSourceAdopted(state.sourceRegistry, id, input.review || "Adopted for choco-pi.", {
            adoptionDepth: input.adoptionDepth,
            adoptedItems: input.adoptedItems,
            rejectedItems: input.rejectedItems,
            scopeRationale: input.scopeRationale,
            clearChangedFlag: input.clearChangedFlag,
          });
          return state.sourceRegistry;
        });
        return { content: [{ type: "text", text: `Marked adopted: ${id}` }], details: { action: input.action, state: registry } };
      }
      if (input.action === "reject") {
        const id = requireSourceId(input.id);
        const registry = await updateState((state) => {
          state.sourceRegistry = markSourceRejected(state.sourceRegistry, id, input.review || "Rejected for choco-pi.");
          return state.sourceRegistry;
        });
        return { content: [{ type: "text", text: `Marked rejected: ${id}` }], details: { action: input.action, state: registry } };
      }

      const target = input.target || input.id || "due";
      const selected = selectSourcesForCheck(readonlyState.sourceRegistry, target);
      if (selected.length === 0) return { content: [{ type: "text", text: `No sources selected for check: ${target}` }], details: readonlyDetails() };
      const outcomes = await checkSources(pi, selected);
      const { messages, registry } = await updateState((state) => {
        const applied = applySourceCheckOutcomes(state.sourceRegistry, outcomes);
        state.sourceRegistry = applied.registry;
        return applied;
      });
      return { content: [{ type: "text", text: messages.join("\n") }], details: { action: input.action, state: registry } };
    },
  });
}

function objectInput(input: unknown): Record<string, unknown> | undefined {
  return input && typeof input === "object" ? input as Record<string, unknown> : undefined;
}

function toolInputPath(input: unknown): string | undefined {
  const path = objectInput(input)?.path;
  return typeof path === "string" && path.trim() ? path.trim().replace(/^@/, "") : undefined;
}

function textContentPreview(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const entry of content) {
    const item = objectInput(entry);
    if (item?.type === "text" && typeof item.text === "string") parts.push(item.text);
  }
  const text = parts.join("\n").trim();
  if (!text) return undefined;
  return text.split("\n").find((line) => line.trim())?.trim().slice(0, 160);
}

async function updateLedgerForToolCall(cwd: string, sessionId: string, toolName: string, input: unknown): Promise<void> {
  if (toolName !== "write" && toolName !== "edit") return;
  const path = toolInputPath(input);
  if (!path) return;
  await updateState((state) => {
    const key = ledgerKey(cwd, sessionId);
    const ledger = getLedger(state, cwd, sessionId);
    state.ledgers[key] = recordChangedFile(ledger, path);
  });
}

async function blockAutonomyProtocolTool(cwd: string, sessionId: string, toolName: string, reason: string): Promise<void> {
  await updateState((state) => {
    const key = autonomyProtocolKey(cwd, sessionId);
    const protocol = state.autonomyProtocols[key];
    if (!protocol || !protocolIsActive(protocol) || !protocol.requiredTools.includes(toolName)) return;
    state.autonomyProtocols[key] = markProtocolToolBlocked(protocol, toolName, reason);
    state.autonomyProtocols = pruneAutonomyProtocols(state.autonomyProtocols);
  });
}

async function updateAutonomyProtocolForToolResult(
  cwd: string,
  sessionId: string,
  toolName: string,
  event: { toolCallId?: unknown; details?: unknown; isError?: unknown; content?: unknown },
): Promise<void> {
  const satisfaction = protocolToolSatisfactionFromResult(toolName, event);
  if (!satisfaction || satisfaction.status === "ignored") return;
  const details = objectInput(event.details);
  const result = objectInput(details?.result) ?? details;
  await updateState((state) => {
    const key = autonomyProtocolKey(cwd, sessionId);
    const protocol = state.autonomyProtocols[key];
    if (!protocol || !protocolIsActive(protocol)) return;
    const approvalBoundaryGate = protocol.kind === "approval-boundary" && toolName === "structural_gate";
    if (!protocol.requiredTools.includes(toolName) && !approvalBoundaryGate) return;
    if (approvalBoundaryGate && satisfaction.status === "satisfied") {
      const outcome = typeof result?.outcome === "string" ? result.outcome : undefined;
      if (result?.readyToComplete === false || outcome === "blocked" || outcome === "deferred") {
        const reason = `stopped before hard boundary: ${protocol.hardBoundary ?? "unknown"}`;
        state.autonomyProtocols[key] = markProtocolToolBlocked(protocol, "approval-boundary", reason);
        state.autonomyProtocols = pruneAutonomyProtocols(state.autonomyProtocols);
        return;
      }
    }
    let updated = satisfaction.status === "satisfied"
      ? markProtocolToolSatisfied(protocol, toolName, satisfaction.evidence)
      : markProtocolToolBlocked(protocol, toolName, satisfaction.evidence ?? `${toolName} ${satisfaction.status}`);
    if (satisfaction.status === "satisfied" && protocolShouldCompleteFromTool(updated, toolName, result)) {
      updated = completeAutonomyProtocol(updated);
    }
    state.autonomyProtocols[key] = updated;
    state.autonomyProtocols = pruneAutonomyProtocols(state.autonomyProtocols);
  });
}

async function updateLedgerForToolResult(
  cwd: string,
  sessionId: string,
  toolName: string,
  input: unknown,
  isError: boolean | undefined,
  content: unknown,
): Promise<void> {
  if (toolName !== "bash") return;
  const command = verificationCommandFromInput(input);
  if (!command) return;
  const status: VerificationStatus = isError ? "failed" : "passed";
  await updateState((state) => {
    const key = ledgerKey(cwd, sessionId);
    const ledger = getLedger(state, cwd, sessionId);
    state.ledgers[key] = recordVerification(ledger, command, status, textContentPreview(content));
  });
}

async function activeLaneContextFromState(ctx: { cwd?: string } | undefined): Promise<ActiveLaneRuntimeState | undefined> {
  const cwd = ctx?.cwd || process.cwd();
  const sessionId = sessionIdFromContext(ctx);
  const state = await loadState();
  return activeLaneFromState(state, cwd, sessionId);
}

async function activeLaneContextFor(ctx: { cwd?: string } | undefined): Promise<ActiveLaneContext | undefined> {
  return await activeLaneContextFromState(ctx) ?? activeLaneContextFromEnv();
}

const activeLaneStore = {
  async activate(sessionId: string, cwd: string, context: ActiveLaneContext): Promise<void> {
    await updateState((state) => {
      const runtimeState: ActiveLaneRuntimeState = { version: 1, sessionId, cwd, ...context, activatedAt: nowIso() };
      state.activeLanes[activeLaneKey(cwd, sessionId)] = runtimeState;
      delete state.activeLanes[sessionId];
    });
  },
  async deactivate(sessionId: string, cwd?: string): Promise<void> {
    await updateState((state) => {
      if (cwd) delete state.activeLanes[activeLaneKey(cwd, sessionId)];
      delete state.activeLanes[sessionId];
      for (const [key, lane] of Object.entries(state.activeLanes)) {
        if (lane.sessionId === sessionId && (!cwd || lane.cwd === cwd)) delete state.activeLanes[key];
      }
    });
  },
};

async function autonomyProtocolCompletionBlock(review: StructuralGateReview, ctx: { cwd?: string }): Promise<string | undefined> {
  const cwd = ctx.cwd || process.cwd();
  const sessionId = sessionIdFromContext(ctx);
  const protocol = (await loadState()).autonomyProtocols[autonomyProtocolKey(cwd, sessionId)];
  if (!protocol || protocol.kind === "none" || !protocolIsActive(protocol)) return undefined;

  const outcome = review.outcome ?? "complete";
  if (protocol.kind === "approval-boundary") {
    return review.readyToComplete || outcome === "complete"
      ? `approval-boundary protocol cannot complete before hard boundary: ${protocol.hardBoundary ?? "unknown"}`
      : undefined;
  }

  if (outcome !== "complete" || !review.readyToComplete) return undefined;
  const nonStructuralBlockedTools = protocol.blockedTools.filter((tool) => tool.toolName !== "structural_gate");
  if (nonStructuralBlockedTools.length > 0) {
    return `autonomous protocol ${protocol.kind} has blocked tools: ${nonStructuralBlockedTools.map((tool) => `${tool.toolName} (${tool.reason})`).join(", ")}`;
  }
  const missing = missingRequiredTools(protocol, { excludeTools: ["structural_gate"] });
  return missing.length > 0 ? `autonomous protocol ${protocol.kind} required tools missing: ${missing.join(", ")}` : undefined;
}

export default function chocoAutopilot(pi: ExtensionAPI) {
  installStructuralGate(pi, autonomyProtocolCompletionBlock);
  installDynamicSdd(pi);
  registerRuntimeReload(pi);
  registerSessionDashboardCommand(pi, loadState);
  registerSourceRegistryTool(pi);
  registerBranchSwitchGuardTool(pi);
  registerParallelWorkPlanTool(pi);
  registerWorktreeManageTool(pi);
  registerAgentOrchestratorTool(pi, activeLaneStore);
  registerIntegrationVerifierTool(pi);
  registerModeScaffoldTool(pi);
  const dogfoodCases = createActiveDogfoodCaseState();
  const bashScopeSnapshots = new Map<string, string[]>();
  const webRepairStates = new Map<string, WebResearchRepairState>();
  const adoptionRepairStates = new Map<string, AdoptionAnalysisRepairState>();
  const codingRepairStates = new Map<string, CodingRepairState>();
  const reportRepairStates = new Map<string, ReportRepairState>();
  const designRepairStates = new Map<string, DesignRepairState>();

  pi.on("resources_discover", async (_event, ctx) => discoverSuperpowersSkillPath(pi, ctx));
  pi.on("resources_discover", async () => discoverKamiSkillPath());
  pi.on("resources_discover", async (_event, ctx) => discoverImNotAiSkillPath(pi, ctx));

  pi.on("tool_call", async (event, ctx) => {
    const decision = classifyApprovalBoundaryToolCall(event.toolName, event.input);
    if (decision) return { block: true, reason: formatApprovalBoundaryBlock(decision) };
    const activeLane = await activeLaneContextFor(ctx);
    const scopeDecision = guardToolCallWriteScope(activeLane, event.toolName, event.input);
    if (!scopeDecision.allowed) {
      if (activeLane) await recordWriteScopeViolation(activeLane, scopeDecision.reason);
      await blockAutonomyProtocolTool(ctx.cwd || process.cwd(), sessionIdFromContext(ctx), "write_scope_guard", scopeDecision.reason);
      return { block: true, reason: scopeDecision.reason };
    }
    if (activeLane && event.toolName === "bash") {
      const toolCallId = typeof (event as { toolCallId?: unknown }).toolCallId === "string" ? (event as { toolCallId: string }).toolCallId : "bash";
      bashScopeSnapshots.set(toolCallId, await snapshotGitChangedFiles(ctx.cwd || process.cwd()));
    }
    recordDogfoodToolCall(dogfoodCases, event.toolName);
    await updateLedgerForToolCall(ctx.cwd || process.cwd(), sessionIdFromContext(ctx), event.toolName, event.input);
    return undefined;
  });

  pi.on("tool_result", async (event, ctx) => {
    const activeLane = await activeLaneContextFor(ctx);
    if (activeLane && event.toolName === "bash") {
      const toolCallId = typeof (event as { toolCallId?: unknown }).toolCallId === "string" ? (event as { toolCallId: string }).toolCallId : "bash";
      const before = bashScopeSnapshots.get(toolCallId) ?? [];
      bashScopeSnapshots.delete(toolCallId);
      const after = await snapshotGitChangedFiles(ctx.cwd || process.cwd());
      const decision = detectBashScopeViolations(activeLane, before, after);
      if (!decision.allowed) {
        await recordWriteScopeViolation(activeLane, decision.reason ?? "bash write scope violation");
        await pi.sendMessage?.({
          customType: "choco.write_scope_violation",
          display: false,
          content: decision.reason ?? "bash write scope violation",
        }, { deliverAs: "followUp", triggerTurn: true });
      }
    }
    recordDogfoodToolResult(dogfoodCases, event);
    await updateAutonomyProtocolForToolResult(ctx.cwd || process.cwd(), sessionIdFromContext(ctx), event.toolName, event);
    await updateLedgerForToolResult(ctx.cwd || process.cwd(), sessionIdFromContext(ctx), event.toolName, event.input, event.isError, event.content);
  });

  pi.on("session_start", async (event, ctx) => {
    await cleanupDogfoodCaseRetention(createDogfoodStore(dogfoodRootPath()));
    let state = await loadState();
    const sessionId = sessionIdFromContext(ctx);
    const dueGithubSources = sourcesDueForWeeklyCheck(state.sourceRegistry)
      .filter((source) => source.kind === "github")
      .slice(0, 5);
    if (dueGithubSources.length > 0) {
      const outcomes = await checkSources(pi, dueGithubSources);
      state = await updateState((draft) => {
        draft.sourceRegistry = applySourceCheckOutcomes(draft.sourceRegistry, outcomes).registry;
        return draft;
      });
    }
    if (ctx.hasUI && event.reason === "startup" && shouldRunAutoUpdate(state.autoUpdate)) {
      const result = await runChocoPiUpdate(pi, { trigger: "auto", packageRoot: chocoPiPackageRoot() });
      const checkedAt = nowIso();
      state = await updateState((draft) => {
        draft.autoUpdate.lastCheckedAt = checkedAt;
        draft.autoUpdate.lastResult = summarizeAutoUpdateResult(result, checkedAt);
        return draft;
      });
      const formatted = formatAutoUpdateResult(result);
      if (formatted.message) ctx.ui.notify(formatted.message, formatted.level);
      if (result.status === "updated") pi.sendUserMessage("/reload-runtime", { deliverAs: "followUp" });
    }
    if (!ctx.hasUI) return;
    const sessionRuntime = state.sessions[sessionId];
    const effective = sessionRuntime?.effectiveWorkMode ?? state.runtime.workMode;
    ctx.ui.setStatus(
      "mode",
      ctx.ui.theme.fg("accent", `mode:${state.runtime.workMode}->${effective}/${state.runtime.executionIntensity}@${CHOCO_PI_VERSION}`),
    );
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    const sessionId = sessionIdFromContext(ctx);
    webRepairStates.delete(sessionId);
    adoptionRepairStates.delete(sessionId);
    codingRepairStates.delete(sessionId);
    reportRepairStates.delete(sessionId);
    designRepairStates.delete(sessionId);
    await activeLaneStore.deactivate(sessionId);
    if (ctx.hasUI) ctx.ui.setStatus("mode", undefined);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const cwd = ctx.cwd || process.cwd();
    const sessionId = sessionIdFromContext(ctx);
    const prompt = event.prompt ?? "";
    if (!prompt.includes(WEB_REPAIR_PROMPT_MARKER)) repairStateFor(webRepairStates, sessionId).repairQueued = false;
    if (!prompt.includes(ADOPTION_REPAIR_PROMPT_MARKER)) repairStateFor(adoptionRepairStates, sessionId).repairQueued = false;
    if (!prompt.includes(CODING_REPAIR_PROMPT_MARKER)) repairStateFor(codingRepairStates, sessionId).repairQueued = false;
    if (!prompt.includes(REPORT_REPAIR_PROMPT_MARKER)) repairStateFor(reportRepairStates, sessionId).repairQueued = false;
    if (!prompt.includes(DESIGN_REPAIR_PROMPT_MARKER)) repairStateFor(designRepairStates, sessionId).repairQueued = false;
    const suggestedWorkModes = inferPlannedWorkModes(prompt);
    const suggestedWorkMode = suggestedWorkModes.at(-1) ?? inferPlannedWorkMode(prompt);
    const hasActiveManifest = await hasActiveManifestForCwd(cwd);
    const currentBranch = await gitCurrentBranch(cwd).catch(() => null);
    const {
      workMode,
      effectiveWorkMode,
      executionIntensity,
      modeSequence,
      ledger,
      sourceRegistry,
      memories,
      autonomyProtocol,
    } = await updateState((state) => {
      const modeDecision = resolveEffectiveWorkMode({
        persistentMode: state.runtime.workMode,
        suggestedMode: suggestedWorkMode,
        suggestedModes: suggestedWorkModes,
      });
      const workMode = state.runtime.workMode;
      const effectiveWorkMode = modeDecision.effectiveMode;
      const executionIntensity = maxIntensity(
        state.runtime.executionIntensity,
        classifyExecutionIntensity(prompt),
      );
      state.sessions[sessionId] = {
        effectiveWorkMode,
        effectiveModeSequence: modeDecision.modeSequence,
        suggestedWorkMode,
        automaticMode: modeDecision.automatic,
        executionIntensity,
        updatedAt: nowIso(),
      };
      const activeLane = activeLaneFromState(state, cwd, sessionId);
      const protocolKey = autonomyProtocolKey(cwd, sessionId);
      const existingProtocol = state.autonomyProtocols[protocolKey];
      const route = routeAutonomyProtocol({
        prompt,
        cwd,
        sessionId,
        hasActiveManifest,
        activeLaneId: activeLane?.laneId,
        currentBranch,
        currentProtocol: existingProtocol,
      });
      const initiallySatisfiedTools = route.protocolKind === "worktree-lane" && activeLane ? ["write_scope_guard"] : [];
      let autonomyProtocol: AutonomyProtocol;
      if (route.resumeExisting && existingProtocol && protocolIsActive(existingProtocol)) {
        autonomyProtocol = resumeAutonomyProtocol(existingProtocol, route.reason);
      } else {
        autonomyProtocol = createAutonomyProtocol({
          kind: route.protocolKind,
          sessionId,
          cwd,
          prompt,
          requiredTools: route.requiredTools,
          hardBoundary: route.hardBoundary,
          activeGroupId: activeLane?.groupId,
          activeLaneId: activeLane?.laneId,
          initiallySatisfiedTools,
          reason: route.reason,
        });
        if (existingProtocol && protocolIsActive(existingProtocol) && route.protocolKind !== "none") {
          state.autonomyProtocols[protocolArchiveKey(cwd, sessionId, existingProtocol.id)] = markProtocolSuperseded(existingProtocol, autonomyProtocol.id);
        }
      }
      state.autonomyProtocols[protocolKey] = autonomyProtocol;
      state.autonomyProtocols = pruneAutonomyProtocols(state.autonomyProtocols);
      const ledger = getLedger(state, cwd, sessionId, prompt);
      return { workMode, effectiveWorkMode, executionIntensity, modeSequence: modeDecision.modeSequence, ledger, sourceRegistry: state.sourceRegistry, memories: state.memories, autonomyProtocol };
    });

    const ledgerSummary = summarizeLedger(ledger, { maxItemsPerSection: 4 });
    const changed = summarizeChangedSources(sourceRegistry);
    const due = summarizeDueSources(sourceRegistry);
    const dueSourceSummary = [changed, due].filter((line) => !line.startsWith("No ")).join("\n\n");

    const scope = await resolveDogfoodScope({
      cwd,
      mode: configuredImprovementMode(),
      profile: configuredImprovementProfile(),
    });

    await startDogfoodCase(dogfoodCases, createDogfoodStore(dogfoodRootPath()), {
      prompt,
      cwd,
      salt: scope.capture ? await dogfoodSalt() : "",
      workMode: effectiveWorkMode,
      executionIntensity,
      scope,
    });

    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildAutopilotSystemPrompt({
        workMode,
        effectiveWorkMode,
        modeSequence,
        executionIntensity,
        cwd,
        ledgerSummary,
        dueSourceSummary: dueSourceSummary || undefined,
        suggestedWorkMode,
        autonomyProtocol,
        globalMemorySummary: scope.kind === "global" && scope.memoryMode === "readonly" ? formatMemories(memories) : undefined,
      })}`,
    };
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return undefined;
    const assistantMessage = event.message as AssistantMessage;
    if (assistantMessage.stopReason !== "toolUse" && assistantMessage.stopReason !== "error" && assistantMessage.stopReason !== "aborted") {
      await finishDogfoodCase(dogfoodCases, createDogfoodStore(dogfoodRootPath()));
    }
    const state = await loadState();
    const sessionId = sessionIdFromContext(ctx);
    const sessionRuntime = state.sessions[sessionId];
    const effectiveWorkMode = sessionRuntime?.effectiveWorkMode ?? state.runtime.workMode;
    const guardResult = runGuardPipeline(assistantMessage, [
      {
        customType: "choco.web_analysis_quality.repair",
        run: () => guardWebResearchQualityMessage(effectiveWorkMode, assistantMessage, repairStateFor(webRepairStates, sessionId)),
      },
      {
        customType: "choco.coding_quality.repair",
        run: () => guardCodingQualityMessage(effectiveWorkMode, assistantMessage, repairStateFor(codingRepairStates, sessionId)),
      },
      {
        customType: "choco.adoption_analysis_quality.repair",
        run: () => guardAdoptionAnalysisQualityMessage(effectiveWorkMode, assistantMessage, repairStateFor(adoptionRepairStates, sessionId)),
      },
      {
        customType: "choco.report_quality.repair",
        run: () => guardReportQualityMessage(effectiveWorkMode, assistantMessage, repairStateFor(reportRepairStates, sessionId)),
      },
      {
        customType: "choco.design_quality.repair",
        run: () => guardDesignQualityMessage(effectiveWorkMode, assistantMessage, repairStateFor(designRepairStates, sessionId)),
      },
    ]);

    for (const repair of guardResult.repairs) {
      recordDogfoodRepairQueued(dogfoodCases, repair.customType);
      pi.sendMessage(
        {
          customType: repair.customType,
          content: repair.content,
          display: false,
          details: { repairQueued: true },
        },
        { deliverAs: "followUp", triggerTurn: true },
      );
    }

    return guardResult.message ? { message: guardResult.message } : undefined;
  });

  pi.registerCommand("dogfood", {
    description: "Show cross-project dogfooding quality status and weekly reports",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const store = createDogfoodStore(dogfoodRootPath());
      const [command = "status", ...rest] = args.trim().split(/\s+/).filter(Boolean);
      const week = rest[0] && /^\d{4}-W\d{2}$/.test(rest[0]) ? rest[0] : isoWeekId(new Date());

      if (command === "status") {
        const cases = await listDogfoodCases(store, week);
        const latest = await readDogfoodWeeklyReport(store, week);
        ctx.ui.notify(`dogfood status ${week}: ${cases.length}/25 cases, latest report: ${latest ? "yes" : "no"}`, "info");
        return;
      }

      if (command === "weekly") {
        const cases = await listDogfoodCases(store, week);
        const report = buildDogfoodWeeklyReport(week, cases);
        await writeDogfoodWeeklyReport(store, report);
        ctx.ui.notify(formatDogfoodWeeklyReport(report), "info");
        return;
      }

      if (command === "report") {
        const report = await readDogfoodWeeklyReport(store, week);
        ctx.ui.notify(report ? formatDogfoodWeeklyReport(report) : `No dogfood weekly report for ${week}. Run /dogfood weekly ${week}.`, "info");
        return;
      }

      if (command === "queue") {
        const queue = await readDogfoodQueue(store);
        ctx.ui.notify(`review queue: ${queue.length}`, "info");
        return;
      }

      if (command === "explain") {
        const [id] = rest;
        const cases = await listDogfoodCases(store);
        const found = cases.find((item) => item.id === id);
        ctx.ui.notify(found ? `${found.id}: ${found.outcome} (${found.outcomeConfidence}) — ${found.ruleReasons.join(", ")}` : `No dogfood case found for id: ${id ?? ""}`, "info");
        return;
      }

      ctx.ui.notify("Usage: /dogfood [status|weekly|report|queue|explain <id>] [YYYY-WW]", "error");
    },
  });

  pi.registerCommand("update", {
    description: "Run canonical pi update, refresh choco-pi when safe, and manage automatic updates",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const state = await loadState();
      const [command = "now", ...rest] = splitCommandArgs(args);

      if (command === "status") {
        ctx.ui.notify(formatAutoUpdateStatus(state.autoUpdate, CHOCO_PI_VERSION), "info");
        return;
      }

      if (command === "auto") {
        const value = rest[0] ?? "status";
        if (value === "on" || value === "off") {
          await updateState((draft) => {
            draft.autoUpdate.enabled = value === "on";
          });
          ctx.ui.notify(`auto-update: ${value}`, "info");
          return;
        }
        if (value === "status") {
          ctx.ui.notify(formatAutoUpdateStatus(state.autoUpdate, CHOCO_PI_VERSION), "info");
          return;
        }
        ctx.ui.notify("Usage: /update [now|run|status|auto on|auto off|auto status|<pi update args...>]", "error");
        return;
      }

      const runLocalChocoUpdate = command === "now" || command === "run";
      const piUpdateArgs = runLocalChocoUpdate ? [] : [command, ...rest];
      const piResult = await runPiCliUpdate(pi, piUpdateArgs, ctx.cwd || process.cwd());
      const formattedPiResult = formatPiCliUpdateResult(piResult);
      ctx.ui.notify(formattedPiResult.message, formattedPiResult.level);
      if (piResult.status !== "completed") return;

      if (!runLocalChocoUpdate) {
        await ctx.waitForIdle();
        await ctx.reload();
        return;
      }

      const result = await runChocoPiUpdate(pi, { trigger: "manual", packageRoot: chocoPiPackageRoot() });
      const checkedAt = nowIso();
      await updateState((draft) => {
        draft.autoUpdate.lastCheckedAt = checkedAt;
        draft.autoUpdate.lastResult = summarizeAutoUpdateResult(result, checkedAt);
      });
      const formatted = formatManualUpdateResult(result);
      ctx.ui.notify(formatted.message, formatted.level);

      await ctx.waitForIdle();
      await ctx.reload();
    },
  });

  pi.registerCommand("mode", {
    description: "Open work mode selector or manage modes: status, list, set, add, remove",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const state = await loadState();
      const trimmed = args.trim();
      if (!trimmed) {
        await selectWorkMode(state, ctx);
        return;
      }

      const [command, ...rest] = splitCommandArgs(trimmed);

      if (command === "status") {
        ctx.ui.notify(`mode: ${state.runtime.workMode}`, "info");
        return;
      }

      if (command === "list") {
        ctx.ui.notify(listWorkModes(state.workModeRegistry), "info");
        return;
      }

      if (command === "add") {
        const [id, ...descriptionParts] = rest;
        if (!id || descriptionParts.length === 0) {
          ctx.ui.notify("Usage: /mode add <id> <description>", "error");
          return;
        }
        try {
          const description = descriptionParts.join(" ");
          const mode = await updateState(async (draft) => {
            draft.workModeRegistry = addCustomWorkMode(draft.workModeRegistry, {
              id,
              description,
            });
            const mode = findWorkMode(draft.workModeRegistry, id);
            if (mode) await writeCustomModeFile(mode.id, mode.folder, description);
            return mode;
          });
          ctx.ui.notify(`Added planned work mode: ${id}${mode ? ` (${mode.instructionFile})` : ""}`, "info");
        } catch (error) {
          ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        }
        return;
      }

      if (command === "remove") {
        const [id] = rest;
        if (!id) {
          ctx.ui.notify("Usage: /mode remove <id>", "error");
          return;
        }
        try {
          await updateState(async (draft) => {
            const existing = findWorkMode(draft.workModeRegistry, id);
            draft.workModeRegistry = removeCustomWorkMode(draft.workModeRegistry, id);
            if (existing?.custom) await removeCustomModeFile(existing.folder);
          });
          ctx.ui.notify(`Removed custom work mode: ${id}`, "info");
        } catch (error) {
          ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        }
        return;
      }

      const modeArg = command === "set" ? rest[0] : command;
      if (!modeArg) {
        ctx.ui.notify("Usage: /mode [status|list|set <mode>|add <id> <description>|remove <id>]. Run /mode with no arguments to open the selector.", "error");
        return;
      }
      const workMode = parseWorkMode(modeArg);
      if (!workMode) {
        const registeredMode = findWorkMode(state.workModeRegistry, modeArg);
        if (registeredMode) {
          ctx.ui.notify(`Work mode '${registeredMode.id}' is registered at ${registeredMode.instructionFile} but not implemented. Staying in default mode.`, "warning");
          return;
        }
        ctx.ui.notify("Usage: /mode [status|list|set <mode>|add <id> <description>|remove <id>]. Run /mode with no arguments to open the selector.", "error");
        return;
      }

      await setWorkMode(workMode, ctx);
    },
  });

  pi.registerCommand("intensity", {
    description: "Show or set execution intensity: micro, standard, or deep",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const value = args.trim();
      if (!value || value === "status") {
        const state = await loadState();
        ctx.ui.notify(`intensity: ${state.runtime.executionIntensity}`, "info");
        return;
      }

      const intensity = parseExecutionIntensity(value);
      if (!intensity) {
        ctx.ui.notify("Usage: /intensity [micro|standard|deep|status]", "error");
        return;
      }

      await setExecutionIntensity(intensity, ctx);
    },
  });

  registerEffortCommand(pi);

  pi.registerCommand("source", {
    description: "Track, watch, adopt, reject, and check external repos/links for weekly update checks",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const [command = "list", ...rest] = args.trim().split(/\s+/).filter(Boolean);
      const state = await loadState();

      if (command === "list") {
        ctx.ui.notify(formatSources(state.sourceRegistry), "info");
        return;
      }

      if (command === "due") {
        ctx.ui.notify(summarizeDueSources(state.sourceRegistry), "info");
        return;
      }

      if (command === "changed") {
        ctx.ui.notify(summarizeChangedSources(state.sourceRegistry), "info");
        return;
      }

      if (command === "add") {
        const [url, ...rationaleParts] = rest;
        if (!url) {
          ctx.ui.notify("Usage: /source add <url> [rationale]", "error");
          return;
        }
        const source = createExternalSource(url, { rationale: rationaleParts.join(" ") || undefined });
        await updateState((draft) => {
          draft.sourceRegistry = upsertExternalSource(draft.sourceRegistry, source);
        });
        ctx.ui.notify(`Tracked external source: ${source.id}`, "info");
        return;
      }

      if (command === "watch") {
        const [id, ...reviewParts] = rest;
        if (!id) {
          ctx.ui.notify("Usage: /source watch <id> [review]", "error");
          return;
        }
        if (!hasSourceId(state.sourceRegistry, id)) {
          ctx.ui.notify(`Unknown source id: ${id}`, "error");
          return;
        }
        await updateState((draft) => {
          draft.sourceRegistry = markSourceWatching(draft.sourceRegistry, id, reviewParts.join(" ") || "Watching for future adoption analysis.");
        });
        ctx.ui.notify(`Marked watching: ${id}`, "info");
        return;
      }

      if (command === "adopt") {
        const [id, ...reviewParts] = rest;
        if (!id) {
          ctx.ui.notify("Usage: /source adopt <id> [review]", "error");
          return;
        }
        if (!hasSourceId(state.sourceRegistry, id)) {
          ctx.ui.notify(`Unknown source id: ${id}`, "error");
          return;
        }
        await updateState((draft) => {
          draft.sourceRegistry = markSourceAdopted(draft.sourceRegistry, id, reviewParts.join(" ") || "Adopted for choco-pi.");
        });
        ctx.ui.notify(`Marked adopted: ${id}`, "info");
        return;
      }

      if (command === "reject") {
        const [id, ...reviewParts] = rest;
        if (!id) {
          ctx.ui.notify("Usage: /source reject <id> [review]", "error");
          return;
        }
        if (!hasSourceId(state.sourceRegistry, id)) {
          ctx.ui.notify(`Unknown source id: ${id}`, "error");
          return;
        }
        await updateState((draft) => {
          draft.sourceRegistry = markSourceRejected(draft.sourceRegistry, id, reviewParts.join(" ") || "Rejected for choco-pi.");
        });
        ctx.ui.notify(`Marked rejected: ${id}`, "info");
        return;
      }

      if (command === "check") {
        const target = rest[0] || "due";
        const selected = selectSourcesForCheck(state.sourceRegistry, target);
        if (selected.length === 0) {
          ctx.ui.notify(`No sources selected for check: ${target}`, "warning");
          return;
        }
        const outcomes = await checkSources(pi, selected);
        const messages = await updateState((draft) => {
          const applied = applySourceCheckOutcomes(draft.sourceRegistry, outcomes);
          draft.sourceRegistry = applied.registry;
          return applied.messages;
        });
        ctx.ui.notify(messages.join("\n"), "info");
        return;
      }

      ctx.ui.notify("Usage: /source [list|add|watch|adopt|reject|due|changed|check]", "error");
    },
  });

  pi.registerCommand("memory", {
    description: "List or save durable memories",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const trimmed = args.trim();
      const state = await loadState();

      if (!trimmed || trimmed === "list") {
        ctx.ui.notify(formatMemories(state.memories), "info");
        return;
      }

      const text = trimmed.startsWith("save ") ? trimmed.slice(5).trim() : trimmed;
      const scope = await resolveDogfoodScope({
        cwd: ctx.cwd,
        mode: configuredImprovementMode(),
        profile: configuredImprovementProfile(),
      });
      if (scope.kind === "global" && scope.memoryMode === "readonly") {
        ctx.ui.notify("Skipped memory: ~/ uses readonly global memory recall; save from a project or explicit profile scope.", "warning");
        return;
      }
      const candidate = classifyMemoryCandidate(text);
      const memory = createStoredMemory(candidate);
      if (!memory) {
        ctx.ui.notify(`Skipped memory: ${candidate.reason}`, "warning");
        return;
      }

      await updateState((draft) => {
        draft.memories.push(memory);
      });
      ctx.ui.notify(`Saved memory: ${memory.kind}`, "info");
    },
  });

  pi.registerCommand("ledger", {
    description: "Show the compact Context Ledger for the current workspace",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const cwd = ctx.cwd || process.cwd();
      const sessionId = sessionIdFromContext(ctx);
      const key = ledgerKey(cwd, sessionId);

      if (args.trim() === "reset") {
        await updateState((draft) => {
          delete draft.ledgers[key];
        });
        ctx.ui.notify("Reset Context Ledger for this session/workspace.", "info");
        return;
      }

      const ledger = await updateState((draft) => getLedger(draft, cwd, sessionId));
      ctx.ui.notify(summarizeLedger(ledger, { maxItemsPerSection: 8 }), "info");
    },
  });
}
