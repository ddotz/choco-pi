export type ProviderKind = "codex" | "anthropic" | "gemini" | "other";

export interface MinimalModel {
  id?: string | null;
  name?: string | null;
  provider?: string | null;
  api?: string | null;
}

export interface RateLimitWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
}

export type RateLimitUnavailableReason = "auth" | "unavailable";

export interface RateLimitSnapshot {
  limitId?: string | null;
  limitName?: string | null;
  primary?: RateLimitWindow | null;
  secondary?: RateLimitWindow | null;
  credits?: unknown;
  planType?: string | null;
  rateLimitReachedType?: string | null;
  unavailableReason?: RateLimitUnavailableReason;
}

export interface CodexRateLimitResponse {
  rateLimits?: RateLimitSnapshot | null;
  rateLimitsByLimitId?: Record<string, RateLimitSnapshot | undefined> | null;
}

export interface RateLimitCacheEnvelope {
  version: 1;
  modelKey: string;
  snapshot: RateLimitSnapshot;
  updatedAt: number;
  error?: string;
}

export interface RateLimitLockEnvelope {
  version: 1;
  pid: number;
  createdAt: number;
}

export interface TodoSummary {
  done: number;
  total: number;
  label: string;
  error?: string;
}

export type RunStateLabel = "Starting" | "Ready" | "Thinking" | "Working";

export type RunStateTransition =
  | "session_start"
  | "session_ready"
  | "before_agent_start"
  | "agent_start"
  | "turn_start"
  | "tool_execution_start"
  | "tool_execution_end"
  | "agent_end"
  | "turn_aborted"
  | "session_shutdown";

export interface RunStateSnapshot {
  label: RunStateLabel;
  activeTools: number;
}

export function createRunStateSnapshot(label: RunStateLabel = "Starting"): RunStateSnapshot {
  return { label, activeTools: 0 };
}

export function reduceRunState(snapshot: RunStateSnapshot, transition: RunStateTransition): RunStateSnapshot {
  switch (transition) {
    case "session_start":
    case "before_agent_start":
      return { label: "Starting", activeTools: 0 };
    case "session_ready":
    case "agent_end":
    case "turn_aborted":
    case "session_shutdown":
      return { label: "Ready", activeTools: 0 };
    case "agent_start":
    case "turn_start":
      return { label: "Thinking", activeTools: 0 };
    case "tool_execution_start":
      return { label: "Working", activeTools: snapshot.activeTools + 1 };
    case "tool_execution_end": {
      const activeTools = Math.max(0, snapshot.activeTools - 1);
      return { label: activeTools > 0 ? "Working" : "Thinking", activeTools };
    }
  }
}

export interface WorkModeLabelInput {
  persistentMode?: string | null;
  effectiveMode?: string | null;
  executionIntensity?: string | null;
  automaticMode?: boolean | null;
}

export interface FooterLineInput {
  modelLabel: string;
  branch?: string | null;
  cwd: string;
  thinkingLevel: string;
  appVersion?: string;
  modeLabel?: string;
  rateLimitText: string;
  contextText: string;
  costText: string;
  toolCount: number;
  todoLabel: string;
  runStateLabel: RunStateLabel;
}

