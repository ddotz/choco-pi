import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";

const ReloadRuntimeParams = Type.Object({});

export const RELOAD_RUNTIME_TOOL_NAME = "reload_runtime";
export const RELOAD_RUNTIME_COMMAND_NAME = "reload-runtime";

export type ReloadRuntimeMode = "direct" | "tmux-self-input" | "editor-prefill" | "unavailable";

export interface ReloadRuntimeDetails {
  mode: ReloadRuntimeMode;
  reloaded: boolean;
  command: string;
  submitted?: boolean;
  resumeQueued?: boolean;
  targetPane?: string;
  reason?: string;
}

type ReloadRuntimeServices = Pick<ExtensionAPI, "exec">;

type ReloadRuntimeAPI = Pick<ExtensionAPI, "exec" | "on" | "registerCommand" | "registerTool" | "sendUserMessage">;

const RELOAD_RUNTIME_CONTINUE_ARG = "--continue";
const RELOAD_RUNTIME_CONTINUE_COMMAND = `/${RELOAD_RUNTIME_COMMAND_NAME} ${RELOAD_RUNTIME_CONTINUE_ARG}`;
const RELOAD_RESUME_MARKER_FILE = "reload-runtime-resume.json";
const RELOAD_RESUME_MARKER_MAX_AGE_MS = 2 * 60 * 1000;
const TMUX_RELOAD_RETRY_COUNT = 12;
const TMUX_RELOAD_RETRY_DELAY_SECONDS = 5;
const TMUX_RELOAD_CHECK_COUNT = 20;
const TMUX_RELOAD_CHECK_DELAY_SECONDS = 1;
const TMUX_INITIAL_SUBMIT_DELAY_SECONDS = 1;

function reloadFromToolContext(ctx: ExtensionContext): (() => Promise<void>) | undefined {
  const maybeReload = (ctx as ExtensionContext & { reload?: unknown }).reload;
  return typeof maybeReload === "function" ? maybeReload.bind(ctx) as () => Promise<void> : undefined;
}

