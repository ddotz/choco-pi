import { isAbsolute, relative, resolve, sep } from "node:path";

const SAFE_ID_PATTERN = /^[a-zA-Z0-9._-]{1,80}$/;

export function normalizeSafeId(value: string, fieldName = "id"): string {
  const trimmed = value.trim();
  if (!SAFE_ID_PATTERN.test(trimmed)) throw new Error(`${fieldName} must match /^[a-zA-Z0-9._-]{1,80}$/`);
  if (trimmed === "." || trimmed === "..") throw new Error(`${fieldName} must not be . or ..`);
  return trimmed;
}

export function normalizeGroupId(value: string): string {
  return normalizeSafeId(value, "groupId");
}

export function normalizeLaneId(value: string): string {
  return normalizeSafeId(value, "laneId");
}

export function assertSafeBranchName(value: string, fieldName = "branchName"): string {
  const branch = value.trim();
  if (!branch) throw new Error(`${fieldName} is required`);
  if (branch.startsWith("-")) throw new Error(`${fieldName} must not start with '-'`);
  if (
    branch.includes("\0")
    || branch.includes("..")
    || branch.includes("@{")
    || branch.includes("\\")
    || branch.includes("//")
    || /\s/.test(branch)
    || branch.endsWith("/")
    || branch.endsWith(".")
    || branch.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".lock"))
  ) {
    throw new Error(`${fieldName} is not a safe git branch name`);
  }
  return branch;
}

export function pathIsInside(root: string, target: string): boolean {
  const base = resolve(root);
  const absoluteTarget = resolve(target);
  const relativePath = relative(base, absoluteTarget);
  return relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath));
}

export function assertInsideRoot(root: string, target: string, label = "path"): string {
  const absoluteTarget = resolve(target);
  if (!pathIsInside(root, absoluteTarget)) throw new Error(`${label} escapes root: ${absoluteTarget}`);
  return absoluteTarget;
}

export function safeJoinWithin(root: string, ...parts: string[]): string {
  const base = resolve(root);
  const target = resolve(base, ...parts);
  return assertInsideRoot(base, target, "path");
}
