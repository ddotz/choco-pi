import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const CODEX_FAST_MODE_EVENT = "codex-fast-mode:changed";
export const CODEX_FAST_SERVICE_TIER = "priority";
export const DEFAULT_FAST_MODE_ENABLED = true;

export interface MinimalModel {
  id?: string | null;
  name?: string | null;
  provider?: string | null;
  api?: string | null;
}

export interface FastModeState {
  version: 1;
  enabled: boolean;
  updatedAt: string;
}

export interface LoadFastModeStateResult {
  state: FastModeState;
  existed: boolean;
  error?: string;
}

function lower(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function defaultFastModeState(now = new Date()): FastModeState {
  return { version: 1, enabled: DEFAULT_FAST_MODE_ENABLED, updatedAt: now.toISOString() };
}

export function serializeFastModeState(state: FastModeState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

export function parseFastModeState(content: string, now = new Date()): LoadFastModeStateResult {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isRecord(parsed)) throw new Error("fast-mode state must be an object");
    if (parsed.version !== 1) throw new Error("fast-mode state version must be 1");
    if (typeof parsed.enabled !== "boolean") throw new Error("fast-mode state enabled must be a boolean");
    if (typeof parsed.updatedAt !== "string") throw new Error("fast-mode state updatedAt must be a string");
    return {
      existed: true,
      state: { version: 1, enabled: parsed.enabled, updatedAt: parsed.updatedAt },
    };
  } catch (error) {
    return { existed: true, state: defaultFastModeState(now), error: errorMessage(error) };
  }
}

export async function loadFastModeState(path: string, now = new Date()): Promise<LoadFastModeStateResult> {
  try {
    return parseFastModeState(await readFile(path, "utf8"), now);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { existed: false, state: defaultFastModeState(now) };
    return { existed: false, state: defaultFastModeState(now), error: errorMessage(error) };
  }
}

export async function saveFastModeState(path: string, enabled: boolean, now = new Date()): Promise<FastModeState> {
  const state: FastModeState = { version: 1, enabled, updatedAt: now.toISOString() };
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, serializeFastModeState(state), "utf8");
  await rename(tmpPath, path);
  return state;
}

export function isCodexModel(model?: MinimalModel | null): boolean {
  return lower(model?.provider) === "openai-codex" || lower(model?.api) === "openai-codex-responses";
}

export function applyFastModeToPayload(payload: unknown, model: MinimalModel | undefined | null, enabled: boolean): unknown | undefined {
  if (!isCodexModel(model)) return undefined;
  if (!isRecord(payload)) return undefined;

  if (enabled) return { ...payload, service_tier: CODEX_FAST_SERVICE_TIER };

  if (payload.service_tier === "fast") {
    const { service_tier: _unsupportedServiceTier, ...rest } = payload;
    return rest;
  }

  return undefined;
}
