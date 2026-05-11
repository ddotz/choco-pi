import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_AUTO_UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPDATE_TIMEOUT_MS = 2 * 60 * 1000;
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
const VERIFY_TIMEOUT_MS = 2 * 60 * 1000;

export type DdotzUpdateStatus = "updated" | "current" | "skipped" | "failed";

export interface DdotzUpdateResult {
  status: DdotzUpdateStatus;
  trigger: "manual" | "auto";
  reason?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  oldRevision?: string;
  newRevision?: string;
  changedFiles: string[];
  dependencyInstall: "ran" | "skipped";
  verification: "ran" | "skipped";
}

export interface AutoUpdateLastResult {
  status: DdotzUpdateStatus;
  reason?: string;
  oldRevision?: string;
  newRevision?: string;
  upstream?: string;
  checkedAt: string;
}

export interface AutoUpdateState {
  enabled: boolean;
  intervalMs: number;
  lastCheckedAt?: string;
  lastResult?: AutoUpdateLastResult;
}

type ExecResult = Awaited<ReturnType<ExtensionAPI["exec"]>>;
type AutoUpdateServices = Pick<ExtensionAPI, "exec">;

interface RunUpdateOptions {
  packageRoot?: string;
  trigger: "manual" | "auto";
  signal?: AbortSignal;
}

interface ExecOk {
  ok: true;
  result: ExecResult;
}

interface ExecFail {
  ok: false;
  reason: string;
}

export function ddotzPiPackageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export function createAutoUpdateState(): AutoUpdateState {
  return {
    enabled: true,
    intervalMs: DEFAULT_AUTO_UPDATE_INTERVAL_MS,
  };
}

export function normalizeAutoUpdateState(value: unknown): AutoUpdateState {
  const defaults = createAutoUpdateState();
  if (!value || typeof value !== "object") return defaults;
  const input = value as Partial<AutoUpdateState>;
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : defaults.enabled,
    intervalMs: typeof input.intervalMs === "number" && input.intervalMs > 0 ? input.intervalMs : defaults.intervalMs,
    lastCheckedAt: typeof input.lastCheckedAt === "string" ? input.lastCheckedAt : undefined,
    lastResult: normalizeLastResult(input.lastResult),
  };
}

function normalizeLastResult(value: unknown): AutoUpdateLastResult | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Partial<AutoUpdateLastResult>;
  if (!isUpdateStatus(input.status) || typeof input.checkedAt !== "string") return undefined;
  return {
    status: input.status,
    reason: typeof input.reason === "string" ? input.reason : undefined,
    oldRevision: typeof input.oldRevision === "string" ? input.oldRevision : undefined,
    newRevision: typeof input.newRevision === "string" ? input.newRevision : undefined,
    upstream: typeof input.upstream === "string" ? input.upstream : undefined,
    checkedAt: input.checkedAt,
  };
}

function isUpdateStatus(value: unknown): value is DdotzUpdateStatus {
  return value === "updated" || value === "current" || value === "skipped" || value === "failed";
}

export function shouldRunAutoUpdate(state: AutoUpdateState, now = Date.now()): boolean {
  if (!state.enabled) return false;
  if (!state.lastCheckedAt) return true;
  const checkedAt = Date.parse(state.lastCheckedAt);
  if (!Number.isFinite(checkedAt)) return true;
  return now - checkedAt >= state.intervalMs;
}

export function summarizeAutoUpdateResult(result: DdotzUpdateResult, checkedAt: string): AutoUpdateLastResult {
  return {
    status: result.status,
    reason: result.reason,
    oldRevision: result.oldRevision,
    newRevision: result.newRevision,
    upstream: result.upstream,
    checkedAt,
  };
}

export function formatAutoUpdateStatus(state: AutoUpdateState, version: string): string {
  const enabled = state.enabled ? "on" : "off";
  const intervalHours = Math.round(state.intervalMs / (60 * 60 * 1000));
  const last = state.lastResult
    ? `${state.lastResult.status}${state.lastResult.oldRevision && state.lastResult.newRevision ? ` ${state.lastResult.oldRevision}->${state.lastResult.newRevision}` : ""} at ${state.lastResult.checkedAt}`
    : "never";
  return [`ddotz-pi ${version}`, `auto-update: ${enabled} every ${intervalHours}h`, `last check: ${last}`].join("\n");
}

