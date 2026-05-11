import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { access, mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const SUPERPOWERS_REPO_URL = "https://github.com/obra/superpowers.git" as const;
const SUPERPOWERS_SENTINEL_SKILL = join("using-superpowers", "SKILL.md");
const INSTALL_TIMEOUT_MS = 2 * 60 * 1000;

type SuperpowersServices = Pick<ExtensionAPI, "exec">;

export type SuperpowersDependencyStatus = "present" | "installed" | "failed";

export interface SuperpowersDependencyResult {
  status: SuperpowersDependencyStatus;
  skillPath?: string;
  repoUrl: typeof SUPERPOWERS_REPO_URL;
  reason?: string;
}

export interface SuperpowersDependencyOptions {
  installPath?: string;
  candidatePaths?: string[];
  signal?: AbortSignal;
}

function agentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

export function managedSuperpowersInstallPath(): string {
  return process.env.DDOTZ_PI_SUPERPOWERS_INSTALL_PATH || join(agentDir(), "ddotz-pi", "deps", "superpowers");
}

function defaultCandidatePaths(installPath: string): string[] {
  if (process.env.DDOTZ_PI_SUPERPOWERS_DISABLE_GLOBAL === "1") return [installPath];
  return [
    installPath,
    join(agentDir(), "skills", "superpowers"),
    join(homedir(), ".agents", "skills", "superpowers"),
  ];
}

async function hasSuperpowersSentinel(path: string): Promise<boolean> {
  try {
    await access(join(path, SUPERPOWERS_SENTINEL_SKILL));
    return true;
  } catch {
    return false;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.filter(Boolean))];
}

export async function ensureSuperpowersDependency(
  services: SuperpowersServices,
  options: SuperpowersDependencyOptions = {},
): Promise<SuperpowersDependencyResult> {
  const installPath = options.installPath ?? managedSuperpowersInstallPath();
  const candidatePaths = uniquePaths(options.candidatePaths ?? defaultCandidatePaths(installPath));

  for (const path of candidatePaths) {
    if (await hasSuperpowersSentinel(path)) return { status: "present", skillPath: path, repoUrl: SUPERPOWERS_REPO_URL };
  }

  if (await pathExists(installPath)) {
    return {
      status: "failed",
      skillPath: installPath,
      repoUrl: SUPERPOWERS_REPO_URL,
      reason: `Install target already exists but does not contain ${SUPERPOWERS_SENTINEL_SKILL}.`,
    };
  }

  await mkdir(dirname(installPath), { recursive: true });
  const result = await services.exec("git", ["clone", "--depth", "1", SUPERPOWERS_REPO_URL, installPath], {
    timeout: INSTALL_TIMEOUT_MS,
    signal: options.signal,
  });
  if (result.code !== 0) {
    const reason = [result.stderr?.trim(), result.stdout?.trim(), `exit ${result.code}`].filter(Boolean).join(" — ");
    return { status: "failed", skillPath: installPath, repoUrl: SUPERPOWERS_REPO_URL, reason };
  }

  if (!(await hasSuperpowersSentinel(installPath))) {
    return {
      status: "failed",
      skillPath: installPath,
      repoUrl: SUPERPOWERS_REPO_URL,
      reason: `Cloned repo does not contain ${SUPERPOWERS_SENTINEL_SKILL}.`,
    };
  }

  return { status: "installed", skillPath: installPath, repoUrl: SUPERPOWERS_REPO_URL };
}

export function formatSuperpowersDependencyNotification(result: SuperpowersDependencyResult): { message?: string; level: "info" | "warning" | "error" } {
  if (result.status === "installed") {
    return { message: `Installed superpowers skills from upstream: ${result.repoUrl}`, level: "info" };
  }
  if (result.status === "failed") {
    return { message: `Failed to install superpowers skills from upstream: ${result.reason ?? "unknown error"}`, level: "warning" };
  }
  return { level: "info" };
}

function shouldContributeSkillPath(result: SuperpowersDependencyResult): boolean {
  if (!result.skillPath) return false;
  if (result.status === "installed") return true;
  return result.skillPath === managedSuperpowersInstallPath();
}

export async function discoverSuperpowersSkillPath(
  services: SuperpowersServices,
  ctx: ExtensionContext,
): Promise<{ skillPaths: string[] } | undefined> {
  const result = await ensureSuperpowersDependency(services, { signal: ctx.signal });
  const formatted = formatSuperpowersDependencyNotification(result);
  if (ctx.hasUI && formatted.message) ctx.ui.notify(formatted.message, formatted.level);
  return shouldContributeSkillPath(result) && result.skillPath ? { skillPaths: [result.skillPath] } : undefined;
}
