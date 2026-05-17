import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  classifyRateLimitError,
  createRunStateSnapshot,
  createRateLimitCacheEnvelope,
  createUnavailableRateLimitSnapshot,
  detectProviderKind,
  formatModelLabel,
  formatPath,
  formatRateLimits,
  formatWorkModeLabel,
  isFreshRateLimitCacheEnvelope,
  isRateLimitLockStale,
  parseClaudeHudCacheJson,
  parseClaudeStatuslineCache,
  parseRateLimitCacheEnvelope,
  parseRateLimitLockEnvelope,
  reduceRunState,
  selectCodexRateLimit,
  summarizeTodosJson,
  type CodexRateLimitResponse,
  type MinimalModel,
  type ProviderKind,
  type RateLimitCacheEnvelope,
  type RateLimitSnapshot,
  type RunStateSnapshot,
  type RunStateTransition,
} from "./core.ts";
import { CODEX_FAST_MODE_EVENT, parseFastModeState } from "../codex-fast-mode/core.ts";
import { normalizeSessionId } from "../session-identity.ts";

const CODEX_RATE_LIMIT_TTL_MS = 5 * 60 * 1000;
const CODEX_RATE_LIMIT_TIMEOUT_MS = 8000;
const CODEX_RETRY_FLOOR_MS = 5000;
const CODEX_RATE_LIMIT_UNAVAILABLE_TTL_MS = CODEX_RETRY_FLOOR_MS;
const CODEX_RATE_LIMIT_LOCK_STALE_MS = 30 * 1000;
const GIT_BRANCH_FALLBACK_TTL_MS = 1000;
const GIT_BRANCH_FALLBACK_TIMEOUT_MS = 250;
const CHOCO_AGENT_DIR = join(homedir(), ".pi", "agent", "choco-pi");
const CODEX_FAST_MODE_STATE_PATH = join(homedir(), ".pi", "agent", "codex-fast-mode.json");
const CODEX_RATE_LIMIT_CACHE_PATH = join(CHOCO_AGENT_DIR, "codex-rate-limits.json");
const CODEX_RATE_LIMIT_LOCK_PATH = join(CHOCO_AGENT_DIR, "codex-rate-limits.lock");
const CHOCO_STATE_PATH = join(CHOCO_AGENT_DIR, "state.json");

export interface FooterProjectMetadata {
  branch: string | null;
  version: string | undefined;
}

function cleanShellVersionValue(value: string): string | undefined {
  const defaultMatch = /\$\{VERSION:-([^}]+)\}/.exec(value);
  const raw = defaultMatch?.[1] ?? value;
  const cleaned = raw.trim().replace(/^['"]|['"]$/g, "").trim();
  return cleaned || undefined;
}

export function parseAppMetadataVersion(content: string): string | undefined {
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?VERSION\s*=\s*(.+?)\s*(?:#.*)?$/.exec(line);
    if (!match) continue;
    return cleanShellVersionValue(match[1]);
  }
  return undefined;
}

function readAppMetadataVersion(current: string): string | undefined {
  const metadataPath = join(current, "script", "app_metadata.sh");
  try {
    return existsSync(metadataPath) ? parseAppMetadataVersion(readFileSync(metadataPath, "utf8")) : undefined;
  } catch {
    return undefined;
  }
}

export function readProjectPackageVersion(cwd: string): string | undefined {
  let current = resolve(cwd);

  while (true) {
    const packageJsonPath = join(current, "package.json");
    try {
      if (existsSync(packageJsonPath)) {
        const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: unknown };
        return typeof parsed.version === "string" ? parsed.version : undefined;
      }
    } catch {
      return undefined;
    }

    const appMetadataVersion = readAppMetadataVersion(current);
    if (appMetadataVersion) return appMetadataVersion;

    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function readChocoModeLabel(sessionId?: string): string {
  try {
    if (!existsSync(CHOCO_STATE_PATH)) return "default";
    const parsed = JSON.parse(readFileSync(CHOCO_STATE_PATH, "utf8")) as {
      runtime?: { workMode?: unknown; executionIntensity?: unknown };
      sessions?: Record<string, { effectiveWorkMode?: unknown; executionIntensity?: unknown; automaticMode?: unknown }>;
    };
    const session = sessionId ? parsed.sessions?.[normalizeSessionId(sessionId)] : undefined;
    return formatWorkModeLabel({
      persistentMode: typeof parsed.runtime?.workMode === "string" ? parsed.runtime.workMode : "default",
      effectiveMode: typeof session?.effectiveWorkMode === "string" ? session.effectiveWorkMode : undefined,
      executionIntensity: typeof session?.executionIntensity === "string"
        ? session.executionIntensity
        : typeof parsed.runtime?.executionIntensity === "string"
          ? parsed.runtime.executionIntensity
          : undefined,
      automaticMode: typeof session?.automaticMode === "boolean" ? session.automaticMode : false,
    });
  } catch {
    return "default";
  }
}

function readCodexFastModeEnabled(): boolean {
  try {
    if (!existsSync(CODEX_FAST_MODE_STATE_PATH)) return true;
    return parseFastModeState(readFileSync(CODEX_FAST_MODE_STATE_PATH, "utf8")).state.enabled;
  } catch {
    return true;
  }
}

function readGitCommand(cwd: string, args: string[]): string | null {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: GIT_BRANCH_FALLBACK_TIMEOUT_MS,
  });
  if (result.status !== 0) return null;
  const output = typeof result.stdout === "string" ? result.stdout.trim() : "";
  return output || null;
}

