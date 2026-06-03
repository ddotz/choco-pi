import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { setTimeout as delay } from "node:timers/promises";
import { Type } from "typebox";
import { normalizeSessionId, sessionIdFromContext } from "./session-scope";
import {
  baseResult,
  cleanText,
  evidencePath,
  appendTextFile,
  readStatus,
  renderLedgerEntry,
  runRecord,
  runStart,
  safeLabel,
  writeTextFile,
  type UlwHarnessInput,
  type UlwHarnessOutcome,
  type UlwHarnessResult,
} from "./ulw-harness-storage";

export const ULW_HARNESS_TOOL_NAME = "ulw_harness";
export const ULW_HARNESS_COMMAND_NAME = "ulw";
export type { UlwHarnessAction, UlwHarnessInput, UlwHarnessResult } from "./ulw-harness-storage";

type UlwHarnessAPI = Pick<ExtensionAPI, "exec" | "registerCommand" | "registerTool">;
const DEFAULT_TMUX_TEST_TIMEOUT_MS = 120_000;
const TMUX_POLL_INTERVAL_MS = 250;

const UlwHarnessParams = Type.Object({
  action: Type.Union([Type.Literal("start"), Type.Literal("status"), Type.Literal("record"), Type.Literal("tmux-test")]),
  objective: Type.Optional(Type.String()),
  successCriteria: Type.Optional(Type.Array(Type.String())),
  plan: Type.Optional(Type.Array(Type.String())),
  nextActions: Type.Optional(Type.Array(Type.String())),
  evidence: Type.Optional(Type.String()),
  cleanup: Type.Optional(Type.String()),
  command: Type.Optional(Type.String()),
  label: Type.Optional(Type.String()),
  timeoutMs: Type.Optional(Type.Number()),
});

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exitMarkerFor(callId: string): string {
  return `__CHOCO_ULW_EXIT_${callId.replace(/[^a-z0-9]+/gi, "_").toUpperCase()}__`;
}

function wrapCommandForExitMarker(command: string, exitMarker: string): string {
  return `sh -lc ${shellQuote(command)}; printf '\\n${exitMarker}:%s\\n' "$?"`;
}

function readExitCode(transcript: string, exitMarker: string): number | undefined {
  const match = transcript.match(new RegExp(`${escapeRegExp(exitMarker)}:(\\d+)`));
  return match ? Number(match[1]) : undefined;
}

function commandTimeoutMs(input: UlwHarnessInput): number {
  const value = typeof input.timeoutMs === "number" ? input.timeoutMs : DEFAULT_TMUX_TEST_TIMEOUT_MS;
  return Number.isFinite(value) && value > 0 ? Math.min(value, 10 * 60_000) : DEFAULT_TMUX_TEST_TIMEOUT_MS;
}

