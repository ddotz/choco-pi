import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { join, delimiter } from "node:path";
import {
  ensureExternalRepoSkillDependency,
  type ExternalRepoSkillDependencyResult,
  type ExternalSkillCandidatePath,
} from "./external-skill-dependency";

export const IM_NOT_AI_REPO_URL = "https://github.com/epoko77-ai/im-not-ai.git" as const;
const HUMANIZE_KOREAN_SKILL = "humanize-korean";

type ImNotAiServices = Pick<ExtensionAPI, "exec">;

export interface ImNotAiDependencyOptions {
  installPath?: string;
  candidatePaths?: ExternalSkillCandidatePath[];
  signal?: AbortSignal;
}

function agentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

export function managedImNotAiInstallPath(): string {
  return process.env.CHOCO_PI_IM_NOT_AI_INSTALL_PATH || join(agentDir(), "choco-pi", "deps", "im-not-ai");
}

function envCandidatePaths(): ExternalSkillCandidatePath[] | undefined {
  const raw = process.env.CHOCO_PI_IM_NOT_AI_CANDIDATE_PATHS;
  if (!raw?.trim()) return undefined;
  return raw.split(delimiter).filter(Boolean).map((path) => ({ path, autoDiscovered: false }));
}

function defaultCandidatePaths(): ExternalSkillCandidatePath[] {
  if (process.env.CHOCO_PI_IM_NOT_AI_DISABLE_GLOBAL === "1") return [];
  const fromEnv = envCandidatePaths();
  if (fromEnv) return fromEnv;
  return [
    { path: join(agentDir(), "skills", HUMANIZE_KOREAN_SKILL), autoDiscovered: true },
    { path: join(homedir(), ".agents", "skills", HUMANIZE_KOREAN_SKILL), autoDiscovered: true },
    { path: join(homedir(), ".codex", "plugins", "cache", "epoko77-ai", "im-not-ai", "local", "skills"), autoDiscovered: false },
    { path: join(homedir(), ".codex", "skills", HUMANIZE_KOREAN_SKILL), autoDiscovered: false },
    { path: join(homedir(), ".claude", "skills", HUMANIZE_KOREAN_SKILL), autoDiscovered: false },
    { path: join(homedir(), ".claude", "plugins", "cache", "epoko77-ai", "im-not-ai"), autoDiscovered: false },
  ];
}

export async function ensureImNotAiDependency(
  services: ImNotAiServices,
  options: ImNotAiDependencyOptions = {},
): Promise<ExternalRepoSkillDependencyResult> {
  const installPath = options.installPath ?? managedImNotAiInstallPath();
  return ensureExternalRepoSkillDependency(services, {
    repoUrl: IM_NOT_AI_REPO_URL,
    skillName: HUMANIZE_KOREAN_SKILL,
    installPath,
    candidatePaths: options.candidatePaths ?? defaultCandidatePaths(),
    signal: options.signal,
  });
}

export function formatImNotAiDependencyNotification(result: ExternalRepoSkillDependencyResult): { message?: string; level: "info" | "warning" | "error" } {
  if (result.status === "installed") {
    return { message: `Installed im-not-ai skill from upstream: ${result.repoUrl}`, level: "info" };
  }
  if (result.status === "failed") {
    return { message: `Failed to install im-not-ai skill from upstream: ${result.reason ?? "unknown error"}`, level: "warning" };
  }
  return { level: "info" };
}

export async function discoverImNotAiSkillPath(
  services: ImNotAiServices,
  ctx: ExtensionContext,
): Promise<{ skillPaths: string[] } | undefined> {
  const result = await ensureImNotAiDependency(services, { signal: ctx.signal });
  const formatted = formatImNotAiDependencyNotification(result);
  if (ctx.hasUI && formatted.message) ctx.ui.notify(formatted.message, formatted.level);
  return result.contribution;
}