function readGitBranchCommand(cwd: string, args: string[]): string | null {
  const branch = readGitCommand(cwd, args);
  return branch && branch !== "HEAD" ? branch : null;
}

export function readGitBranchFallback(cwd: string): string | null {
  return readGitBranchCommand(cwd, ["symbolic-ref", "--short", "HEAD"]) ?? readGitBranchCommand(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
}

export function readGitRootFallback(path: string): string | null {
  let current = resolve(path);
  while (true) {
    const root = readGitCommand(current, ["rev-parse", "--show-toplevel"]);
    if (root) return root;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function unquoteShellToken(value: string): string {
  const trimmed = value.trim();
  return trimmed.replace(/^['"]|['"]$/g, "");
}

function resolveCandidatePath(cwd: string, path: string): string | undefined {
  const normalized = unquoteShellToken(path);
  if (!normalized || normalized.startsWith("-") || /[$`*?[\]{}]/.test(normalized)) return undefined;
  if (normalized === "~") return homedir();
  if (normalized.startsWith("~/")) return resolve(homedir(), normalized.slice(2));
  return resolve(cwd, normalized);
}

function pushResolvedPath(candidates: string[], cwd: string, path: unknown): void {
  if (typeof path !== "string") return;
  const resolved = resolveCandidatePath(cwd, path);
  if (resolved) candidates.push(resolved);
}

function pushBashPathCandidates(candidates: string[], cwd: string, command: string): void {
  const token = "((?:\\\"[^\\\"]+\\\")|(?:'[^']+')|(?:[^\\s;&|]+))";
  const patterns = [new RegExp(`(?:^|[;&|]\\s*)git\\s+-C\\s+${token}`, "g"), new RegExp(`(?:^|[;&|]\\s*)cd\\s+${token}`, "g")];
  for (const pattern of patterns) {
    for (const match of command.matchAll(pattern)) pushResolvedPath(candidates, cwd, match[1]);
  }
}

export function resolveToolCallPathCandidates(sessionCwd: string, toolName: string, input: unknown): string[] {
  const candidates: string[] = [];
  if (!isRecord(input)) return candidates;

  if (toolName === "bash" && typeof input.command === "string") pushBashPathCandidates(candidates, sessionCwd, input.command);
  pushResolvedPath(candidates, sessionCwd, input.path);
  return candidates;
}

export class ActiveWorktreeCwdTracker {
  private readonly activeBySessionId = new Map<string, string>();

  constructor(private readonly resolveGitRoot: (path: string) => string | null = readGitRootFallback) {}

  get(sessionId: string, sessionCwd: string): string {
    return this.activeBySessionId.get(normalizeSessionId(sessionId)) ?? sessionCwd;
  }

  clear(sessionId: string): void {
    this.activeBySessionId.delete(normalizeSessionId(sessionId));
  }

  updateFromToolCall(sessionId: string, sessionCwd: string, toolName: string, input: unknown): string | null {
    for (const candidate of resolveToolCallPathCandidates(sessionCwd, toolName, input)) {
      const root = this.resolveGitRoot(candidate);
      if (!root) continue;
      this.activeBySessionId.set(normalizeSessionId(sessionId), root);
      return root;
    }
    return null;
  }
}

export function readFooterProjectMetadata(cwd: string): FooterProjectMetadata {
  return {
    branch: readGitBranchFallback(cwd),
    version: readProjectPackageVersion(cwd),
  };
}

class GitBranchFallbackCache {
  private cached = new Map<string, { branch: string | null; updatedAt: number }>();

  get(cwd: string): string | null {
    const now = Date.now();
    const hit = this.cached.get(cwd);
    if (hit && now - hit.updatedAt < GIT_BRANCH_FALLBACK_TTL_MS) return hit.branch;

    const branch = readGitBranchFallback(cwd);
    this.cached.set(cwd, { branch, updatedAt: now });
    return branch;
  }
}

interface SessionStats {
  totalCost: number;
  toolCount: number;
}

interface FooterRenderData {
  modelLabel: string;
  providerKind: ProviderKind;
  branch: string | null;
  cwd: string;
  thinkingLevel: string;
  rateLimitText: string;
  rateLimitSnapshot: RateLimitSnapshot | undefined;
  contextText: string;
  contextPercent: number | null;
  costText: string;
  toolCount: number;
  todoLabel: string;
  todoError?: string;
  appVersion: string | undefined;
  modeLabel: string;
  runStateLabel: string;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function codexCandidates(): string[] {
  return uniqueStrings([process.env.CODEX_CLI, join(homedir(), ".npm-global", "bin", "codex"), "codex"]);
}

function safeKill(child: ReturnType<typeof spawn>): void {
  try {
    child.kill("SIGTERM");
  } catch {
    // Child may already be gone.
  }
}

function requestCodexRateLimitsWithBinary(binary: string): Promise<CodexRateLimitResponse> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ["app-server", "--listen", "stdio://"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    let settled = false;
    let stdoutBuffer = "";
    let stderrBuffer = "";

    const finish = (error: Error | undefined, result?: CodexRateLimitResponse): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      safeKill(child);
      if (error) reject(error);
      else resolve(result ?? {});
    };

    const send = (id: number, method: string, params: unknown): void => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    };

    const timer = setTimeout(() => {
      finish(new Error("Codex rate-limit probe timed out"));
    }, CODEX_RATE_LIMIT_TIMEOUT_MS);

    child.on("error", (error) => finish(error));
    child.on("exit", (code, signal) => {
      if (!settled) {
        const stderr = stderrBuffer.trim();
        finish(new Error(`Codex app-server exited before rate-limit response (${code ?? signal ?? "unknown"})${stderr ? `: ${stderr}` : ""}`));
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderrBuffer = `${stderrBuffer}${chunk}`.slice(-2000);
    });

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
      let newlineIndex = stdoutBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        newlineIndex = stdoutBuffer.indexOf("\n");
        if (!line) continue;

        let message: { id?: unknown; result?: unknown; error?: unknown };
        try {
          message = JSON.parse(line) as { id?: unknown; result?: unknown; error?: unknown };
        } catch {
          continue;
        }

        if (message.id === 1) {
          if (message.error) {
            finish(new Error(`Codex initialize failed: ${JSON.stringify(message.error)}`));
          } else {
            send(2, "account/rateLimits/read", undefined);
          }
        } else if (message.id === 2) {
          if (message.error) finish(new Error(`Codex rateLimits/read failed: ${JSON.stringify(message.error)}`));
          else finish(undefined, message.result as CodexRateLimitResponse);
        }
      }
    });

    send(1, "initialize", {
      clientInfo: { name: "pi-choco-footer", title: "Pi choco footer", version: "0.1.0" },
      capabilities: { experimentalApi: true, optOutNotificationMethods: [] },
    });
  });
}

async function requestCodexRateLimits(): Promise<CodexRateLimitResponse> {
  let lastError: Error | undefined;
  for (const binary of codexCandidates()) {
    try {
      return await requestCodexRateLimitsWithBinary(binary);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!/ENOENT/.test(lastError.message) && binary !== "codex") break;
    }
  }
  throw lastError ?? new Error("Codex CLI not found");
}

function readGlobalCodexRateLimitCache(modelKey: string, now = Date.now()): RateLimitCacheEnvelope | undefined {
  try {
    if (!existsSync(CODEX_RATE_LIMIT_CACHE_PATH)) return undefined;
    const envelope = parseRateLimitCacheEnvelope(readFileSync(CODEX_RATE_LIMIT_CACHE_PATH, "utf8"));
    return isFreshRateLimitCacheEnvelope(envelope, modelKey, now, CODEX_RATE_LIMIT_TTL_MS, CODEX_RATE_LIMIT_UNAVAILABLE_TTL_MS) ? envelope : undefined;
  } catch {
    return undefined;
  }
}

function writeGlobalCodexRateLimitCache(modelKey: string, snapshot: RateLimitSnapshot, error?: string): void {
  try {
    mkdirSync(CHOCO_AGENT_DIR, { recursive: true });
    const envelope = createRateLimitCacheEnvelope(modelKey, snapshot, Date.now(), error);
    writeFileSync(CODEX_RATE_LIMIT_CACHE_PATH, `${JSON.stringify(envelope)}\n`, { encoding: "utf8", mode: 0o600 });
  } catch {
    // Cache writes are best-effort; never break footer rendering.
  }
}

function readCodexRateLimitLockCreatedAt(): number | undefined {
  try {
    if (!existsSync(CODEX_RATE_LIMIT_LOCK_PATH)) return undefined;
    return parseRateLimitLockEnvelope(readFileSync(CODEX_RATE_LIMIT_LOCK_PATH, "utf8"))?.createdAt;
  } catch {
    return undefined;
  }
}

function acquireCodexRateLimitLock(now = Date.now()): (() => void) | undefined {
  try {
    mkdirSync(CHOCO_AGENT_DIR, { recursive: true });
  } catch {
    return undefined;
  }

  const tryCreate = (): (() => void) | undefined => {
    try {
      const fd = openSync(CODEX_RATE_LIMIT_LOCK_PATH, "wx", 0o600);
      try {
        writeFileSync(fd, `${JSON.stringify({ version: 1, pid: process.pid, createdAt: now })}\n`, "utf8");
      } finally {
        closeSync(fd);
      }
      return () => {
        try {
          rmSync(CODEX_RATE_LIMIT_LOCK_PATH, { force: true });
        } catch {
          // Best effort cleanup.
        }
      };
    } catch {
      return undefined;
    }
  };

  const release = tryCreate();
  if (release) return release;

  if (isRateLimitLockStale(readCodexRateLimitLockCreatedAt(), Date.now(), CODEX_RATE_LIMIT_LOCK_STALE_MS)) {
    try {
      rmSync(CODEX_RATE_LIMIT_LOCK_PATH, { force: true });
    } catch {
      return undefined;
    }
    return tryCreate();
  }

  return undefined;
}

class CodexRateLimitCache {
  private cached:
    | {
        modelKey: string;
        snapshot: RateLimitSnapshot | undefined;
        updatedAt: number;
        error?: string;
      }
    | undefined;

  private inFlightKey: string | undefined;
  private lastAttemptAt = 0;

  get(model: MinimalModel | undefined, onUpdate: () => void): RateLimitSnapshot | undefined {
    const modelKey = model?.id || model?.name || "codex";
    const now = Date.now();
    const hasFreshValue = this.cached?.modelKey === modelKey && now - this.cached.updatedAt < CODEX_RATE_LIMIT_TTL_MS;

    if (!hasFreshValue) {
      const persisted = readGlobalCodexRateLimitCache(modelKey, now);
      if (persisted) {
        this.cached = {
          modelKey,
          snapshot: persisted.snapshot,
          updatedAt: persisted.updatedAt,
          error: persisted.error,
        };
        return persisted.snapshot;
      }
    }

    if (!hasFreshValue && this.inFlightKey !== modelKey && now - this.lastAttemptAt >= CODEX_RETRY_FLOOR_MS) {
      void this.refresh(modelKey, onUpdate);
    }

    return this.cached?.modelKey === modelKey ? this.cached.snapshot : undefined;
  }

  private async refresh(modelKey: string, onUpdate: () => void): Promise<void> {
    this.inFlightKey = modelKey;
    this.lastAttemptAt = Date.now();
    const releaseLock = acquireCodexRateLimitLock();
    if (!releaseLock) {
      const persisted = readGlobalCodexRateLimitCache(modelKey);
      this.cached = persisted
        ? { modelKey, snapshot: persisted.snapshot, updatedAt: persisted.updatedAt, error: persisted.error }
        : { modelKey, snapshot: this.cached?.modelKey === modelKey && this.cached.snapshot ? this.cached.snapshot : createUnavailableRateLimitSnapshot("unavailable"), updatedAt: Date.now(), error: "Codex rate-limit refresh lock is held" };
      if (this.inFlightKey === modelKey) this.inFlightKey = undefined;
      onUpdate();
      return;
    }

    try {
      const response = await requestCodexRateLimits();
      const snapshot = selectCodexRateLimit(response, modelKey) ?? createUnavailableRateLimitSnapshot("unavailable");
      this.cached = {
        modelKey,
        snapshot,
        updatedAt: Date.now(),
      };
      writeGlobalCodexRateLimitCache(modelKey, snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const reason = classifyRateLimitError(message);
      const snapshot = reason === "auth"
        ? createUnavailableRateLimitSnapshot(reason)
        : this.cached?.modelKey === modelKey && this.cached.snapshot
          ? this.cached.snapshot
          : createUnavailableRateLimitSnapshot(reason);
      this.cached = {
        modelKey,
        snapshot,
        updatedAt: Date.now(),
        error: message,
      };
      writeGlobalCodexRateLimitCache(modelKey, snapshot, message);
    } finally {
      releaseLock();
      if (this.inFlightKey === modelKey) this.inFlightKey = undefined;
      onUpdate();
    }
  }
}

function readClaudeRateLimits(): RateLimitSnapshot | undefined {
  const home = homedir();
  const statuslineCache = join(home, ".claude", ".statusline-usage-cache");
  const hudCache = join(home, ".claude", "hud", ".usage-cache.json");

  try {
    if (existsSync(statuslineCache)) {
      const parsed = parseClaudeStatuslineCache(readFileSync(statuslineCache, "utf8"));
      if (parsed) return parsed;
    }
  } catch {
    // Fall through to HUD JSON cache.
  }

  try {
    if (existsSync(hudCache)) return parseClaudeHudCacheJson(readFileSync(hudCache, "utf8"));
  } catch {
    return undefined;
  }

  return undefined;
}

function readTodoLabel(cwd: string, sessionId: string): { label: string; error?: string } {
  const todoPath = join(cwd, ".pi", "sessions", normalizeSessionId(sessionId), "todos.json");
  try {
    if (!existsSync(todoPath)) return { label: "0/0" };
    const summary = summarizeTodosJson(readFileSync(todoPath, "utf8"));
    return { label: summary.label, error: summary.error };
  } catch (error) {
    return { label: "err", error: error instanceof Error ? error.message : String(error) };
  }
}

function collectSessionStats(ctx: ExtensionContext): SessionStats {
  let totalCost = 0;
  let toolCount = 0;

  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message") continue;
    if (entry.message.role === "assistant") {
      const assistant = entry.message as AssistantMessage;
      totalCost += assistant.usage?.cost?.total ?? 0;
    } else if (entry.message.role === "toolResult") {
      toolCount += 1;
    }
  }

  return { totalCost, toolCount };
}

function formatCost(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return "$0.00";
  if (cost < 0.01) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function contextStats(ctx: ExtensionContext): { text: string; percent: number | null } {
  const usage = ctx.getContextUsage();
  if (!usage || usage.percent === null) return { text: "?", percent: null };
  return { text: `${usage.percent.toFixed(1)}%`, percent: usage.percent };
}

function colorByProvider(theme: Theme, kind: ProviderKind, text: string): string {
  switch (kind) {
    case "codex":
      return theme.fg("success", text);
    case "anthropic":
      return theme.fg("warning", text);
    case "gemini":
      return theme.fg("mdLink", text);
    case "other":
      return theme.fg("accent", text);
  }
}

function cyan(theme: Theme, text: string): string {
  return theme.fg("mdLink", text);
}

function colorRateValue(theme: Theme, value: string): string {
  return /^\d+(?:\.\d+)?%$/.test(value) ? cyan(theme, value) : theme.fg("warning", value);
}

function colorRate(theme: Theme, _snapshot: RateLimitSnapshot | undefined, text: string): string {
  return text.replace(/(5h:)([^\s]+)(\s+wk:)([^\s]+)/, (_match, fiveLabel: string, fiveValue: string, weekLabel: string, weekValue: string) =>
    `${theme.fg("muted", fiveLabel)}${colorRateValue(theme, fiveValue)}${theme.fg("muted", weekLabel)}${colorRateValue(theme, weekValue)}`,
  );
}

function colorContext(theme: Theme, _percent: number | null, text: string): string {
  return theme.fg("muted", "ctx ") + cyan(theme, text);
}

function colorRunState(theme: Theme, runStateLabel: string): string {
  switch (runStateLabel) {
    case "Ready":
      return theme.fg("success", runStateLabel);
    case "Working":
      return theme.fg("warning", runStateLabel);
    case "Thinking":
      return theme.fg("accent", runStateLabel);
    case "Starting":
      return theme.fg("mdLink", runStateLabel);
    default:
      return theme.fg("muted", runStateLabel);
  }
}

function renderStyledFooterLines(data: FooterRenderData, theme: Theme, width: number): string[] {
  const separator = theme.fg("dim", " | ");
  const model = colorByProvider(theme, data.providerKind, theme.bold(data.modelLabel));
  const version = data.appVersion ? ` v${data.appVersion}` : "";
  const branch = theme.fg("muted", data.branch ? `⎇ ${data.branch}${version}` : `⎇ -${version}`);
  const cwd = theme.fg("muted", data.cwd);
  const thinking = theme.fg("accent", `◉ ${data.thinkingLevel}`);
  const runState = colorRunState(theme, data.runStateLabel);

  const line1 = model + separator + branch + separator + cwd + separator + thinking + separator + runState;

  const rate = colorRate(theme, data.rateLimitSnapshot, data.rateLimitText);
  const context = colorContext(theme, data.contextPercent, data.contextText);
  const cost = theme.fg("muted", data.costText);
  const tools = theme.fg("muted", `tools:${data.toolCount}`);
  const todo = data.todoError ? theme.fg("warning", `todo ${data.todoLabel}`) : theme.fg("muted", `todo ${data.todoLabel}`);
  const line2 = theme.fg("dim", `  ${data.modeLabel}`) + separator + rate + separator + context + separator + cost + separator + tools + separator + todo;

  return [truncateToWidth(line1, width), truncateToWidth(line2, width)];
}

function collectFooterData(
  ctx: ExtensionContext,
  footerCwd: string,
  projectMetadata: FooterProjectMetadata,
  thinkingLevel: string,
  codexCache: CodexRateLimitCache,
  requestRender: () => void,
  runState: RunStateSnapshot,
): FooterRenderData {
  const model = ctx.model as MinimalModel | undefined;
  const providerKind = detectProviderKind(model);
  const todo = readTodoLabel(footerCwd, ctx.sessionManager.getSessionId());
  const sessionStats = collectSessionStats(ctx);
  const context = contextStats(ctx);

  let rateLimitSnapshot: RateLimitSnapshot | undefined;
  if (providerKind === "codex") {
    rateLimitSnapshot = codexCache.get(model, requestRender);
  } else if (providerKind === "anthropic") {
    rateLimitSnapshot = readClaudeRateLimits();
  }

  return {
    modelLabel: formatModelLabel(model),
    providerKind,
    branch: projectMetadata.branch,
    cwd: formatPath(footerCwd),
    thinkingLevel,
    rateLimitText: formatRateLimits(rateLimitSnapshot),
    rateLimitSnapshot,
    contextText: context.text,
    contextPercent: context.percent,
    costText: formatCost(sessionStats.totalCost),
    toolCount: sessionStats.toolCount,
    todoLabel: todo.label,
    todoError: todo.error,
    appVersion: projectMetadata.version,
    modeLabel: readChocoModeLabel(ctx.sessionManager.getSessionId()),
    runStateLabel: runState.label,
  };
}

export default function chocoFooterExtension(pi: ExtensionAPI) {
  const codexCache = new CodexRateLimitCache();
  const gitBranchFallbackCache = new GitBranchFallbackCache();
  const activeWorktreeCwdTracker = new ActiveWorktreeCwdTracker();
  const renderCallbacks = new Set<() => void>();
  let codexFastModeEnabled = readCodexFastModeEnabled();
  let fastModeUnsubscribed = false;
  let runState = createRunStateSnapshot();

  const requestRenderAll = (): void => {
    for (const callback of renderCallbacks) callback();
  };

  const setRunState = (transition: RunStateTransition): void => {
    runState = reduceRunState(runState, transition);
    requestRenderAll();
  };

  const unsubscribeFastMode = pi.events.on(CODEX_FAST_MODE_EVENT, (data) => {
    if (data && typeof data === "object" && typeof (data as { enabled?: unknown }).enabled === "boolean") {
      codexFastModeEnabled = (data as { enabled: boolean }).enabled;
    } else {
      codexFastModeEnabled = readCodexFastModeEnabled();
    }
    requestRenderAll();
  });

  const installFooter = (ctx: ExtensionContext): void => {
    if (!ctx.hasUI) return;

    ctx.ui.setFooter((tui, theme) => {
      const requestRender = () => tui.requestRender();
      renderCallbacks.add(requestRender);

      return {
        dispose() {
          renderCallbacks.delete(requestRender);
        },
        invalidate() {},
        render(width: number): string[] {
          const baseThinkingLevel = pi.getThinkingLevel();
          const model = ctx.model as MinimalModel | undefined;
          const thinkingLabel = codexFastModeEnabled && detectProviderKind(model) === "codex" ? `${baseThinkingLevel} fast` : baseThinkingLevel;
          const sessionCwd = ctx.sessionManager.getCwd() || ctx.cwd;
          const footerCwd = activeWorktreeCwdTracker.get(ctx.sessionManager.getSessionId(), sessionCwd);
          const projectMetadata = {
            branch: gitBranchFallbackCache.get(footerCwd),
            version: readProjectPackageVersion(footerCwd),
          };
          const data = collectFooterData(ctx, footerCwd, projectMetadata, thinkingLabel, codexCache, requestRenderAll, runState);
          return renderStyledFooterLines(data, theme, width);
        },
      };
    });
  };

  pi.on("session_start", (_event, ctx) => {
    setRunState("session_start");
    installFooter(ctx);
    queueMicrotask(() => setRunState("session_ready"));
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (!fastModeUnsubscribed) {
      unsubscribeFastMode();
      fastModeUnsubscribed = true;
    }
    activeWorktreeCwdTracker.clear(ctx.sessionManager.getSessionId());
    setRunState("session_shutdown");
    if (ctx.hasUI) ctx.ui.setFooter(undefined);
  });

  pi.on("tool_call", (event, ctx) => {
    const sessionCwd = ctx.sessionManager.getCwd() || ctx.cwd;
    if (activeWorktreeCwdTracker.updateFromToolCall(ctx.sessionManager.getSessionId(), sessionCwd, event.toolName, event.input)) requestRenderAll();
  });

  pi.on("model_select", () => requestRenderAll());
  pi.on("thinking_level_select", () => requestRenderAll());
  pi.on("before_agent_start", () => setRunState("before_agent_start"));
  pi.on("agent_start", () => setRunState("agent_start"));
  pi.on("turn_start", () => setRunState("turn_start"));
  pi.on("tool_execution_start", () => setRunState("tool_execution_start"));
  pi.on("tool_execution_end", () => setRunState("tool_execution_end"));
  pi.on("agent_end", () => setRunState("agent_end"));
  pi.on("turn_end", () => requestRenderAll());
}