async function runTmuxTest(
  services: UlwHarnessAPI,
  input: UlwHarnessInput,
  cwd: string,
  sessionId: string,
  toolCallId: string,
  signal: AbortSignal | undefined,
): Promise<UlwHarnessOutcome> {
  const command = cleanText(input.command);
  const callId = safeLabel(toolCallId, "tool");
  const label = safeLabel(cleanText(input.label), callId);
  const sessionName = `choco-ulw-${normalizeSessionId(sessionId)}-${callId}`;
  const resultBase = baseResult("tmux-test", cwd, sessionId);
  const outputPath = evidencePath(cwd, sessionId, label);
  const exitMarker = exitMarkerFor(callId);
  if (!command) {
    return { text: "ulw_harness tmux-test blocked: command is required.", result: { ...resultBase, ok: false, reason: "command is required" } };
  }

  const execTmux = async (args: string[], timeout: number) => {
    const result = await services.exec("tmux", args, { timeout, signal });
    if (result.code !== 0) throw new Error(result.stderr?.trim() || result.stdout?.trim() || `tmux ${args.join(" ")} exited ${result.code}`);
    return result;
  };

  const capturePane = async () => {
    const captured = await execTmux(["capture-pane", "-p", "-t", sessionName, "-S", "-", "-E", "-"], 5000);
    return captured.stdout || captured.stderr || "";
  };

  const waitForCompletion = async () => {
    const deadline = Date.now() + commandTimeoutMs(input);
    let transcript = "";
    while (Date.now() <= deadline) {
      transcript = await capturePane();
      const exitCode = readExitCode(transcript, exitMarker);
      if (exitCode !== undefined) return { transcript, exitCode };
      const remaining = deadline - Date.now();
      if (remaining > 0) await delay(Math.min(TMUX_POLL_INTERVAL_MS, remaining), undefined, signal ? { signal } : undefined);
    }
    return { transcript, reason: `timed out waiting for tmux completion marker after ${commandTimeoutMs(input)}ms` };
  };

  const killSession = async (currentCleanup: string): Promise<string> => {
    try {
      await execTmux(["kill-session", "-t", sessionName], 2000);
      return currentCleanup;
    } catch (cleanupError) {
      const cleanupReason = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      return `${currentCleanup} (cleanup attempted after failure: ${cleanupReason})`;
    }
  };

  let cleanup = `tmux kill-session -t ${sessionName}`;
  try {
    await execTmux(["new-session", "-d", "-s", sessionName, "-c", cwd], 2000);
    await execTmux(["send-keys", "-t", sessionName, "-l", wrapCommandForExitMarker(command, exitMarker)], 2000);
    await execTmux(["send-keys", "-t", sessionName, "Enter"], 2000);
    const completion = await waitForCompletion();
    cleanup = await killSession(cleanup);
    await writeTextFile(outputPath, completion.transcript);
    if ("reason" in completion) {
      await appendTextFile(
        resultBase.ledgerPath,
        renderLedgerEntry("tmux-test failed", [`- command: ${command}`, `- reason: ${completion.reason}`, `- evidence: ${outputPath}`, `- cleanup: ${cleanup}`]),
      );
      return { text: `ULW tmux test failed: ${completion.reason}`, result: { ...resultBase, ok: false, reason: completion.reason, evidencePath: outputPath, cleanup } };
    }
    if (completion.exitCode !== 0) {
      const reason = `exit code: ${completion.exitCode}`;
      await appendTextFile(
        resultBase.ledgerPath,
        renderLedgerEntry("tmux-test failed", [`- command: ${command}`, `- reason: ${reason}`, `- evidence: ${outputPath}`, `- cleanup: ${cleanup}`]),
      );
      return { text: `ULW tmux test failed: ${reason}`, result: { ...resultBase, ok: false, reason, evidencePath: outputPath, cleanup } };
    }
    await appendTextFile(
      resultBase.ledgerPath,
      renderLedgerEntry("tmux-test", [`- command: ${command}`, `- exit code: ${completion.exitCode}`, `- evidence: ${outputPath}`, `- cleanup: ${cleanup}`]),
    );
    return {
      text: `ULW tmux transcript captured: ${outputPath}`,
      result: { ...resultBase, ok: true, evidencePath: outputPath, cleanup },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    cleanup = await killSession(cleanup);
    await appendTextFile(resultBase.ledgerPath, renderLedgerEntry("tmux-test blocked", [`- command: ${command}`, `- reason: ${reason}`, `- cleanup: ${cleanup}`]));
    return { text: `ulw_harness tmux-test blocked: ${reason}`, result: { ...resultBase, ok: false, reason, cleanup } };
  }
}

export async function runUlwHarness(
  services: UlwHarnessAPI,
  toolCallId: string,
  params: UlwHarnessInput,
  signal: AbortSignal | undefined,
  ctx: { cwd?: string; sessionManager?: { getSessionId?: () => string } },
): Promise<{ content: Array<{ type: "text"; text: string }>; details: { result: UlwHarnessResult } }> {
  const cwd = ctx.cwd || process.cwd();
  const sessionId = sessionIdFromContext(ctx);
  const action = params.action;
  let outcome: UlwHarnessOutcome;
  if (action === "start") outcome = await runStart(params, cwd, sessionId);
  else if (action === "status") outcome = await readStatus(cwd, sessionId);
  else if (action === "record") outcome = await runRecord(params, cwd, sessionId);
  else outcome = await runTmuxTest(services, params, cwd, sessionId, toolCallId, signal);
  return { content: [{ type: "text", text: outcome.text }], details: { result: outcome.result } };
}

function commandInput(args: string): UlwHarnessInput {
  const trimmed = args.trim();
  if (!trimmed || trimmed === "status") return { action: "status" };
  const [command, ...rest] = trimmed.split(/\s+/);
  const text = rest.join(" ").trim();
  if (command === "start") return { action: "start", objective: text };
  if (command === "record") return { action: "record", evidence: text };
  if (command === "tmux-test") return { action: "tmux-test", command: text, label: "command" };
  return { action: "start", objective: trimmed };
}

export function registerUlwHarness(pi: UlwHarnessAPI): void {
  pi.registerTool({
    name: ULW_HARNESS_TOOL_NAME,
    label: "ULW harness",
    description: "Record ULW markdown context, evidence, and tmux-managed QA artifacts for autonomous choco-pi work.",
    promptSnippet: "ulw_harness: start/update ULW markdown context, record evidence, or run a tmux-test before ULW completion.",
    promptGuidelines: [
      "Use ulw_harness for active ULW protocols after spec_gate and before structural_gate completion.",
      "Record objective, criteria, plan, next actions, observable evidence, and cleanup receipts in markdown.",
      "Use tmux-test for CLI/manual-QA scenarios that need terminal execution and transcript capture.",
    ],
    parameters: UlwHarnessParams,
    async execute(toolCallId, params, signal, _onUpdate, ctx: ExtensionContext) {
      return await runUlwHarness(pi, toolCallId, params as UlwHarnessInput, signal, ctx);
    },
  });

  pi.registerCommand(ULW_HARNESS_COMMAND_NAME, {
    description: "Start or inspect ULW autonomous harness markdown context",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const result = await runUlwHarness(pi, "command", commandInput(args), undefined, ctx);
      ctx.ui.notify(result.content[0].text, result.details.result.ok ? "info" : "warning");
    },
  });
}
