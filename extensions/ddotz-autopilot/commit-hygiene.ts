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

export function createDefaultQualityCommands(): string[] {
  return ["pnpm run lint", "pnpm run typecheck", "pnpm run test"];
}

export function buildCommitHygieneGuidance(): string {
  return [
    "### Commit hygiene and quality gates",
    "Before committing, run a final commit review:",
    "- Inspect `git status --short --untracked-files=all`.",
    "- Exclude unnecessary development analysis files, Superpowers runtime artifacts, private/personal files, secrets, generated output, caches, logs, and unneeded dotfiles.",
    "- Allow intentional project configuration dotfiles such as .gitignore, .npmrc, .editorconfig, and linter/formatter config.",
    "- After code changes, run lint by default before typecheck/test.",
    `- Default quality gate: ${createDefaultQualityCommands().join(" && ")}`,
  ].join("\n");
}
