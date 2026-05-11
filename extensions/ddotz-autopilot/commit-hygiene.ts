export type CommitPathRiskKind =
  | "allowed"
  | "superpowers-artifact"
  | "secret-or-private"
  | "unnecessary-dotfile"
  | "generated-or-cache";

export interface CommitPathRisk {
  path: string;
  kind: CommitPathRiskKind;
  include: boolean;
  reason: string;
}

export interface VersionSyncIssue {
  changedPath: string;
  missingPath: string;
  reason: string;
}

const ALLOWED_DOTFILES = new Set([
  ".gitignore",
  ".npmrc",
  ".editorconfig",
  ".gitattributes",
  ".prettierrc",
  ".prettierrc.json",
  ".prettierignore",
  ".eslintrc",
  ".eslintrc.json",
  ".eslintignore",
  ".biome.json",
]);

const SECRET_OR_PRIVATE_PATTERNS = [
  /^\.env(?:\.|$)/,
  /(^|\/)\.env(?:\.|$)/,
  /(^|\/)(secrets?|credentials?|private|personal|tokens?)\b/i,
  /(^|\/).*\.(pem|key|p12|pfx)$/i,
  /(^|\/)id_rsa(?:\.pub)?$/,
  /(^|\/)id_ed25519(?:\.pub)?$/,
];

const SUPERPOWERS_PATTERNS = [
  /^\.superpowers(?:\/|$)/,
  /^docs\/superpowers\/(?:plans|runs|sessions|tmp|temp)(?:\/|$)/,
  /(^|\/)SUPERPOWERS(?:\.|\/|$)/,
];

const GENERATED_OR_CACHE_PATTERNS = [
  /(^|\/)node_modules(?:\/|$)/,
  /(^|\/)dist(?:\/|$)/,
  /(^|\/)coverage(?:\/|$)/,
  /(^|\/)\.turbo(?:\/|$)/,
  /(^|\/)\.next(?:\/|$)/,
  /(^|\/)\.DS_Store$/,
  /(^|\/)Thumbs\.db$/,
  /\.log$/,
];

const PACKAGE_VERSION_PATH = "package.json";
const PLUGIN_VERSION_PATH = "extensions/ddotz-autopilot/version.ts";

function normalizePath(path: string): string {
  return path.trim().replace(/^\.\//, "");
}

function firstSegment(path: string): string {
  return path.split("/")[0] ?? path;
}

export function classifyCommitPath(path: string): CommitPathRisk {
  const normalized = normalizePath(path);

  if (SECRET_OR_PRIVATE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      path: normalized,
      kind: "secret-or-private",
      include: false,
      reason: "Possible secret, credential, private note, or personal data.",
    };
  }

  if (SUPERPOWERS_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      path: normalized,
      kind: "superpowers-artifact",
      include: false,
      reason: "Development/runtime artifact from Superpowers-style planning or analysis.",
    };
  }

  if (GENERATED_OR_CACHE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      path: normalized,
      kind: "generated-or-cache",
      include: false,
      reason: "Generated output, dependency directory, cache, OS artifact, or log file.",
    };
  }

  if (normalized.startsWith(".") && !ALLOWED_DOTFILES.has(firstSegment(normalized))) {
    return {
      path: normalized,
      kind: "unnecessary-dotfile",
      include: false,
      reason: "Unrecognized dotfile/dot-directory should not be committed without explicit need.",
    };
  }

  return {
    path: normalized,
    kind: "allowed",
    include: true,
    reason: "No commit hygiene risk detected.",
  };
}

export function shouldIncludeInCommit(path: string): boolean {
  return classifyCommitPath(path).include;
}

export function findCommitHygieneIssues(paths: string[]): CommitPathRisk[] {
  return paths.map(classifyCommitPath).filter((risk) => !risk.include);
}

export function findVersionSyncIssues(paths: string[]): VersionSyncIssue[] {
  const normalizedPaths = new Set(paths.map(normalizePath));
  const issues: VersionSyncIssue[] = [];
  const packageChanged = normalizedPaths.has(PACKAGE_VERSION_PATH);
  const pluginVersionChanged = normalizedPaths.has(PLUGIN_VERSION_PATH);

  if (pluginVersionChanged && !packageChanged) {
    issues.push({
      changedPath: PLUGIN_VERSION_PATH,
      missingPath: PACKAGE_VERSION_PATH,
      reason: "Plugin version constant changed without updating package.json version."
    });
  }

  return issues;
}

export function createDefaultQualityCommands(): string[] {
  return ["pnpm run version:check", "pnpm run lint", "pnpm run typecheck", "pnpm run test"];
}

export function buildCommitHygieneGuidance(): string {
  return [
    "### Commit hygiene and quality gates",
    "Before committing, run a final commit review:",
    "- Inspect `git status --short --untracked-files=all`.",
    "- Exclude unnecessary development analysis files, Superpowers runtime artifacts, private/personal files, secrets, generated output, caches, logs, and unneeded dotfiles.",
    "- Allow intentional project configuration dotfiles such as .gitignore, .npmrc, .editorconfig, and linter/formatter config.",
    "- Commit and push autonomously after verification when the working tree contains intentional in-scope changes and a remote is configured.",
    "- Do not treat git push as deployment; treat it as routine source synchronization unless it targets protected/release automation with unusual side effects.",
    "- Version bumping is not mandatory for every commit. Choose patch/minor/major/no bump autonomously based on change magnitude; leave the version unchanged for tiny docs, comments, tests-only, or housekeeping commits.",
    "- Use patch for bug fixes and small runtime behavior changes, minor for meaningful new capabilities, and major for breaking behavior/config changes.",
    "- Version sync is mandatory only when a version bump is chosen or dependency metadata changes: keep package.json version and the plugin version constant synchronized; dependency metadata changes must also update pnpm-lock.yaml.",
    "- After code changes, run version sync and lint by default before typecheck/test.",
    `- Default quality gate: ${createDefaultQualityCommands().join(" && ")}`,
  ].join("\n");
}
