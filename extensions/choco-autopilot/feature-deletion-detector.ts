import { execGit, repoRoot } from "./git-runtime";
import type { SpecDelta } from "./dynamic-sdd";

export type FeatureChangeKind =
  | "export-removal"
  | "test-removal"
  | "placeholder-added"
  | "hidden-rendering"
  | "tool-command-removal"
  | "gate-removal"
  | "large-deletion";

export type FeatureChangeSeverity = "critical" | "high" | "medium" | "low";
export type FeatureChangeStatus = "unresolved" | "explained" | "ignored-low-risk" | "blocked";

export interface FeatureChange {
  id: string;
  filePath: string;
  changeKind: FeatureChangeKind;
  severity: FeatureChangeSeverity;
  evidenceSummary: string;
  matchedPattern: string;
  requiresDelta: boolean;
  status: FeatureChangeStatus;
  affectedName?: string;
  deltaId?: string;
}

export interface FeatureDeletionDetectorInput {
  changedFiles: string[];
  diffText: string;
  deltas: SpecDelta[];
}

export interface FeatureDeletionDetectorResult {
  changes: FeatureChange[];
  blockingChanges: FeatureChange[];
  summary: string;
}

const BLOCKING_SEVERITIES = new Set<FeatureChangeSeverity>(["critical", "high", "medium"]);
const LARGE_DELETION_REMOVED_LINES = 50;
const LARGE_DELETION_NET_LINES = 30;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9가-힣/_.$-]+/gi, " ").replace(/\s+/g, " ").trim();
}

function includesNormalized(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeText(needle);
  if (!normalizedNeedle) return false;
  return normalizeText(haystack).includes(normalizedNeedle);
}

function deltaText(delta: SpecDelta): string {
  return [
    delta.description,
    delta.rationale,
    ...(delta.proposedChanges.scope ?? []),
    ...(delta.proposedChanges.acceptanceCriteria ?? []),
    ...(delta.proposedChanges.testStrategy ?? []),
    ...(delta.proposedChanges.risks ?? []),
  ].filter(Boolean).join("\n");
}

function deltaId(delta: SpecDelta): string {
  return `${delta.createdAt}:${delta.description}`;
}

function currentFileFromDiffLine(line: string): string | undefined {
  if (!line.startsWith("+++ ")) return undefined;
  const path = line.slice(4).trim();
  if (path === "/dev/null") return undefined;
  return path.startsWith("b/") ? path.slice(2) : path;
}

function isTestFile(path: string): boolean {
  return /(^|\/)(tests?|__tests__)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/i.test(path);
}

