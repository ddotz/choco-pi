import { exec } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadAgentRunManifest, updateAgentRunManifest, type AgentRunManifest } from "./agent-run-manifest";
import { execGit, statusSummary } from "./git-runtime";

const execAsync = promisify(exec);

export interface IntegrationVerifierParams {
  groupId: string;
  repoRoot?: string;
  baseRef?: string;
  strategy?: "merge" | "cherry-pick" | "diff-apply";
  verificationCommands?: string[];
  dryRun?: boolean;
}

export interface IntegrationVerifierResult {
  ok: boolean;
  status: "blocked" | "failed" | "passed" | "dry-run";
  groupId: string;
  integrationBranch?: string;
  integrationWorktreePath?: string;
  blockers: string[];
  conflicts: string[];
  verificationResults: Array<{
    command: string;
    status: "passed" | "failed" | "blocked";
    evidence?: string;
  }>;
  commands: string[];
}

const IntegrationVerifierParamsSchema = Type.Object({
  groupId: Type.String(),
  repoRoot: Type.Optional(Type.String()),
  baseRef: Type.Optional(Type.String()),
  strategy: Type.Optional(Type.Union([Type.Literal("merge"), Type.Literal("cherry-pick"), Type.Literal("diff-apply")])),
  verificationCommands: Type.Optional(Type.Array(Type.String())),
  dryRun: Type.Optional(Type.Boolean()),
});

function baseResult(params: IntegrationVerifierParams, manifest: AgentRunManifest): IntegrationVerifierResult {
  const integrationBranch = `integration/${params.groupId}`;
  return {
    ok: false,
    status: "blocked",
    groupId: params.groupId,
    integrationBranch,
    integrationWorktreePath: join(manifest.repoRoot, ".pi", "integration", params.groupId),
    blockers: [],
    conflicts: [],
    verificationResults: [],
    commands: [],
  };
}

async function addPreflightBlockers(result: IntegrationVerifierResult, manifest: AgentRunManifest): Promise<void> {
  for (const lane of manifest.lanes) {
    if (lane.status !== "verified" && lane.status !== "ready-to-integrate" && lane.status !== "integrated") {
      result.blockers.push(`unverified lane: ${lane.id} [${lane.status}]`);
    }
    if (lane.worktreePath && (await statusSummary(lane.worktreePath)).dirty) {
      result.blockers.push(`dirty lane worktree: ${lane.id} ${lane.worktreePath}`);
    }
  }
}

async function runVerificationCommand(command: string, cwd: string): Promise<IntegrationVerifierResult["verificationResults"][number]> {
  try {
    const output = await execAsync(command, { cwd, shell: "/bin/bash", timeout: 120_000 });
    return { command, status: "passed", evidence: `${output.stdout}${output.stderr}`.trim().slice(0, 1000) };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number; message?: string };
    return { command, status: "failed", evidence: `${err.stdout ?? ""}${err.stderr ?? ""}${err.message ?? ""}`.trim().slice(0, 1000) || `exit ${err.code ?? "unknown"}` };
  }
}

async function createIntegrationWorktree(params: IntegrationVerifierParams, manifest: AgentRunManifest, result: IntegrationVerifierResult): Promise<boolean> {
  const baseRef = params.baseRef || manifest.baseRef || "HEAD";
  const path = result.integrationWorktreePath!;
  await rm(path, { recursive: true, force: true });
  await mkdir(join(path, ".."), { recursive: true });
  const args = ["worktree", "add", "-B", result.integrationBranch!, path, baseRef];
  result.commands.push(["git", ...args].join(" "));
  const created = await execGit(manifest.repoRoot, args);
  if (created.code !== 0) {
    result.blockers.push(`integration worktree create failed: ${created.stderr.trim() || created.stdout.trim() || created.code}`);
    return false;
  }
  return true;
}

async function applyLaneBranches(manifest: AgentRunManifest, result: IntegrationVerifierResult): Promise<boolean> {
  for (const lane of manifest.lanes) {
    if (!lane.branchName) continue;
    const args = ["merge", "--no-ff", "--no-edit", lane.branchName];
    result.commands.push(["git", ...args].join(" "));
    const merged = await execGit(result.integrationWorktreePath!, args);
    if (merged.code !== 0) {
      result.conflicts.push(`${lane.id}: ${merged.stderr.trim() || merged.stdout.trim() || merged.code}`);
      return false;
    }
  }
  return true;
}

export async function runIntegrationVerifier(params: IntegrationVerifierParams): Promise<IntegrationVerifierResult> {
  const repoRoot = params.repoRoot || process.cwd();
  const manifest = await loadAgentRunManifest(repoRoot, params.groupId);
  const result = baseResult(params, manifest);
  await addPreflightBlockers(result, manifest);
  if (result.blockers.length > 0) return result;
  if (params.dryRun) return { ...result, ok: true, status: "dry-run" };

  if (!await createIntegrationWorktree(params, manifest, result)) return result;
  if (!await applyLaneBranches(manifest, result)) return { ...result, status: "blocked" };

  const commands = params.verificationCommands?.length ? params.verificationCommands : ["git status --short"];
  for (const command of commands) result.verificationResults.push(await runVerificationCommand(command, result.integrationWorktreePath!));
  if (result.verificationResults.some((verification) => verification.status !== "passed")) return { ...result, status: "failed" };

  await updateAgentRunManifest(manifest.repoRoot, manifest.groupId, (draft) => {
    draft.status = "integrated";
    draft.integrationEvidence = `integration_verifier passed at ${new Date().toISOString()}`;
    for (const lane of draft.lanes) if (lane.status === "verified" || lane.status === "ready-to-integrate") lane.status = "integrated";
  });
  return { ...result, ok: true, status: "passed" };
}

export function formatIntegrationVerifierResult(result: IntegrationVerifierResult): string {
  const lines = [`integration_verifier: ${result.status}`];
  lines.push(`groupId: ${result.groupId}`);
  if (result.integrationBranch) lines.push(`integrationBranch: ${result.integrationBranch}`);
  if (result.integrationWorktreePath) lines.push(`integrationWorktreePath: ${result.integrationWorktreePath}`);
  if (result.verificationResults.length > 0) lines.push("verification:", ...result.verificationResults.map((item) => `- ${item.command}: ${item.status}`));
  if (result.conflicts.length > 0) lines.push("conflicts:", ...result.conflicts.map((conflict) => `- ${conflict}`));
  if (result.blockers.length > 0) lines.push("blockers:", ...result.blockers.map((blocker) => `- ${blocker}`));
  if (result.commands.length > 0) lines.push("commands:", ...result.commands.map((command) => `- ${command}`));
  return lines.join("\n");
}

export function registerIntegrationVerifierTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "integration_verifier",
    label: "Integration verifier",
    description: "Run final integration verification for manifest-backed parallel lanes.",
    promptSnippet: "integration_verifier: final integration pass/fail/block evidence for agent-run manifests before completion.",
    promptGuidelines: [
      "Use integration_verifier before completing manifest-backed parallel work.",
      "Do not claim parallel completion when lanes are unverified, dirty, conflicted, or final verification failed.",
    ],
    parameters: IntegrationVerifierParamsSchema,
    async execute(_toolCallId, params) {
      const result = await runIntegrationVerifier(params as IntegrationVerifierParams);
      return {
        content: [{ type: "text", text: formatIntegrationVerifierResult(result) }],
        details: { result },
      };
    },
  });
}
