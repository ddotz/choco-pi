import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createEmptyLedger,
  recordChangedFile,
  recordVerification,
  type ContextLedger,
  type VerificationStatus,
  summarizeLedger,
} from "./context-ledger";
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
import { buildAutopilotSystemPrompt, classifyExecutionIntensity } from "./policy";
import {
  createExternalSource,
  createSourceRegistry,
  gitRemoteUrlForSource,
  markSourceAdopted,
  markSourceRejected,
  sourcesDueForWeeklyCheck,
  summarizeChangedSources,
  summarizeDueSources,
  upsertExternalSource,
  updateSourceCheckResult,
  type ExternalSource,
  type SourceRegistry,
} from "./source-registry";
import { guardAdoptionAnalysisQualityMessage } from "./adoption-analysis-quality";
import { classifyApprovalBoundaryToolCall, formatApprovalBoundaryBlock } from "./approval-boundary";
import { registerRuntimeReload } from "./runtime-reload";
import { installStructuralGate } from "./structural-gate";
import { DDOTZ_PI_VERSION } from "./version";
import { guardWebResearchQualityMessage } from "./web-research-quality";
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

interface DdotzState {
  version: 2;
  runtime: RuntimeState;
  memories: StoredMemory[];
  ledgers: Record<string, ContextLedger>;
  sourceRegistry: SourceRegistry;
  workModeRegistry: WorkModeRegistry;
}

const STATE_VERSION = 2 as const;

function agentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

