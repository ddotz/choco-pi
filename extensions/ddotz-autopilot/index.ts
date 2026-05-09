import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createEmptyLedger, type ContextLedger, summarizeLedger } from "./context-ledger";
import { createStoredMemory, classifyMemoryCandidate, type StoredMemory } from "./memory";
import { createModeState, DEFAULT_MODE, parseMode, type ModeState } from "./mode";
import { buildAutopilotSystemPrompt, type DdotzMode } from "./policy";

interface DdotzState {
  version: 1;
  mode: ModeState;
  memories: StoredMemory[];
  ledgers: Record<string, ContextLedger>;
}

const STATE_VERSION = 1 as const;

function agentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

function statePath(): string {
  return join(agentDir(), "ddotz-pi", "state.json");
}

function emptyState(): DdotzState {
  return {
    version: STATE_VERSION,
    mode: createModeState(DEFAULT_MODE),
    memories: [],
    ledgers: {},
  };
}

function ledgerKey(cwd: string): string {
  return Buffer.from(cwd || process.cwd()).toString("base64url");
}

async function loadState(): Promise<DdotzState> {
  try {
    const raw = await readFile(statePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<DdotzState>;
    return {
      version: STATE_VERSION,
      mode: parsed.mode?.mode ? parsed.mode : createModeState(DEFAULT_MODE),
      memories: Array.isArray(parsed.memories) ? parsed.memories : [],
      ledgers: parsed.ledgers && typeof parsed.ledgers === "object" ? parsed.ledgers : {},
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

async function setMode(mode: DdotzMode, ctx: ExtensionCommandContext): Promise<void> {
  const state = await loadState();
  state.mode = createModeState(mode);
  await saveState(state);
  ctx.ui.notify(`ddotz-pi mode: ${mode}`, "info");
}

export default function ddotzAutopilot(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    const state = await loadState();
    ctx.ui.setStatus("ddotz-pi", ctx.ui.theme.fg("accent", `ddotz:${state.mode.mode}`));
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setStatus("ddotz-pi", undefined);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const state = await loadState();
    const cwd = ctx.cwd || process.cwd();
    const ledger = getLedger(state, cwd, event.prompt);
    await saveState(state);

    const ledgerSummary = summarizeLedger(ledger, { maxItemsPerSection: 4 });
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildAutopilotSystemPrompt({
        mode: state.mode.mode,
        cwd,
        ledgerSummary,
      })}`,
    };
  });

  pi.registerCommand("ddotz-mode", {
    description: "Show or set ddotz-pi mode: normal, autopilot, or heavy",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const value = args.trim();
      if (!value || value === "status") {
        const state = await loadState();
        ctx.ui.notify(`ddotz-pi mode: ${state.mode.mode}`, "info");
        return;
      }

      const mode = parseMode(value);
      if (!mode) {
        ctx.ui.notify("Usage: /ddotz-mode [normal|autopilot|heavy|status]", "error");
        return;
      }

      await setMode(mode, ctx);
    },
  });

  pi.registerCommand("ddotz-memory", {
    description: "List or save durable ddotz-pi memories",
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
      ctx.ui.notify(`Saved ddotz-pi memory: ${memory.kind}`, "info");
    },
  });

  pi.registerCommand("ddotz-ledger", {
    description: "Show the compact Context Ledger for the current workspace",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const state = await loadState();
      const cwd = ctx.cwd || process.cwd();
      const key = ledgerKey(cwd);

      if (args.trim() === "reset") {
        delete state.ledgers[key];
        await saveState(state);
        ctx.ui.notify("Reset ddotz-pi Context Ledger for this workspace.", "info");
        return;
      }

      const ledger = getLedger(state, cwd);
      await saveState(state);
      ctx.ui.notify(summarizeLedger(ledger, { maxItemsPerSection: 8 }), "info");
    },
  });
}
