import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";
import { ADOPTION_DEPTHS, type AdoptionDepth } from "./adoption-depth";
import {
  createEmptyLedger,
  recordChangedFile,
  recordVerification,
  type ContextLedger,
  type VerificationStatus,
  summarizeLedger,
} from "./context-ledger";
import { createActiveDogfoodCaseState, finishDogfoodCase, recordDogfoodToolCall, recordDogfoodToolResult, startDogfoodCase } from "./dogfood-collector";
import { isoWeekId } from "./dogfood-privacy";
import { cleanupDogfoodCaseRetention, createDogfoodStore, listDogfoodCases, readDogfoodQueue, readDogfoodWeeklyReport, writeDogfoodWeeklyReport } from "./dogfood-store";
import { buildDogfoodWeeklyReport, formatDogfoodWeeklyReport } from "./dogfood-weekly";
import { createStoredMemory, classifyMemoryCandidate, type StoredMemory } from "./memory";
import {
  createRuntimeState,
  DEFAULT_EXECUTION_INTENSITY,
  DEFAULT_WORK_MODE,
  inferPlannedWorkMode,
  isWorkModeImplemented,
  parseExecutionIntensity,
  parseWorkMode,
  type ExecutionIntensity,
  type RuntimeState,
  type WorkMode,
} from "./mode";
import { registerParallelWorkPlanTool } from "./parallel-work-plan-tool";
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
import { registerRuntimeReload } from "./runtime-reload";
import { resolveEffectiveWorkMode, sessionIdFromContext, sessionScopedKey } from "./session-scope";
import { installStructuralGate } from "./structural-gate";
import { DDOTZ_PI_VERSION } from "./version";
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

interface SessionRuntimeState {
  effectiveWorkMode: WorkMode;
  suggestedWorkMode?: WorkMode;
  automaticMode: boolean;
  executionIntensity: ExecutionIntensity;
  updatedAt: string;
}

interface DdotzState {
  version: 3;
  runtime: RuntimeState;
  sessions: Record<string, SessionRuntimeState>;
  memories: StoredMemory[];
  ledgers: Record<string, ContextLedger>;
  sourceRegistry: SourceRegistry;
  workModeRegistry: WorkModeRegistry;
}

const STATE_VERSION = 3 as const;
const WEB_REPAIR_PROMPT_MARKER = "내부 web-analysis 품질 보강이 필요합니다.";
const ADOPTION_REPAIR_PROMPT_MARKER = "내부 adoption-analysis 품질 보강이 필요합니다.";

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
  return join(agentDir(), "ddotz-pi", "state.json");
}

function dogfoodRootPath(): string {
  return join(agentDir(), "ddotz-pi", "dogfood");
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
  return join(agentDir(), "ddotz-pi", folder, "MODE.md");
}

async function writeCustomModeFile(id: string, folder: string, description: string): Promise<void> {
  const filePath = modeFilePath(folder);
  await mkdir(join(agentDir(), "ddotz-pi", folder), { recursive: true });
  await writeFile(
    filePath,
    [`# ${id} Mode`, "", "Status: planned, custom.", "", description.trim(), ""].join("\n"),
    "utf8",
  );
}

async function removeCustomModeFile(folder: string): Promise<void> {
  await rm(join(agentDir(), "ddotz-pi", folder), { recursive: true, force: true });
}