function statePath(): string {
  return join(agentDir(), "ddotz-pi", "state.json");
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

function ledgerKey(cwd: string): string {
  return Buffer.from(cwd || process.cwd()).toString("base64url");
}

async function loadState(): Promise<DdotzState> {
  try {
    const raw = await readFile(statePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<DdotzState> & { mode?: { mode?: string } };
    return {
      version: STATE_VERSION,
      runtime: migrateLegacyMode(parsed),
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

function getLedger(state: DdotzState, cwd: string, prompt?: string): ContextLedger {
  const key = ledgerKey(cwd);
  const existing = state.ledgers[key];
  if (existing) return existing;
  const objective = prompt?.trim() ? prompt.trim().slice(0, 240) : `Autonomous work in ${cwd}`;
  const created = createEmptyLedger(objective);
  state.ledgers[key] = created;
  return created;
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
      const ref = source.lastKnownRef ? ` @ ${source.lastKnownRef.slice(0, 12)}` : "";
      return `- ${source.id} [${source.status}${changed}] ${source.label}${ref} — ${source.url}`;
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

function objectInput(input: unknown): Record<string, unknown> | undefined {
  return input && typeof input === "object" ? input as Record<string, unknown> : undefined;
}

function toolInputPath(input: unknown): string | undefined {
  const path = objectInput(input)?.path;
  return typeof path === "string" && path.trim() ? path.trim().replace(/^@/, "") : undefined;
}

function verificationCommand(input: unknown): string | undefined {
  const command = objectInput(input)?.command;
  if (typeof command !== "string") return undefined;
  const trimmed = command.trim();
  if (!trimmed) return undefined;
  if (/\b(pnpm|npm|yarn)\s+(run\s+)?(check|test|lint|typecheck|version:check)\b/i.test(trimmed)) return trimmed;
  if (/\b(vitest|pytest|tsc|eslint|oxlint)\b/i.test(trimmed)) return trimmed;
  return undefined;
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

async function updateLedgerForToolCall(cwd: string, toolName: string, input: unknown): Promise<void> {
  if (toolName !== "write" && toolName !== "edit") return;
  const path = toolInputPath(input);
  if (!path) return;
  const state = await loadState();
  const key = ledgerKey(cwd);
  const ledger = getLedger(state, cwd);
  state.ledgers[key] = recordChangedFile(ledger, path);
  await saveState(state);
}

async function updateLedgerForToolResult(cwd: string, toolName: string, input: unknown, isError: boolean | undefined, content: unknown): Promise<void> {
  if (toolName !== "bash") return;
  const command = verificationCommand(input);
  if (!command) return;
  const status: VerificationStatus = isError ? "failed" : "passed";
  const state = await loadState();
  const key = ledgerKey(cwd);
  const ledger = getLedger(state, cwd);
  state.ledgers[key] = recordVerification(ledger, command, status, textContentPreview(content));
  await saveState(state);
}

export default function ddotzAutopilot(pi: ExtensionAPI) {
  installStructuralGate(pi);
  registerRuntimeReload(pi);

  pi.on("tool_call", async (event, ctx) => {
    const decision = classifyApprovalBoundaryToolCall(event.toolName, event.input);
    if (decision) return { block: true, reason: formatApprovalBoundaryBlock(decision) };
    await updateLedgerForToolCall(ctx.cwd || process.cwd(), event.toolName, event.input);
    return undefined;
  });

  pi.on("tool_result", async (event, ctx) => {
    await updateLedgerForToolResult(ctx.cwd || process.cwd(), event.toolName, event.input, event.isError, event.content);
  });

  pi.on("session_start", async (_event, ctx) => {
    const state = await loadState();
    const dueGithubSources = sourcesDueForWeeklyCheck(state.sourceRegistry)
      .filter((source) => source.kind === "github")
      .slice(0, 5);
    if (dueGithubSources.length > 0) {
      await checkSources(pi, state, dueGithubSources);
      await saveState(state);
    }
    if (!ctx.hasUI) return;
    ctx.ui.setStatus(
      "mode",
      ctx.ui.theme.fg("accent", `mode:${state.runtime.workMode}/${state.runtime.executionIntensity}@${DDOTZ_PI_VERSION}`),
    );
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setStatus("mode", undefined);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const state = await loadState();
    const cwd = ctx.cwd || process.cwd();
    const ledger = getLedger(state, cwd, event.prompt);
    await saveState(state);

    const workMode = state.runtime.workMode;
    const suggestedWorkMode = inferPlannedWorkMode(event.prompt ?? "");
    const executionIntensity = maxIntensity(
      state.runtime.executionIntensity,
      classifyExecutionIntensity(event.prompt ?? ""),
    );
    const ledgerSummary = summarizeLedger(ledger, { maxItemsPerSection: 4 });
    const changed = summarizeChangedSources(state.sourceRegistry);
    const due = summarizeDueSources(state.sourceRegistry);
    const dueSourceSummary = [changed, due].filter((line) => !line.startsWith("No ")).join("\n\n");

    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildAutopilotSystemPrompt({
        workMode,
        executionIntensity,
        cwd,
        ledgerSummary,
        dueSourceSummary: dueSourceSummary || undefined,
        suggestedWorkMode,
      })}`,
    };
  });

  pi.on("message_end", async (event) => {
    if (event.message.role !== "assistant") return undefined;
    const state = await loadState();
    const webResult = guardWebResearchQualityMessage(state.runtime.workMode, event.message);
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

    const adoptionResult = guardAdoptionAnalysisQualityMessage(state.runtime.workMode, event.message);
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
    description: "Track adopted external repos/links for weekly update checks",
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
        const selected = target === "all"
          ? state.sourceRegistry.sources.filter((source) => source.status !== "rejected")
          : target === "due"
            ? sourcesDueForWeeklyCheck(state.sourceRegistry)
            : state.sourceRegistry.sources.filter((source) => source.id === target);
        if (selected.length === 0) {
          ctx.ui.notify(`No sources selected for check: ${target}`, "warning");
          return;
        }
        const messages = await checkSources(pi, state, selected);
        await saveState(state);
        ctx.ui.notify(messages.join("\n"), "info");
        return;
      }

      ctx.ui.notify("Usage: /source [list|add|adopt|reject|due|changed|check]", "error");
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
      const key = ledgerKey(cwd);

      if (args.trim() === "reset") {
        delete state.ledgers[key];
        await saveState(state);
        ctx.ui.notify("Reset Context Ledger for this workspace.", "info");
        return;
      }

      const ledger = getLedger(state, cwd);
      await saveState(state);
      ctx.ui.notify(summarizeLedger(ledger, { maxItemsPerSection: 8 }), "info");
    },
  });
}
