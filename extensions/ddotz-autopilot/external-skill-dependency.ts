import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { access, mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const INSTALL_TIMEOUT_MS = 2 * 60 * 1000;
const DEFAULT_SKILL_COLLECTION_SUBDIRS = ["", "skills", ".claude/skills", "local/skills"] as const;

type ExternalSkillServices = Pick<ExtensionAPI, "exec">;

export type ExternalSkillDependencyStatus = "external" | "fallback" | "missing";
export type ExternalRepoSkillDependencyStatus = "present" | "installed" | "failed";

export interface ExternalSkillCandidatePath {
  path: string;
  autoDiscovered: boolean;
}

export interface ExternalSkillContribution {
  skillPaths: string[];
}

export interface ExternalSkillResolution {
  status: ExternalSkillDependencyStatus;
  skillPath?: string;
  contributionPath?: string;
  contribution?: ExternalSkillContribution;
  reason?: string;
}

export interface ExternalRepoSkillDependencyResult {
  status: ExternalRepoSkillDependencyStatus;
  repoUrl: string;
  skillPath?: string;
  contributionPath?: string;
  contribution?: ExternalSkillContribution;
  reason?: string;
}

export interface ResolveExternalSkillOptions {
  skillName: string;
  candidatePaths?: ExternalSkillCandidatePath[];
  fallbackPath?: string;
  collectionSubdirs?: readonly string[];
}

export interface EnsureExternalRepoSkillOptions {
  repoUrl: string;
  skillName: string;
  installPath: string;
  candidatePaths?: ExternalSkillCandidatePath[];
  collectionSubdirs?: readonly string[];
  signal?: AbortSignal;
}

function uniqueCandidates(candidates: ExternalSkillCandidatePath[]): ExternalSkillCandidatePath[] {
  const seen = new Set<string>();
  const unique: ExternalSkillCandidatePath[] = [];
  for (const candidate of candidates) {
    if (!candidate.path || seen.has(candidate.path)) continue;
    seen.add(candidate.path);
    unique.push(candidate);
  }
  return unique;
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

async function skillFileName(path: string): Promise<string | undefined> {
  const skillFile = join(path, "SKILL.md");
  try {
    await access(skillFile);
    const content = await readFile(skillFile, "utf8");
    return content.match(/^name:\s*([^\n#]+?)\s*$/m)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

async function resolveSkillPath(path: string, skillName: string, collectionSubdirs: readonly string[]): Promise<{ skillPath: string; contributionPath: string } | undefined> {
  if (await skillFileName(path) === skillName) {
    return { skillPath: path, contributionPath: path };
  }

  for (const subdir of collectionSubdirs) {
    const collection = subdir ? join(path, subdir) : path;
    const skillPath = join(collection, skillName);
    if (await skillFileName(skillPath) === skillName) {
      return { skillPath, contributionPath: collection };
    }
  }

  return undefined;
}

export async function resolveExternalSkillContribution(options: ResolveExternalSkillOptions): Promise<ExternalSkillResolution> {
  const collectionSubdirs = options.collectionSubdirs ?? DEFAULT_SKILL_COLLECTION_SUBDIRS;
  const candidates = uniqueCandidates(options.candidatePaths ?? []);

  for (const candidate of candidates) {
    const resolved = await resolveSkillPath(candidate.path, options.skillName, collectionSubdirs);
    if (!resolved) continue;
    return {
      status: "external",
      skillPath: resolved.skillPath,
      contributionPath: resolved.contributionPath,
      contribution: candidate.autoDiscovered ? undefined : { skillPaths: [resolved.contributionPath] },
    };
  }

  if (options.fallbackPath) {
    const resolved = await resolveSkillPath(options.fallbackPath, options.skillName, collectionSubdirs);
    if (resolved) {
      return {
        status: "fallback",
        skillPath: resolved.skillPath,
        contributionPath: resolved.contributionPath,
        contribution: { skillPaths: [resolved.contributionPath] },
      };
    }
  }

  return { status: "missing", reason: `No ${options.skillName} skill was found.` };
}

export async function ensureExternalRepoSkillDependency(
  services: ExternalSkillServices,
  options: EnsureExternalRepoSkillOptions,
): Promise<ExternalRepoSkillDependencyResult> {
  const candidatePaths = uniqueCandidates([
    { path: options.installPath, autoDiscovered: false },
    ...(options.candidatePaths ?? []),
  ]);
  const present = await resolveExternalSkillContribution({
    skillName: options.skillName,
    candidatePaths,
    collectionSubdirs: options.collectionSubdirs,
  });
  if (present.status === "external") {
    return {
      status: "present",
      repoUrl: options.repoUrl,
      skillPath: present.skillPath,
      contributionPath: present.contributionPath,
      contribution: present.contribution,
    };
  }

  if (await pathExists(options.installPath)) {
    return {
      status: "failed",
      repoUrl: options.repoUrl,
      reason: `Install target already exists but does not contain ${options.skillName}/SKILL.md in a supported skill root.`,
    };
  }

  await mkdir(dirname(options.installPath), { recursive: true });
  const result = await services.exec("git", ["clone", "--depth", "1", options.repoUrl, options.installPath], {
    timeout: INSTALL_TIMEOUT_MS,
    signal: options.signal,
  });
  if (result.code !== 0) {
    const reason = [result.stderr?.trim(), result.stdout?.trim(), `exit ${result.code}`].filter(Boolean).join(" — ");
    return { status: "failed", repoUrl: options.repoUrl, reason };
  }

  const installed = await resolveExternalSkillContribution({
    skillName: options.skillName,
    candidatePaths: [{ path: options.installPath, autoDiscovered: false }],
    collectionSubdirs: options.collectionSubdirs,
  });
  if (installed.status !== "external") {
    return {
      status: "failed",
      repoUrl: options.repoUrl,
      reason: `Cloned repo does not contain ${options.skillName}/SKILL.md in a supported skill root.`,
    };
  }

  return {
    status: "installed",
    repoUrl: options.repoUrl,
    skillPath: installed.skillPath,
    contributionPath: installed.contributionPath,
    contribution: installed.contribution,
  };
}