function emptyState(): DdotzState {
  return {
    version: STATE_VERSION,
    runtime: createRuntimeState(DEFAULT_WORK_MODE, DEFAULT_EXECUTION_INTENSITY),
    sessions: {},
    memories: [],
    ledgers: {},
    sourceRegistry: createSourceRegistry(),
    workModeRegistry: createWorkModeRegistry(),
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

async function loadState(): Promise<DdotzState> {
  try {
    const raw = await readFile(statePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<DdotzState> & { mode?: { mode?: string } };
    return {
      version: STATE_VERSION,
      runtime: migrateLegacyMode(parsed),
      sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
      memories: Array.isArray(parsed.memories) ? parsed.memories : [],
      ledgers: parsed.ledgers && typeof parsed.ledgers === "object" ? parsed.ledgers : {},
      sourceRegistry: parsed.sourceRegistry?.sources ? parsed.sourceRegistry : createSourceRegistry(),
      workModeRegistry: ensureBuiltInModes(parsed.workModeRegistry),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }
}

async function saveState(state: DdotzState): Promise<void> {
  const path = statePath();
  await mkdir(join(agentDir(), "ddotz-pi"), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function getLedger(state: DdotzState, cwd: string, sessionId: string, prompt?: string): ContextLedger {
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
  if (memories.length === 0) return "No ddotz-pi memories stored.";
  return memories
    .slice(-20)
    .map((memory) => `- [${memory.kind}] ${memory.text}`)
    .join("\n");
}

function formatSources(registry: SourceRegistry): string {
  if (registry.sources.length === 0) return "No ddotz-pi external sources tracked.";
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

async function setWorkMode(workMode: WorkMode, ctx: ExtensionCommandContext): Promise<void> {
  const state = await loadState();
  if (!isWorkModeImplemented(workMode)) {
    ctx.ui.notify(`Work mode '${workMode}' is planned but not implemented. Staying in default mode.`, "warning");
    return;
  }
  state.runtime = createRuntimeState(workMode, state.runtime.executionIntensity);
  await saveState(state);
  ctx.ui.notify(`mode: ${workMode}`, "info");
}

async function setExecutionIntensity(executionIntensity: ExecutionIntensity, ctx: ExtensionCommandContext): Promise<void> {
  const state = await loadState();
  state.runtime = createRuntimeState(state.runtime.workMode, executionIntensity);
  await saveState(state);
  ctx.ui.notify(`intensity: ${executionIntensity}`, "info");
}

async function selectWorkMode(state: DdotzState, ctx: ExtensionCommandContext): Promise<void> {
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

async function checkSources(pi: ExtensionAPI, state: DdotzState, sources: ExternalSource[]): Promise<string[]> {
  const messages: string[] = [];
  for (const source of sources) {
    const checkedAt = new Date();
    try {
      const result = await checkSource(pi, source);
      state.sourceRegistry = updateSourceCheckResult(state.sourceRegistry, source.id, {
        checkedAt,
        upstreamRef: result.ref,
        ok: result.ok,
        error: result.ok ? undefined : result.message,
      });
      messages.push(`${source.label}: ${result.message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.sourceRegistry = updateSourceCheckResult(state.sourceRegistry, source.id, {
        checkedAt,
        ok: false,
        error: message,
      });
      messages.push(`${source.label}: ${message}`);
    }
  }
  return messages;
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
    description: "Track adopted, watched, and rejected external sources for ddotz-pi adoption analysis.",
    promptSnippet: "source_registry: list/add/watch/adopt/reject/check external sources that are reflected into ddotz-pi or explicitly requested for tracking.",
    promptGuidelines: [
      "Track sources only when their code/design is reflected into ddotz-pi or the user explicitly asks to track them.",
      "Use watch for sources that are relevant but not adopted yet, especially when license, security, or freshness is unresolved.",
      "When adopting, record the smallest sufficient adoptionDepth and the concrete adopted/rejected scope.",
    ],
    parameters: SourceRegistryParams,
    renderShell: "self",
    async execute(_toolCallId, params) {
      const input = params as SourceRegistryToolParams;
      const state = await loadState();
      const details = () => ({ action: input.action, state: state.sourceRegistry });

      if (input.action === "list") {
        return { content: [{ type: "text", text: formatSources(state.sourceRegistry) }], details: details() };
      }
      if (input.action === "due") {
        return { content: [{ type: "text", text: summarizeDueSources(state.sourceRegistry) }], details: details() };
      }
      if (input.action === "changed") {
        return { content: [{ type: "text", text: summarizeChangedSources(state.sourceRegistry) }], details: details() };
      }
      if (input.action === "add") {
        if (!input.url?.trim()) throw new Error("Source URL is required");
        const source = createExternalSource(input.url, { rationale: input.rationale });
        state.sourceRegistry = upsertExternalSource(state.sourceRegistry, source);
        await saveState(state);
        return { content: [{ type: "text", text: `Tracked external source: ${source.id}` }], details: details() };
      }
      if (input.action === "watch") {
        const id = requireSourceId(input.id);
        state.sourceRegistry = markSourceWatching(state.sourceRegistry, id, input.review || "Watching for future adoption analysis.", {
          adoptionDepth: input.adoptionDepth,
          scopeRationale: input.scopeRationale,
          clearChangedFlag: input.clearChangedFlag,
        });
        await saveState(state);
        return { content: [{ type: "text", text: `Marked watching: ${id}` }], details: details() };
      }
      if (input.action === "adopt") {
        const id = requireSourceId(input.id);
        state.sourceRegistry = markSourceAdopted(state.sourceRegistry, id, input.review || "Adopted for ddotz-pi.", {
          adoptionDepth: input.adoptionDepth,
          adoptedItems: input.adoptedItems,
          rejectedItems: input.rejectedItems,
          scopeRationale: input.scopeRationale,
          clearChangedFlag: input.clearChangedFlag,
        });
        await saveState(state);
        return { content: [{ type: "text", text: `Marked adopted: ${id}` }], details: details() };
      }
      if (input.action === "reject") {
        const id = requireSourceId(input.id);
        state.sourceRegistry = markSourceRejected(state.sourceRegistry, id, input.review || "Rejected for ddotz-pi.");
        await saveState(state);
        return { content: [{ type: "text", text: `Marked rejected: ${id}` }], details: details() };
      }

      const target = input.target || input.id || "due";
      const selected = selectSourcesForCheck(state.sourceRegistry, target);
      if (selected.length === 0) return { content: [{ type: "text", text: `No sources selected for check: ${target}` }], details: details() };
      const messages = await checkSources(pi, state, selected);
      await saveState(state);
      return { content: [{ type: "text", text: messages.join("\n") }], details: details() };
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
  const state = await loadState();
  const key = ledgerKey(cwd, sessionId);
  const ledger = getLedger(state, cwd, sessionId);
  state.ledgers[key] = recordChangedFile(ledger, path);
  await saveState(state);
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
  const state = await loadState();
  const key = ledgerKey(cwd, sessionId);
  const ledger = getLedger(state, cwd, sessionId);
  state.ledgers[key] = recordVerification(ledger, command, status, textContentPreview(content));
  await saveState(state);
}

export default function ddotzAutopilot(pi: ExtensionAPI) {
  installStructuralGate(pi);
  registerRuntimeReload(pi);
  registerSourceRegistryTool(pi);
  registerParallelWorkPlanTool(pi);
  const dogfoodCases = createActiveDogfoodCaseState();
  const webRepairStates = new Map<string, WebResearchRepairState>();
  const adoptionRepairStates = new Map<string, AdoptionAnalysisRepairState>();

  pi.on("tool_call", async (event, ctx) => {
    const decision = classifyApprovalBoundaryToolCall(event.toolName, event.input);
    if (decision) return { block: true, reason: formatApprovalBoundaryBlock(decision) };
    recordDogfoodToolCall(dogfoodCases, event.toolName);
    await updateLedgerForToolCall(ctx.cwd || process.cwd(), sessionIdFromContext(ctx), event.toolName, event.input);
    return undefined;
  });

  pi.on("tool_result", async (event, ctx) => {
    recordDogfoodToolResult(dogfoodCases, event);
    await updateLedgerForToolResult(ctx.cwd || process.cwd(), sessionIdFromContext(ctx), event.toolName, event.input, event.isError, event.content);
  });

  pi.on("session_start", async (_event, ctx) => {
    await cleanupDogfoodCaseRetention(createDogfoodStore(dogfoodRootPath()));
    const state = await loadState();
    const sessionId = sessionIdFromContext(ctx);
    const dueGithubSources = sourcesDueForWeeklyCheck(state.sourceRegistry)
      .filter((source) => source.kind === "github")
      .slice(0, 5);
    if (dueGithubSources.length > 0) {
      await checkSources(pi, state, dueGithubSources);
      await saveState(state);
    }
    if (!ctx.hasUI) return;
    const sessionRuntime = state.sessions[sessionId];
    const effective = sessionRuntime?.effectiveWorkMode ?? state.runtime.workMode;
    ctx.ui.setStatus(
      "mode",
      ctx.ui.theme.fg("accent", `mode:${state.runtime.workMode}->${effective}/${state.runtime.executionIntensity}@${DDOTZ_PI_VERSION}`),
    );
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    const sessionId = sessionIdFromContext(ctx);
    webRepairStates.delete(sessionId);
    adoptionRepairStates.delete(sessionId);
    if (ctx.hasUI) ctx.ui.setStatus("mode", undefined);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const state = await loadState();
    const cwd = ctx.cwd || process.cwd();
    const sessionId = sessionIdFromContext(ctx);
    const prompt = event.prompt ?? "";
    if (!prompt.includes(WEB_REPAIR_PROMPT_MARKER)) repairStateFor(webRepairStates, sessionId).repairQueued = false;
    if (!prompt.includes(ADOPTION_REPAIR_PROMPT_MARKER)) repairStateFor(adoptionRepairStates, sessionId).repairQueued = false;
    const suggestedWorkMode = inferPlannedWorkMode(prompt);
    const modeDecision = resolveEffectiveWorkMode({
      persistentMode: state.runtime.workMode,
      suggestedMode: suggestedWorkMode,
    });
    const workMode = state.runtime.workMode;
    const effectiveWorkMode = modeDecision.effectiveMode;
    const executionIntensity = maxIntensity(
      state.runtime.executionIntensity,
      classifyExecutionIntensity(prompt),
    );
    state.sessions[sessionId] = {
      effectiveWorkMode,
      suggestedWorkMode,
      automaticMode: modeDecision.automatic,
      executionIntensity,
      updatedAt: nowIso(),
    };
    const ledger = getLedger(state, cwd, sessionId, prompt);
    await saveState(state);

    const ledgerSummary = summarizeLedger(ledger, { maxItemsPerSection: 4 });
    const changed = summarizeChangedSources(state.sourceRegistry);
    const due = summarizeDueSources(state.sourceRegistry);
    const dueSourceSummary = [changed, due].filter((line) => !line.startsWith("No ")).join("\n\n");

    await startDogfoodCase(dogfoodCases, createDogfoodStore(dogfoodRootPath()), {
      prompt,
      cwd,
      salt: await dogfoodSalt(),
      workMode: effectiveWorkMode,
      executionIntensity,
    });

    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildAutopilotSystemPrompt({
        workMode,
        effectiveWorkMode,
        executionIntensity,
        cwd,
        ledgerSummary,
        dueSourceSummary: dueSourceSummary || undefined,
        suggestedWorkMode,
      })}`,
    };
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return undefined;
    if (event.message.stopReason !== "toolUse" && event.message.stopReason !== "error" && event.message.stopReason !== "aborted") {
      await finishDogfoodCase(dogfoodCases, createDogfoodStore(dogfoodRootPath()));
    }
    const state = await loadState();
    const sessionId = sessionIdFromContext(ctx);
    const sessionRuntime = state.sessions[sessionId];
    const effectiveWorkMode = sessionRuntime?.effectiveWorkMode ?? state.runtime.workMode;
    const webResult = guardWebResearchQualityMessage(effectiveWorkMode, event.message, repairStateFor(webRepairStates, sessionId));
    if (webResult.followUp) {
      pi.sendMessage(
        {
          customType: "ddotz.web_analysis_quality.repair",
          content: webResult.followUp,
          display: false,
          details: { repairQueued: true },
        },
        { deliverAs: "followUp", triggerTurn: true },
      );
    }
    if (webResult.message) return { message: webResult.message };

    const adoptionResult = guardAdoptionAnalysisQualityMessage(effectiveWorkMode, event.message, repairStateFor(adoptionRepairStates, sessionId));
    if (adoptionResult.followUp) {
      pi.sendMessage(
        {
          customType: "ddotz.adoption_analysis_quality.repair",
          content: adoptionResult.followUp,
          display: false,
          details: { repairQueued: true },
        },
        { deliverAs: "followUp", triggerTurn: true },
      );
    }
    return adoptionResult.message ? { message: adoptionResult.message } : undefined;
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
          state.workModeRegistry = addCustomWorkMode(state.workModeRegistry, {
            id,
            description,
          });
          const mode = findWorkMode(state.workModeRegistry, id);
          if (mode) await writeCustomModeFile(mode.id, mode.folder, description);
          await saveState(state);
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
          const existing = findWorkMode(state.workModeRegistry, id);
          state.workModeRegistry = removeCustomWorkMode(state.workModeRegistry, id);
          if (existing?.custom) await removeCustomModeFile(existing.folder);
          await saveState(state);
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
        state.sourceRegistry = upsertExternalSource(state.sourceRegistry, source);
        await saveState(state);
        ctx.ui.notify(`Tracked external source: ${source.id}`, "info");
        return;
      }

      if (command === "watch") {
        const [id, ...reviewParts] = rest;
        if (!id) {
          ctx.ui.notify("Usage: /source watch <id> [review]", "error");
          return;
        }
        state.sourceRegistry = markSourceWatching(state.sourceRegistry, id, reviewParts.join(" ") || "Watching for future adoption analysis.");
        await saveState(state);
        ctx.ui.notify(`Marked watching: ${id}`, "info");
        return;
      }

      if (command === "adopt") {
        const [id, ...reviewParts] = rest;
        if (!id) {
          ctx.ui.notify("Usage: /source adopt <id> [review]", "error");
          return;
        }
        state.sourceRegistry = markSourceAdopted(state.sourceRegistry, id, reviewParts.join(" ") || "Adopted for ddotz-pi.");
        await saveState(state);
        ctx.ui.notify(`Marked adopted: ${id}`, "info");
        return;
      }

      if (command === "reject") {
        const [id, ...reviewParts] = rest;
        if (!id) {
          ctx.ui.notify("Usage: /source reject <id> [review]", "error");
          return;
        }
        state.sourceRegistry = markSourceRejected(state.sourceRegistry, id, reviewParts.join(" ") || "Rejected for ddotz-pi.");
        await saveState(state);
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
        const messages = await checkSources(pi, state, selected);
        await saveState(state);
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
      const candidate = classifyMemoryCandidate(text);
      const memory = createStoredMemory(candidate);
      if (!memory) {
        ctx.ui.notify(`Skipped memory: ${candidate.reason}`, "warning");
        return;
      }

      state.memories.push(memory);
      await saveState(state);
      ctx.ui.notify(`Saved memory: ${memory.kind}`, "info");
    },
  });

  pi.registerCommand("ledger", {
    description: "Show the compact Context Ledger for the current workspace",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const state = await loadState();
      const cwd = ctx.cwd || process.cwd();
      const sessionId = sessionIdFromContext(ctx);
      const key = ledgerKey(cwd, sessionId);

      if (args.trim() === "reset") {
        delete state.ledgers[key];
        await saveState(state);
        ctx.ui.notify("Reset Context Ledger for this session/workspace.", "info");
        return;
      }

      const ledger = getLedger(state, cwd, sessionId);
      await saveState(state);
      ctx.ui.notify(summarizeLedger(ledger, { maxItemsPerSection: 8 }), "info");
    },
  });
}
