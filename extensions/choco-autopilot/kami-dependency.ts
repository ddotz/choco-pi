import { homedir } from "node:os";
import { dirname, join, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveExternalSkillContribution, type ExternalSkillCandidatePath } from "./external-skill-dependency";

export type KamiDependencyStatus = "external" | "bundled" | "missing";

export type KamiCandidatePath = ExternalSkillCandidatePath;

export interface KamiSkillContributionResult {
  status: KamiDependencyStatus;
  skillPath?: string;
  contribution?: { skillPaths: string[] };
  reason?: string;
}

export interface KamiSkillContributionOptions {
  bundledSkillPath?: string;
  candidatePaths?: KamiCandidatePath[];
}

function agentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

function packageRoot(): string {
  return dirname(dirname(dirname(fileURLToPath(import.meta.url))));
}

export function bundledKamiSkillPath(): string {
  return join(packageRoot(), "skills", "kami");
}

function envCandidatePaths(): KamiCandidatePath[] | undefined {
  const raw = process.env.CHOCO_PI_KAMI_CANDIDATE_PATHS;
  if (!raw?.trim()) return undefined;
  return raw.split(delimiter).filter(Boolean).map((path) => ({ path, autoDiscovered: false }));
}

function defaultCandidatePaths(): KamiCandidatePath[] {
  if (process.env.CHOCO_PI_KAMI_DISABLE_GLOBAL === "1") return [];
  const fromEnv = envCandidatePaths();
  if (fromEnv) return fromEnv;
  return [
    { path: join(agentDir(), "skills", "kami"), autoDiscovered: true },
    { path: join(homedir(), ".agents", "skills", "kami"), autoDiscovered: true },
    { path: join(homedir(), ".codex", "skills", "kami"), autoDiscovered: false },
    { path: join(homedir(), ".claude", "skills", "kami"), autoDiscovered: false },
  ];
}

export async function resolveKamiSkillContribution(
  options: KamiSkillContributionOptions = {},
): Promise<KamiSkillContributionResult> {
  const result = await resolveExternalSkillContribution({
    skillName: "kami",
    candidatePaths: options.candidatePaths ?? defaultCandidatePaths(),
    fallbackPath: options.bundledSkillPath ?? bundledKamiSkillPath(),
  });

  if (result.status === "external") {
    return { status: "external", skillPath: result.skillPath, contribution: result.contribution };
  }
  if (result.status === "fallback") {
    return { status: "bundled", skillPath: result.skillPath, contribution: result.contribution };
  }
  return { status: "missing", reason: "No external or bundled kami skill was found." };
}

export async function discoverKamiSkillPath(): Promise<{ skillPaths: string[] } | undefined> {
  const result = await resolveKamiSkillContribution();
  return result.contribution;
}