function exportRemovalName(line: string): string | undefined {
  const named = line.match(/^-\s*export\s+(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/);
  if (named) return named[1];
  const defaultNamed = line.match(/^-\s*export\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/);
  return defaultNamed?.[1];
}

function exportAdditionName(line: string): string | undefined {
  const named = line.match(/^\+\s*export\s+(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/);
  if (named) return named[1];
  const defaultNamed = line.match(/^\+\s*export\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/);
  return defaultNamed?.[1];
}

function testRemoval(line: string, path: string): boolean {
  return isTestFile(path) && /^-\s*(?:it|test|describe)\s*\(/.test(line);
}

function implementationLikeFile(path: string): boolean {
  if (isTestFile(path)) return false;
  if (/(^|\/)(docs?|examples?|fixtures?)(\/|$)|(^|\/)README(?:_[a-z]+)?\.md$|\.md$/i.test(path)) return false;
  return /\.(?:[cm]?[jt]sx?|vue|svelte|css|scss|html)$/i.test(path);
}

function placeholderAdded(line: string, path: string): boolean {
  if (!line.startsWith("+") || !implementationLikeFile(path)) return false;
  const content = line.slice(1).trim();
  return /^(?:\/\/|\/\*|\*|#).*\b(todo|fixme|stub|placeholder|not implemented|not yet implemented)\b/i.test(content)
    || /\bthrow\s+new\s+Error\(["'`](?:not implemented|not yet implemented)/i.test(content)
    || /나중에|미구현|임시\s*구현/i.test(content);
}

function hiddenRenderingAdded(line: string, path: string): boolean {
  return line.startsWith("+") && implementationLikeFile(path) && (/\bfalse\s*&&/.test(line)
    || /\bdisplay\s*:\s*["']?none\b/i.test(line)
    || /\bvisibility\s*:\s*["']?hidden\b/i.test(line)
    || /\baria-hidden\s*=\s*["']?true/i.test(line)
    || /\bhidden\s*=\s*\{?true\}?/i.test(line));
}

function toolCommandRemoval(line: string): string | undefined {
  const match = line.match(/^-.*\bregister(?:Tool|Command)\s*\(\s*["']([^"']+)/);
  return match?.[1];
}

function gateRemoval(line: string): boolean {
  return line.startsWith("-") && /\b(structural_gate|spec_gate|loop_transition|report_research_gate|integration_verifier)\b|required before completion|completion gate|fail-closed/i.test(line);
}

function createChange(input: {
  index: number;
  filePath: string;
  changeKind: FeatureChangeKind;
  severity: FeatureChangeSeverity;
  evidenceSummary: string;
  matchedPattern: string;
  affectedName?: string;
}): FeatureChange {
  return {
    id: `DEL-${String(input.index + 1).padStart(3, "0")}`,
    filePath: input.filePath,
    changeKind: input.changeKind,
    severity: input.severity,
    evidenceSummary: input.evidenceSummary,
    matchedPattern: input.matchedPattern,
    affectedName: input.affectedName,
    requiresDelta: true,
    status: "unresolved",
  };
}

function changeTokens(change: FeatureChange): string[] {
  return [change.affectedName, change.filePath, change.changeKind]
    .filter((value): value is string => Boolean(value && value.trim()));
}

function explainingDelta(change: FeatureChange, deltas: SpecDelta[]): SpecDelta | undefined {
  return deltas.find((delta) => {
    const text = deltaText(delta);
    return changeTokens(change).some((token) => includesNormalized(text, token));
  });
}

function reconcileChanges(changes: FeatureChange[], deltas: SpecDelta[]): FeatureChange[] {
  return changes.map((change) => {
    const delta = explainingDelta(change, deltas);
    if (!delta) return change;
    return { ...change, status: "explained", deltaId: deltaId(delta) };
  });
}

function incrementCount(counts: Map<string, number>, filePath: string): void {
  counts.set(filePath, (counts.get(filePath) ?? 0) + 1);
}

export function detectFeatureDeletionFromDiff(input: FeatureDeletionDetectorInput): FeatureDeletionDetectorResult {
  let currentFile = input.changedFiles[0] ?? "unknown";
  const changes: FeatureChange[] = [];
  const addedExports = new Set<string>();
  const removedLineCounts = new Map<string, number>();
  const addedLineCounts = new Map<string, number>();

  for (const line of input.diffText.split(/\r?\n/)) {
    const nextFile = currentFileFromDiffLine(line);
    if (nextFile) {
      currentFile = nextFile;
      continue;
    }
    if (!line || line.startsWith("--- ") || line.startsWith("@@")) continue;

    if (implementationLikeFile(currentFile) && line.startsWith("-") && line.slice(1).trim()) {
      incrementCount(removedLineCounts, currentFile);
    }
    if (implementationLikeFile(currentFile) && line.startsWith("+") && line.slice(1).trim()) {
      incrementCount(addedLineCounts, currentFile);
    }

    const addedExportName = exportAdditionName(line);
    if (addedExportName) {
      addedExports.add(`${currentFile}:${addedExportName}`);
      continue;
    }

    const exportName = exportRemovalName(line);
    if (exportName) {
      changes.push(createChange({
        index: changes.length,
        filePath: currentFile,
        changeKind: "export-removal",
        severity: "high",
        evidenceSummary: `removed export ${exportName}`,
        matchedPattern: "removed-export-symbol",
        affectedName: exportName,
      }));
      continue;
    }

    const removedToolOrCommand = toolCommandRemoval(line);
    if (removedToolOrCommand) {
      changes.push(createChange({
        index: changes.length,
        filePath: currentFile,
        changeKind: "tool-command-removal",
        severity: "critical",
        evidenceSummary: `removed tool/command registration ${removedToolOrCommand}`,
        matchedPattern: "removed-tool-command-registration",
        affectedName: removedToolOrCommand,
      }));
      continue;
    }

    if (testRemoval(line, currentFile)) {
      changes.push(createChange({
        index: changes.length,
        filePath: currentFile,
        changeKind: "test-removal",
        severity: "high",
        evidenceSummary: "removed test case or suite",
        matchedPattern: "removed-test-case",
      }));
      continue;
    }

    if (gateRemoval(line)) {
      changes.push(createChange({
        index: changes.length,
        filePath: currentFile,
        changeKind: "gate-removal",
        severity: "critical",
        evidenceSummary: "removed completion gate reference",
        matchedPattern: "removed-gate-reference",
      }));
      continue;
    }

    if (placeholderAdded(line, currentFile)) {
      changes.push(createChange({
        index: changes.length,
        filePath: currentFile,
        changeKind: "placeholder-added",
        severity: "high",
        evidenceSummary: "added implementation placeholder marker",
        matchedPattern: "added-placeholder-marker",
      }));
      continue;
    }

    if (hiddenRenderingAdded(line, currentFile)) {
      changes.push(createChange({
        index: changes.length,
        filePath: currentFile,
        changeKind: "hidden-rendering",
        severity: "high",
        evidenceSummary: "added hidden rendering pattern",
        matchedPattern: "added-hidden-rendering",
      }));
    }
  }

  for (const [filePath, removedLines] of removedLineCounts) {
    const netRemovedLines = removedLines - (addedLineCounts.get(filePath) ?? 0);
    if (removedLines < LARGE_DELETION_REMOVED_LINES || netRemovedLines < LARGE_DELETION_NET_LINES) continue;
    changes.push(createChange({
      index: changes.length,
      filePath,
      changeKind: "large-deletion",
      severity: "high",
      evidenceSummary: `removed ${removedLines} implementation lines (${netRemovedLines} net)`,
      matchedPattern: "large-implementation-deletion",
      affectedName: `${removedLines} lines`,
    }));
  }

  const suspiciousChanges = changes.filter((change) => {
    if (change.changeKind !== "export-removal" || !change.affectedName) return true;
    return !addedExports.has(`${change.filePath}:${change.affectedName}`);
  });
  const reconciled = reconcileChanges(suspiciousChanges, input.deltas);
  const blockingChanges = reconciled.filter((change) => change.status === "unresolved" && BLOCKING_SEVERITIES.has(change.severity));
  const summary = blockingChanges.length === 0
    ? "No blocking feature deletion changes detected."
    : `Blocking feature deletion changes: ${blockingChanges.map((change) => `${change.id} ${change.changeKind} ${change.filePath}`).join("; ")}`;
  return { changes: reconciled, blockingChanges, summary };
}

async function gitDiff(root: string, args: string[]): Promise<string | undefined> {
  const result = await execGit(root, args, { timeoutMs: 10_000 });
  if (result.code !== 0) return undefined;
  return result.stdout;
}

async function existingBranchBaseRef(root: string): Promise<string | undefined> {
  for (const ref of ["origin/main", "main", "origin/master", "master"]) {
    const result = await execGit(root, ["rev-parse", "--verify", `${ref}^{commit}`], { timeoutMs: 10_000 });
    if (result.code === 0) return ref;
  }
  return undefined;
}

async function branchDiffAgainstBase(root: string): Promise<{ diffText: string; changedFiles: string[] } | undefined> {
  const baseRef = await existingBranchBaseRef(root);
  if (!baseRef) return { diffText: "", changedFiles: [] };
  const [diffText, names] = await Promise.all([
    gitDiff(root, ["diff", `${baseRef}...HEAD`, "--", "."]),
    gitDiff(root, ["diff", `${baseRef}...HEAD`, "--name-only", "--", "."]),
  ]);
  if (diffText === undefined || names === undefined) return undefined;
  return {
    diffText,
    changedFiles: names.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  };
}

export async function detectFeatureDeletionFromGit(cwd: string, deltas: SpecDelta[]): Promise<FeatureDeletionDetectorResult | undefined> {
  let root: string;
  try {
    root = await repoRoot(cwd);
  } catch {
    return undefined;
  }

  const [unstagedDiff, stagedDiff, unstagedNames, stagedNames, branchDiff] = await Promise.all([
    gitDiff(root, ["diff", "--", "."]),
    gitDiff(root, ["diff", "--cached", "--", "."]),
    gitDiff(root, ["diff", "--name-only", "--", "."]),
    gitDiff(root, ["diff", "--cached", "--name-only", "--", "."]),
    branchDiffAgainstBase(root),
  ]);
  if (unstagedDiff === undefined || stagedDiff === undefined || unstagedNames === undefined || stagedNames === undefined || branchDiff === undefined) return undefined;
  const diffText = [branchDiff.diffText, unstagedDiff, stagedDiff].filter(Boolean).join("\n");
  if (!diffText.trim()) return { changes: [], blockingChanges: [], summary: "No git diff to inspect." };
  const changedFiles = Array.from(new Set([
    ...branchDiff.changedFiles,
    ...unstagedNames.split(/\r?\n/),
    ...stagedNames.split(/\r?\n/),
  ].map((line) => line.trim()).filter(Boolean)));
  return detectFeatureDeletionFromDiff({ changedFiles, diffText, deltas });
}

export async function featureDeletionCompletionBlock(cwd: string, deltas: SpecDelta[]): Promise<string | undefined> {
  const result = await detectFeatureDeletionFromGit(cwd, deltas);
  if (!result || result.blockingChanges.length === 0) return undefined;
  return result.summary;
}