function lower(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseIsoSeconds(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function makeWindow(usedPercent: number | undefined, windowDurationMins: number, resetsAt: number | null = null): RateLimitWindow | null {
  if (usedPercent === undefined) return null;
  return { usedPercent, windowDurationMins, resetsAt };
}

export function detectProviderKind(model?: MinimalModel | null): ProviderKind {
  const haystack = [model?.provider, model?.api, model?.id, model?.name].map(lower).join(" ");
  if (/openai-codex|codex/.test(haystack)) return "codex";
  if (/anthropic|claude/.test(haystack)) return "anthropic";
  if (/google|gemini/.test(haystack)) return "gemini";
  return "other";
}

export function formatModelLabel(model?: MinimalModel | null): string {
  const base = model?.name?.trim() || model?.id?.trim() || "no model";
  const kind = detectProviderKind(model);
  if (kind === "codex" && !/codex/i.test(base)) return `${base} Codex`;
  if (kind === "anthropic" && /^claude/i.test(base)) return base;
  if (kind === "gemini" && /^gemini/i.test(base)) return base;
  return base;
}

function cleanLabel(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function formatWorkModeLabel(input: WorkModeLabelInput): string {
  const persistent = cleanLabel(input.persistentMode) ?? "default";
  const effective = cleanLabel(input.effectiveMode);
  const intensity = cleanLabel(input.executionIntensity);
  const mode = effective && effective !== persistent ? `${persistent}->${effective}` : persistent;
  const intensitySuffix = intensity ? `/${intensity}` : "";
  const automaticSuffix = input.automaticMode ? " auto" : "";
  return `${mode}${intensitySuffix}${automaticSuffix}`;
}

export function formatPath(cwd: string, home = process.env.HOME || process.env.USERPROFILE || ""): string {
  if (!home) return cwd;
  if (cwd === home) return "~";
  if (cwd.startsWith(`${home}/`)) return `~${cwd.slice(home.length)}`;
  return cwd;
}

export function parseClaudeStatuslineCache(content: string): RateLimitSnapshot | undefined {
  const values = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index <= 0) continue;
    values.set(line.slice(0, index).trim(), line.slice(index + 1).trim());
  }

  const fiveHour = finiteNumber(values.get("UTILIZATION"));
  const weekly = finiteNumber(values.get("WEEKLY_UTILIZATION"));
  if (fiveHour === undefined && weekly === undefined) return undefined;

  return {
    limitId: "claude",
    limitName: values.get("PROFILE_NAME") || "Claude",
    primary: makeWindow(fiveHour, 300, parseIsoSeconds(values.get("RESETS_AT"))),
    secondary: makeWindow(weekly, 10080, parseIsoSeconds(values.get("WEEKLY_RESETS_AT"))),
  };
}

export function parseClaudeHudCacheJson(content: string): RateLimitSnapshot | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }

  const object = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  const data = object?.data && typeof object.data === "object" ? (object.data as Record<string, unknown>) : undefined;
  const lastGoodData = object?.lastGoodData && typeof object.lastGoodData === "object" ? (object.lastGoodData as Record<string, unknown>) : undefined;
  const source = data ?? lastGoodData;
  if (!source) return undefined;

  const fiveHour = finiteNumber(source.fiveHour);
  const weekly = finiteNumber(source.weekly);
  if (fiveHour === undefined && weekly === undefined) return undefined;

  return {
    limitId: "claude",
    limitName: "Claude",
    primary: makeWindow(fiveHour, 300, parseIsoSeconds(source.fiveHourResetsAt)),
    secondary: makeWindow(weekly, 10080, parseIsoSeconds(source.weeklyResetsAt)),
  };
}

export function selectCodexRateLimit(response: CodexRateLimitResponse | undefined | null, modelId = ""): RateLimitSnapshot | undefined {
  if (!response) return undefined;
  const buckets = response.rateLimitsByLimitId ?? undefined;
  const normalizedModel = modelId.toLowerCase();

  if (buckets) {
    if (/(spark|bengalfox)/.test(normalizedModel) && buckets.codex_bengalfox) return buckets.codex_bengalfox;

    for (const [key, bucket] of Object.entries(buckets)) {
      if (!bucket) continue;
      const searchable = `${key} ${bucket.limitId ?? ""} ${bucket.limitName ?? ""}`.toLowerCase();
      if (normalizedModel && searchable.includes(normalizedModel)) return bucket;
    }

    if (buckets.codex) return buckets.codex;

    const firstCodexBucket = Object.entries(buckets).find(([key, bucket]) => key.startsWith("codex") && bucket)?.[1];
    if (firstCodexBucket) return firstCodexBucket;
  }

  return response.rateLimits ?? undefined;
}

function windowFor(snapshot: RateLimitSnapshot | undefined | null, minutes: number): RateLimitWindow | undefined {
  if (!snapshot) return undefined;
  if (snapshot.primary?.windowDurationMins === minutes) return snapshot.primary;
  if (snapshot.secondary?.windowDurationMins === minutes) return snapshot.secondary;
  if (minutes === 300 && snapshot.primary) return snapshot.primary;
  if (minutes === 10080 && snapshot.secondary) return snapshot.secondary;
  return undefined;
}

export function classifyRateLimitError(message: string): RateLimitUnavailableReason {
  return /401|unauthorized|token_expired|refresh_token/i.test(message) ? "auth" : "unavailable";
}

export function createUnavailableRateLimitSnapshot(reason: RateLimitUnavailableReason, limitId = "codex"): RateLimitSnapshot {
  return { limitId, limitName: limitId, unavailableReason: reason };
}

function formatPercent(value: number | undefined): string | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const rounded = Math.abs(value - Math.round(value)) < 0.05 ? Math.round(value).toString() : value.toFixed(1);
  return `${rounded.replace(/\.0$/, "")}%`;
}

function formatLimitValue(value: number | undefined, reason: RateLimitUnavailableReason | undefined): string {
  const percent = formatPercent(value);
  if (percent) return percent;
  if (reason === "auth") return "login";
  if (reason === "unavailable") return "n/a";
  return "--";
}