function tmuxPaneTarget(): string | undefined {
  const pane = process.env.TMUX_PANE?.trim();
  if (!pane || !/^%\d+$/.test(pane)) return undefined;
  return pane;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function agentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

function reloadResumeMarkerDir(): string {
  return join(agentDir(), "ddotz-pi");
}

function reloadResumeMarkerPath(): string {
  return join(reloadResumeMarkerDir(), RELOAD_RESUME_MARKER_FILE);
}

function shouldResumeAfterReload(args: string): boolean {
  return args.trim().split(/\s+/).includes(RELOAD_RUNTIME_CONTINUE_ARG);
}

async function writeReloadResumeMarker(): Promise<void> {
  await mkdir(reloadResumeMarkerDir(), { recursive: true });
  await writeFile(
    reloadResumeMarkerPath(),
    `${JSON.stringify({ command: RELOAD_RUNTIME_CONTINUE_COMMAND, createdAt: Date.now() })}\n`,
    "utf8",
  );
}

async function clearReloadResumeMarker(): Promise<void> {
  await rm(reloadResumeMarkerPath(), { force: true });
}

async function claimReloadResumeMarker(): Promise<boolean> {
  try {
    const raw = await readFile(reloadResumeMarkerPath(), "utf8");
    await clearReloadResumeMarker();
    const parsed = JSON.parse(raw) as { createdAt?: unknown };
    return typeof parsed.createdAt === "number" && Date.now() - parsed.createdAt <= RELOAD_RESUME_MARKER_MAX_AGE_MS;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    await clearReloadResumeMarker();
    return false;
  }
}

function tmuxDeferredReloadScript(targetPane: string): string {
  const target = shellQuote(targetPane);
  const reloadCommand = shellQuote(RELOAD_RUNTIME_CONTINUE_COMMAND);
  const markerPath = shellQuote(reloadResumeMarkerPath());
  return [
    `rm -f ${markerPath}`,
    "submitted=0",
    `sleep ${TMUX_INITIAL_SUBMIT_DELAY_SECONDS}`,
    `for attempt in $(seq 1 ${TMUX_RELOAD_RETRY_COUNT}); do`,
    `if [ "$attempt" -gt 1 ]; then sleep ${TMUX_RELOAD_RETRY_DELAY_SECONDS}; fi`,
    `tmux send-keys -t ${target} C-u`,
    `tmux send-keys -t ${target} -l ${reloadCommand}`,
    `tmux send-keys -t ${target} Escape`,
    `tmux send-keys -t ${target} Enter`,
    `for check_tick in $(seq 1 ${TMUX_RELOAD_CHECK_COUNT}); do`,
    `sleep ${TMUX_RELOAD_CHECK_DELAY_SECONDS}`,
    `if [ -f ${markerPath} ]; then submitted=1; break 2; fi`,
    "done",
    "done",
  ].join("\n");
}

async function submitReloadWithTmux(
  services: ReloadRuntimeServices | undefined,
  signal: AbortSignal | undefined,
): Promise<{ ok: true; targetPane: string } | { ok: false; reason: string }> {
  const targetPane = tmuxPaneTarget();
  if (!targetPane) return { ok: false, reason: "TMUX_PANE is not set for the Pi process." };
  if (!services?.exec) return { ok: false, reason: "ExtensionAPI.exec is unavailable." };

  const result = await services.exec("tmux", ["run-shell", "-b", tmuxDeferredReloadScript(targetPane)], { timeout: 2000, signal });
  if (result.code !== 0) {
    const stderr = result.stderr?.trim();
    return { ok: false, reason: stderr || `tmux run-shell exited ${result.code}` };
  }
  return { ok: true, targetPane };
}

export function createReloadRuntimeTool(services?: ReloadRuntimeServices): ToolDefinition<typeof ReloadRuntimeParams, ReloadRuntimeDetails, unknown> {
  return {
    name: RELOAD_RUNTIME_TOOL_NAME,
    label: "Reload runtime",
    description: "Reload Pi extensions, skills, prompts, and themes without starting a new session when the runtime exposes reload; otherwise self-submit the reload command through tmux when possible.",
    promptSnippet: "reload_runtime: try direct reload; if unavailable, self-submit /reload-runtime --continue through tmux and resume from the post-reload session_start event.",
    promptGuidelines: [
      "Use reload_runtime after changing Pi extensions, skills, prompts, or themes. If it reports tmux-self-input, it already queued /reload-runtime --continue through tmux; the reloaded extension sends continue from the post-reload session_start event, so do not ask the user to press Enter.",
      "If reload_runtime reports editor-prefill, tmux self-input was unavailable and the user must press Enter for the prepared /reload-runtime --continue command.",
    ],
    parameters: ReloadRuntimeParams,
    async execute(_toolCallId: string, _params: Record<string, never>, _signal: AbortSignal | undefined, _onUpdate: undefined, ctx: ExtensionContext) {
      const command = `/${RELOAD_RUNTIME_COMMAND_NAME}`;
      const queuedCommand = RELOAD_RUNTIME_CONTINUE_COMMAND;
      const reload = reloadFromToolContext(ctx);
      if (reload) {
        await reload();
        return {
          content: [{ type: "text", text: "Reloaded Pi runtime without starting a new session." }],
          details: { mode: "direct", reloaded: true, command },
          terminate: true,
        };
      }

      if (ctx.hasUI) {
        const tmux = await submitReloadWithTmux(services, _signal);
        if (tmux.ok) {
          const resumeQueued = true;
          ctx.ui.notify(`Queued ${queuedCommand} through tmux; post-reload continue is armed.`, "info");
          return {
            content: [{ type: "text", text: `Queued ${queuedCommand} through tmux self-input; post-reload continue is armed.` }],
            details: {
              mode: "tmux-self-input",
              reloaded: false,
              submitted: true,
              resumeQueued,
              targetPane: tmux.targetPane,
              command: queuedCommand,
            },
            terminate: true,
          };
        }

        ctx.ui.setEditorText(queuedCommand);
        ctx.ui.notify(`Direct tool reload is unavailable and tmux self-input failed (${tmux.reason}). Press Enter to execute: ${queuedCommand}`, "warning");
        return {
          content: [{ type: "text", text: `Prepared ${queuedCommand} in the editor because direct reload and tmux self-input are unavailable.` }],
          details: {
            mode: "editor-prefill",
            reloaded: false,
            command: queuedCommand,
            reason: `ExtensionContext does not expose reload(); tmux self-input unavailable: ${tmux.reason}`,
          },
          terminate: true,
        };
      }

      return {
        content: [{ type: "text", text: `Cannot reload from a tool in this non-interactive Pi runtime. Run ${command}.` }],
        details: {
          mode: "unavailable",
          reloaded: false,
          command,
          reason: "ExtensionContext does not expose reload() and no UI is available for command prefill.",
        },
        terminate: true,
      };
    },
  };
}

export function registerRuntimeReload(pi: ReloadRuntimeAPI): void {
  pi.on("session_start", async (event) => {
    if (event.reason !== "reload") return;
    const shouldContinue = await claimReloadResumeMarker();
    if (!shouldContinue) return;
    pi.sendUserMessage("continue", { deliverAs: "followUp" });
  });

  pi.registerCommand(RELOAD_RUNTIME_COMMAND_NAME, {
    description: "Reload extensions, skills, prompts, and themes without starting a new session",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const resumeAfterReload = shouldResumeAfterReload(args);
      if (resumeAfterReload) await writeReloadResumeMarker();
      try {
        await ctx.waitForIdle();
        await ctx.reload();
      } catch (error) {
        if (resumeAfterReload) await clearReloadResumeMarker();
        throw error;
      }
      return;
    },
  });

  pi.registerTool(createReloadRuntimeTool(pi));
}