function isLocalChangesSkip(result: DdotzUpdateResult): boolean {
  return result.status === "skipped" && result.reason === "local changes are present";
}

export function formatManualUpdateResult(result: DdotzUpdateResult): { message: string; level: "info" | "warning" | "error" } {
  if (result.status === "updated") {
    return {
      message: `ddotz-pi updated: ${result.oldRevision ?? "unknown"} -> ${result.newRevision ?? "unknown"}. Reloading runtime.`,
      level: "info",
    };
  }
  if (result.status === "current") return { message: `ddotz-pi is already up to date${result.upstream ? ` with ${result.upstream}` : ""}.`, level: "info" };
  if (isLocalChangesSkip(result)) return { message: "ddotz-pi update skipped: local changes are present; leaving checkout unchanged.", level: "info" };
  if (result.status === "skipped") return { message: `Skipped ddotz-pi update: ${result.reason ?? "not safe to update"}.`, level: "warning" };
  return { message: `Failed ddotz-pi update: ${result.reason ?? "unknown error"}.`, level: "error" };
}

export function formatAutoUpdateResult(result: DdotzUpdateResult): { message?: string; level: "info" | "warning" | "error" } {
  if (result.status === "updated") {
    return {
      message: `Auto-updated ddotz-pi: ${result.oldRevision ?? "unknown"} -> ${result.newRevision ?? "unknown"}. Reloading runtime.`,
      level: "info",
    };
  }
  if (isLocalChangesSkip(result)) return { message: "ddotz-pi auto-update skipped: local changes are present; leaving checkout unchanged.", level: "info" };
  if (result.status === "skipped" && result.reason) return { message: `Skipped ddotz-pi auto-update: ${result.reason}.`, level: "warning" };
  if (result.status === "failed") return { message: `Failed ddotz-pi auto-update: ${result.reason ?? "unknown error"}.`, level: "error" };
  return { level: "info" };
}