export function formatRateLimits(snapshot?: RateLimitSnapshot | null): string {
  const fiveHour = windowFor(snapshot, 300);
  const weekly = windowFor(snapshot, 10080);
  return `5h:${formatLimitValue(fiveHour?.usedPercent, snapshot?.unavailableReason)} wk:${formatLimitValue(weekly?.usedPercent, snapshot?.unavailableReason)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseRateLimitWindow(value: unknown): RateLimitWindow | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const usedPercent = finiteNumber(value.usedPercent);
  if (usedPercent === undefined) return undefined;
  const windowDurationMins = value.windowDurationMins === null ? null : finiteNumber(value.windowDurationMins);
  const resetsAt = value.resetsAt === null || value.resetsAt === undefined ? null : finiteNumber(value.resetsAt);
  return {
    usedPercent,
    windowDurationMins: windowDurationMins ?? null,
    resetsAt: resetsAt ?? null,
  };
}

function parseUnavailableReason(value: unknown): RateLimitUnavailableReason | undefined {
  return value === "auth" || value === "unavailable" ? value : undefined;
}

function parseRateLimitSnapshot(value: unknown): RateLimitSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  const primary = value.primary === undefined ? undefined : parseRateLimitWindow(value.primary);
  const secondary = value.secondary === undefined ? undefined : parseRateLimitWindow(value.secondary);
  if (primary === undefined && value.primary !== undefined) return undefined;
  if (secondary === undefined && value.secondary !== undefined) return undefined;
  const unavailableReason = parseUnavailableReason(value.unavailableReason);
  if (!primary && !secondary && !unavailableReason) return undefined;
  return {
    limitId: typeof value.limitId === "string" ? value.limitId : undefined,
    limitName: typeof value.limitName === "string" ? value.limitName : undefined,
    primary,
    secondary,
    unavailableReason,
  };
}

export function createRateLimitCacheEnvelope(modelKey: string, snapshot: RateLimitSnapshot, updatedAt: number, error?: string): RateLimitCacheEnvelope {
  return {
    version: 1,
    modelKey,
    snapshot,
    updatedAt,
    ...(error ? { error } : {}),
  };
}

export function parseRateLimitCacheEnvelope(content: string): RateLimitCacheEnvelope | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || parsed.version !== 1 || typeof parsed.modelKey !== "string") return undefined;
  const updatedAt = finiteNumber(parsed.updatedAt);
  const snapshot = parseRateLimitSnapshot(parsed.snapshot);
  if (updatedAt === undefined || !snapshot) return undefined;
  return createRateLimitCacheEnvelope(parsed.modelKey, snapshot, updatedAt, typeof parsed.error === "string" ? parsed.error : undefined);
}

export function isFreshRateLimitCacheEnvelope(envelope: RateLimitCacheEnvelope | undefined, modelKey: string, now: number, ttlMs: number, unavailableTtlMs = ttlMs): boolean {
  if (!envelope || envelope.modelKey !== modelKey || now < envelope.updatedAt) return false;
  const effectiveTtl = envelope.snapshot.unavailableReason ? unavailableTtlMs : ttlMs;
  return now - envelope.updatedAt <= effectiveTtl;
}

export function isRateLimitLockStale(createdAt: number | undefined, now: number, staleMs: number): boolean {
  return createdAt === undefined || now - createdAt > staleMs;
}

export function parseRateLimitLockEnvelope(content: string): RateLimitLockEnvelope | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || parsed.version !== 1) return undefined;
  const pid = finiteNumber(parsed.pid);
  const createdAt = finiteNumber(parsed.createdAt);
  if (pid === undefined || createdAt === undefined) return undefined;
  return { version: 1, pid, createdAt };
}

export function summarizeTodosJson(content: string): TodoSummary {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    const todos = (parsed as { todos?: unknown }).todos;
    if (!Array.isArray(todos)) throw new Error("todos is not an array");
    const total = todos.length;
    const done = todos.filter((todo) => todo && typeof todo === "object" && (todo as { status?: unknown }).status === "done").length;
    return { done, total, label: `${done}/${total}` };
  } catch (error) {
    return { done: 0, total: 0, label: "err", error: error instanceof Error ? error.message : String(error) };
  }
}

export function resolveFooterBranch(runtimeBranch: string | null | undefined, ...fallbackBranches: Array<string | null | undefined>): string | null {
  const primary = runtimeBranch?.trim();
  if (primary && primary !== "-") return primary;
  for (const candidate of fallbackBranches) {
    const fallback = candidate?.trim();
    if (fallback && fallback !== "-") return fallback;
  }
  return null;
}

export function buildFooterLines(input: FooterLineInput): [string, string] {
  const branch = input.branch ? `⎇ ${input.branch}` : "⎇ -";
  const version = input.appVersion ? ` v${input.appVersion}` : "";
  const mode = input.modeLabel ?? "-";
  const line1 = `${input.modelLabel} | ${branch}${version} | ${input.cwd} | ◉ ${input.thinkingLevel} | ${input.runStateLabel}`;
  const line2 = `  ${mode} | ${input.rateLimitText} | ctx ${input.contextText} | ${input.costText} | tools:${input.toolCount} | todo ${input.todoLabel}`;
  return [line1, line2];
}
