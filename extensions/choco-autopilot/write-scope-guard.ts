import { isAbsolute, relative, resolve, sep } from "node:path";
import { updateAgentLaneStatus } from "./agent-run-manifest";
import { execGit } from "./git-runtime";

export interface ActiveLaneContext {
  groupId: string;
  laneId: string;
  repoRoot: string;
  ownedFiles: string[];
  ownedDomains: string[];
  executionStrategy: "worktree" | "spawn-agent" | "serial";
  readOnly: boolean;
}

export interface WriteScopeDecision {
  allowed: boolean;
  reason: string;
  path?: string;
}

export interface BashScopeDecision {
  allowed: boolean;
  violations: string[];
  reason?: string;
}

function normalizePath(path: string): string {
  return path.replace(/^@/, "").replace(/\\+/g, "/").replace(/^\.\/+/, "").replace(/\/+/g, "/").replace(/\/$/, "");
}

function relativeToRepo(context: ActiveLaneContext, path: string): string | undefined {
  const repoRoot = resolve(context.repoRoot);
  const absolute = path.startsWith("/") ? resolve(path) : resolve(repoRoot, path);
  const relativePath = relative(repoRoot, absolute);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) return undefined;
  return normalizePath(relativePath || ".");
}

function globToRegExp(glob: string): RegExp {
  let output = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];
    if (char === "*" && next === "*") {
      output += ".*";
      index += 1;
    } else if (char === "*") {
      output += "[^/]*";
    } else if (char === "?") {
      output += "[^/]";
    } else if ("\\^$+?.()|[]{}".includes(char)) {
      output += `\\${char}`;
    } else {
      output += char;
    }
  }
  return new RegExp(`${output}$`);
}

function scopeMatches(scope: string, relativePath: string): boolean {
  const normalizedScope = normalizePath(scope);
  if (normalizedScope === "." || normalizedScope === relativePath) return true;
  if (/[*?[\]{}]/.test(normalizedScope)) return globToRegExp(normalizedScope).test(relativePath);
  return relativePath.startsWith(`${normalizedScope}/`);
}

export function guardWritePath(context: ActiveLaneContext | undefined, path: string): WriteScopeDecision {
  if (!context) return { allowed: true, reason: "no active lane" };
  const relativePath = relativeToRepo(context, path);
  if (!relativePath) return { allowed: false, reason: `outside repository root for ${context.laneId}: ${path}` };
  if (context.readOnly) return { allowed: false, reason: `read-only lane ${context.laneId} cannot write files`, path: relativePath };
  if (context.ownedFiles.some((scope) => scopeMatches(scope, relativePath))) return { allowed: true, reason: "within active lane write scope", path: relativePath };
  return { allowed: false, reason: `outside active lane write scope for ${context.laneId}: ${relativePath}`, path: relativePath };
}

function objectInput(input: unknown): Record<string, unknown> | undefined {
  return input && typeof input === "object" ? input as Record<string, unknown> : undefined;
}

export function guardToolCallWriteScope(
  context: ActiveLaneContext | undefined,
  toolName: string,
  input: unknown,
): WriteScopeDecision {
  if (!context) return { allowed: true, reason: "no active lane" };
  if (toolName !== "write" && toolName !== "edit") return { allowed: true, reason: "not a write/edit tool" };
  const path = objectInput(input)?.path;
  if (typeof path !== "string" || !path.trim()) return { allowed: false, reason: "write/edit tool call is missing path" };
  return guardWritePath(context, path);
}

export function detectBashScopeViolations(
  context: ActiveLaneContext | undefined,
  beforeChangedFiles: string[],
  afterChangedFiles: string[],
): BashScopeDecision {
  if (!context) return { allowed: true, violations: [] };
  const beforePaths = beforeChangedFiles.map(normalizePath);
  const outsideBefore = beforePaths.filter((file) => !guardWritePath(context, file).allowed);
  if (outsideBefore.length > 0) {
    return {
      allowed: false,
      violations: outsideBefore,
      reason: `outside-scope dirty files exist before bash; cannot safely attribute bash changes: ${outsideBefore.join(", ")}`,
    };
  }
  const before = new Set(beforePaths);
  const newlyChanged = afterChangedFiles.map(normalizePath).filter((file) => !before.has(file));
  const violations = newlyChanged.filter((file) => !guardWritePath(context, file).allowed);
  return violations.length === 0
    ? { allowed: true, violations: [] }
    : { allowed: false, violations, reason: `bash modified files outside active lane write scope: ${violations.join(", ")}` };
}

export async function recordWriteScopeViolation(context: ActiveLaneContext, reason: string): Promise<void> {
  await updateAgentLaneStatus(context.repoRoot, context.groupId, context.laneId, "blocked", { lastError: reason });
}

export async function snapshotGitChangedFiles(repoRoot: string): Promise<string[]> {
  const result = await execGit(repoRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (result.code !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .map((path) => path.includes(" -> ") ? path.split(" -> ").at(-1)! : path);
}

export function activeLaneContextFromEnv(): ActiveLaneContext | undefined {
  const raw = process.env.CHOCO_PI_ACTIVE_LANE_CONTEXT;
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as ActiveLaneContext;
    if (!parsed.groupId || !parsed.laneId || !parsed.repoRoot) return undefined;
    return {
      ...parsed,
      ownedFiles: Array.isArray(parsed.ownedFiles) ? parsed.ownedFiles : [],
      ownedDomains: Array.isArray(parsed.ownedDomains) ? parsed.ownedDomains : [],
      readOnly: Boolean(parsed.readOnly),
    };
  } catch {
    return undefined;
  }
}