async function execChecked(
  services: AutoUpdateServices,
  command: string,
  args: string[],
  packageRoot: string,
  signal: AbortSignal | undefined,
  timeout = UPDATE_TIMEOUT_MS,
): Promise<ExecOk | ExecFail> {
  try {
    const result = await services.exec(command, args, { cwd: packageRoot, timeout, signal });
    if (!result || typeof result.code !== "number") return { ok: false, reason: `${command} ${args.join(" ")} returned no exec result` };
    if (result.code === 0) return { ok: true, result };
    const reason = [result.stderr?.trim(), result.stdout?.trim(), `exit ${result.code}`].filter(Boolean).join(" — ");
    return { ok: false, reason };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function skipped(trigger: "manual" | "auto", reason: string, extra: Partial<DdotzUpdateResult> = {}): DdotzUpdateResult {
  return {
    status: "skipped",
    trigger,
    reason,
    changedFiles: [],
    dependencyInstall: "skipped",
    verification: "skipped",
    ...extra,
  };
}

function failed(trigger: "manual" | "auto", reason: string, extra: Partial<DdotzUpdateResult> = {}): DdotzUpdateResult {
  return {
    status: "failed",
    trigger,
    reason,
    changedFiles: [],
    dependencyInstall: "skipped",
    verification: "skipped",
    ...extra,
  };
}

function changedFilesRequireInstall(files: string[]): boolean {
  return files.some((file) => file === "package.json" || file === "pnpm-lock.yaml");
}

function parseAheadBehind(output: string): { ahead: number; behind: number } | undefined {
  const [aheadRaw, behindRaw] = output.trim().split(/\s+/);
  const ahead = Number.parseInt(aheadRaw ?? "", 10);
  const behind = Number.parseInt(behindRaw ?? "", 10);
  if (!Number.isFinite(ahead) || !Number.isFinite(behind)) return undefined;
  return { ahead, behind };
}

export async function runDdotzPiUpdate(services: AutoUpdateServices, options: RunUpdateOptions): Promise<DdotzUpdateResult> {
  const packageRoot = options.packageRoot ?? ddotzPiPackageRoot();
  const trigger = options.trigger;
  const signal = options.signal;

  const status = await execChecked(services, "git", ["status", "--porcelain"], packageRoot, signal);
  if (!status.ok) return skipped(trigger, `git status failed: ${status.reason}`);
  if (status.result.stdout.trim()) return skipped(trigger, "local changes are present");

  const upstreamResult = await execChecked(services, "git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], packageRoot, signal);
  if (!upstreamResult.ok) return skipped(trigger, `no upstream branch is configured: ${upstreamResult.reason}`);
  const upstream = upstreamResult.result.stdout.trim();

  const oldRevisionResult = await execChecked(services, "git", ["rev-parse", "--short", "HEAD"], packageRoot, signal);
  const oldRevision = oldRevisionResult.ok ? oldRevisionResult.result.stdout.trim() : undefined;

  const fetchResult = await execChecked(services, "git", ["fetch", "--prune", "--quiet"], packageRoot, signal);
  if (!fetchResult.ok) return failed(trigger, `git fetch failed: ${fetchResult.reason}`, { upstream, oldRevision });

  const countsResult = await execChecked(services, "git", ["rev-list", "--left-right", "--count", "HEAD...@{u}"], packageRoot, signal);
  if (!countsResult.ok) return failed(trigger, `git rev-list failed: ${countsResult.reason}`, { upstream, oldRevision });
  const counts = parseAheadBehind(countsResult.result.stdout);
  if (!counts) return failed(trigger, `could not parse ahead/behind counts: ${countsResult.result.stdout.trim()}`, { upstream, oldRevision });

  if (counts.behind === 0 && counts.ahead === 0) {
    return {
      status: "current",
      trigger,
      upstream,
      ahead: counts.ahead,
      behind: counts.behind,
      oldRevision,
      newRevision: oldRevision,
      changedFiles: [],
      dependencyInstall: "skipped",
      verification: "skipped",
    };
  }

  if (counts.ahead > 0) {
    return skipped(trigger, counts.behind > 0 ? "local branch has diverged from upstream" : "local branch is ahead of upstream", {
      upstream,
      ahead: counts.ahead,
      behind: counts.behind,
      oldRevision,
    });
  }

  const diffResult = await execChecked(services, "git", ["diff", "--name-only", "HEAD..@{u}"], packageRoot, signal);
  if (!diffResult.ok) return failed(trigger, `git diff failed: ${diffResult.reason}`, { upstream, ahead: counts.ahead, behind: counts.behind, oldRevision });
  const changedFiles = diffResult.result.stdout.split(/\r?\n/).map((file) => file.trim()).filter(Boolean);

  const pullResult = await execChecked(services, "git", ["pull", "--ff-only"], packageRoot, signal);
  if (!pullResult.ok) return failed(trigger, `git pull --ff-only failed: ${pullResult.reason}`, { upstream, ahead: counts.ahead, behind: counts.behind, oldRevision, changedFiles });

  let dependencyInstall: DdotzUpdateResult["dependencyInstall"] = "skipped";
  if (changedFilesRequireInstall(changedFiles)) {
    const installResult = await execChecked(services, "pnpm", ["install", "--frozen-lockfile"], packageRoot, signal, INSTALL_TIMEOUT_MS);
    if (!installResult.ok) return failed(trigger, `pnpm install failed: ${installResult.reason}`, { upstream, ahead: counts.ahead, behind: counts.behind, oldRevision, changedFiles, dependencyInstall: "ran" });
    dependencyInstall = "ran";
  }

  const verifyResult = await execChecked(services, "pnpm", ["run", "version:check"], packageRoot, signal, VERIFY_TIMEOUT_MS);
  if (!verifyResult.ok) return failed(trigger, `version check failed: ${verifyResult.reason}`, { upstream, ahead: counts.ahead, behind: counts.behind, oldRevision, changedFiles, dependencyInstall, verification: "ran" });

  const newRevisionResult = await execChecked(services, "git", ["rev-parse", "--short", "HEAD"], packageRoot, signal);
  const newRevision = newRevisionResult.ok ? newRevisionResult.result.stdout.trim() : undefined;

  return {
    status: "updated",
    trigger,
    upstream,
    ahead: counts.ahead,
    behind: counts.behind,
    oldRevision,
    newRevision,
    changedFiles,
    dependencyInstall,
    verification: "ran",
  };
}
