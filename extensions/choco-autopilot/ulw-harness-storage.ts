import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { normalizeSessionId } from "./session-scope";

export type UlwHarnessAction = "start" | "status" | "record" | "tmux-test";

export interface UlwHarnessInput {
  action: UlwHarnessAction;
  objective?: string;
  successCriteria?: string[];
  plan?: string[];
  nextActions?: string[];
  evidence?: string;
  cleanup?: string;
  command?: string;
  label?: string;
  timeoutMs?: number;
}

export interface UlwHarnessResult {
  ok: boolean;
  action: UlwHarnessAction;
  contextPath: string;
  ledgerPath: string;
  evidencePath?: string;
  cleanup?: string;
  reason?: string;
}

export interface UlwHarnessOutcome {
  text: string;
  result: UlwHarnessResult;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeItems(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function safeLabel(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || fallback;
}

function ulwRoot(cwd: string, sessionId: string): string {
  return join(cwd, ".pi", "ulw", normalizeSessionId(sessionId));
}

function contextPath(cwd: string, sessionId: string): string {
  return join(ulwRoot(cwd, sessionId), "context.md");
}

function ledgerPath(cwd: string, sessionId: string): string {
  return join(ulwRoot(cwd, sessionId), "ledger.md");
}

export function evidencePath(cwd: string, sessionId: string, label: string): string {
  return join(ulwRoot(cwd, sessionId), "evidence", `${label}.txt`);
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

export async function appendTextFile(path: string, content: string): Promise<void> {
  let existing = "";
  try {
    existing = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeTextFile(path, `${existing}${content}`);
}

function markdownList(items: string[]): string[] {
  return items.length ? items.map((item) => `- ${item}`) : ["- none"];
}

function renderContext(input: UlwHarnessInput, timestamp: string): string {
  return [
    "# ULW Harness Context",
    "",
    `Objective: ${cleanText(input.objective)}`,
    `Updated: ${timestamp}`,
    "",
    "## Success Criteria",
    ...markdownList(normalizeItems(input.successCriteria)),
    "",
    "## Plan",
    ...markdownList(normalizeItems(input.plan)),
    "",
    "## Next Actions",
    ...markdownList(normalizeItems(input.nextActions)),
    "",
  ].join("\n");
}

export function renderLedgerEntry(title: string, lines: string[]): string {
  return [`## ${title}`, `- at: ${nowIso()}`, ...lines, ""].join("\n");
}

export function baseResult(action: UlwHarnessAction, cwd: string, sessionId: string): Omit<UlwHarnessResult, "ok"> {
  return {
    action,
    contextPath: contextPath(cwd, sessionId),
    ledgerPath: ledgerPath(cwd, sessionId),
  };
}

export async function readStatus(cwd: string, sessionId: string): Promise<UlwHarnessOutcome> {
  const resultBase = baseResult("status", cwd, sessionId);
  try {
    const context = await readFile(resultBase.contextPath, "utf8");
    return { text: context, result: { ...resultBase, ok: true } };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return {
      text: "No ULW harness context for this session.",
      result: { ...resultBase, ok: false, reason: "No ULW harness context for this session." },
    };
  }
}

export async function runStart(input: UlwHarnessInput, cwd: string, sessionId: string): Promise<UlwHarnessOutcome> {
  const objective = cleanText(input.objective);
  const resultBase = baseResult("start", cwd, sessionId);
  if (!objective) {
    return { text: "ulw_harness start blocked: objective is required.", result: { ...resultBase, ok: false, reason: "objective is required" } };
  }
  const context = renderContext({ ...input, objective }, nowIso());
  await writeTextFile(resultBase.contextPath, context);
  await appendTextFile(resultBase.ledgerPath, renderLedgerEntry("start", [`- objective: ${objective}`]));
  return { text: context, result: { ...resultBase, ok: true } };
}

export async function runRecord(input: UlwHarnessInput, cwd: string, sessionId: string): Promise<UlwHarnessOutcome> {
  const evidence = cleanText(input.evidence);
  const cleanup = cleanText(input.cleanup);
  const resultBase = baseResult("record", cwd, sessionId);
  if (!evidence) {
    return { text: "ulw_harness record blocked: evidence is required.", result: { ...resultBase, ok: false, reason: "evidence is required" } };
  }
  const cleanupLine = cleanup ? `- cleanup: ${cleanup}` : "- cleanup: not recorded";
  const entry = renderLedgerEntry("evidence", [`- evidence: ${evidence}`, cleanupLine]);
  await appendTextFile(resultBase.ledgerPath, entry);
  await appendTextFile(resultBase.contextPath, ["", "## Latest Evidence", `- ${evidence}`, cleanupLine, ""].join("\n"));
  return { text: `Recorded ULW evidence: ${evidence}`, result: { ...resultBase, ok: true, cleanup: cleanup || undefined } };
}
