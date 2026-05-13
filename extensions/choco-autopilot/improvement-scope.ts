import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import type { DogfoodMemoryMode, DogfoodScopeKind, DogfoodScopeSignals } from "./dogfood-types";

export type DogfoodProfile = "personal" | "scratch";

export function parseDogfoodMemoryMode(value: string | undefined): DogfoodMemoryMode {
  if (value === "off" || value === "readonly" || value === "manual" || value === "auto") return value;
  return "auto";
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

async function hasGitDir(path: string): Promise<boolean> {
  try {
    await stat(resolve(path, ".git"));
    return true;
  } catch {
    return false;
  }
}

export async function findGitRoot(cwd: string): Promise<string | undefined> {
  let current: string;
  try {
    current = await realpath(resolve(cwd || process.cwd()));
  } catch {
    return undefined;
  }
  while (true) {
    if (await hasGitDir(current)) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function captureAllowedForScope(input: { mode: DogfoodMemoryMode; kind: DogfoodScopeKind }): boolean {
  return input.mode === "auto" && input.kind !== "off" && input.kind !== "global";
}

async function isHomeDirectory(cwd: string): Promise<boolean> {
  try {
    return await realpath(resolve(cwd || process.cwd())) === await realpath(homedir());
  } catch {
    return false;
  }
}

export async function resolveDogfoodScope(input: {
  cwd: string;
  mode?: DogfoodMemoryMode;
  profile?: DogfoodProfile;
}): Promise<DogfoodScopeSignals> {
  const homeScope = await isHomeDirectory(input.cwd);
  const mode = input.mode ?? (homeScope ? "readonly" : parseDogfoodMemoryMode(process.env.CHOCO_PI_IMPROVEMENT_MODE));
  if (mode === "off") return { kind: "off", memoryMode: mode, capture: false, reason: "memory mode is off" };

  if (input.profile === "personal" || input.profile === "scratch") {
    return {
      kind: input.profile,
      memoryMode: mode,
      projectId: input.profile,
      projectLabel: input.profile,
      capture: captureAllowedForScope({ mode, kind: input.profile }),
      reason: input.profile === "personal" ? "explicit personal profile" : "explicit scratch profile",
    };
  }

  if (homeScope) {
    return {
      kind: "global",
      memoryMode: "readonly",
      projectId: "global",
      projectLabel: "global",
      capture: false,
      reason: "home directory uses global readonly memory",
    };
  }

  const gitRoot = await findGitRoot(input.cwd);
  if (!gitRoot) {
    return {
      kind: "off",
      memoryMode: mode,
      capture: false,
      reason: "cwd is outside a git project and no profile was selected",
    };
  }

  return {
    kind: "project",
    memoryMode: mode,
    projectId: shortHash(gitRoot),
    projectRootHash: shortHash(gitRoot),
    projectLabel: basename(gitRoot) || "project",
    capture: captureAllowedForScope({ mode, kind: "project" }),
  };
}
