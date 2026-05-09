export type ExternalSourceKind = "github" | "url";
export type ExternalSourceStatus = "candidate" | "watching" | "adopted" | "rejected";

export interface ExternalSource {
  id: string;
  url: string;
  kind: ExternalSourceKind;
  label: string;
  status: ExternalSourceStatus;
  rationale?: string;
  adoptedItems: string[];
  addedAt: string;
  lastCheckedAt?: string;
  nextCheckAt: string;
  lastKnownRef?: string;
  changedSinceLastCheck: boolean;
  lastCheckOk?: boolean;
  lastCheckError?: string;
  lastAdoptionReview?: string;
}

export interface SourceRegistry {
  version: 1;
  sources: ExternalSource[];
  lastAutoCheckAt?: string;
}

export interface CreateExternalSourceOptions {
  label?: string;
  rationale?: string;
  now?: Date;
}

export interface SourceCheckResult {
  checkedAt: Date;
  upstreamRef?: string;
  ok: boolean;
  error?: string;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function createSourceRegistry(): SourceRegistry {
  return { version: 1, sources: [] };
}

function addWeek(date: Date): string {
  return new Date(date.getTime() + WEEK_MS).toISOString();
}

function stableIdForUrl(url: string): string {
  const match = parseGitHubRepo(url);
  if (match) return `github-${match.owner.toLowerCase()}-${match.repo.toLowerCase()}`.replace(/[^a-z0-9-]/g, "-");
  return `url-${Buffer.from(url).toString("base64url").slice(0, 40)}`;
}

export function parseGitHubRepo(url: string): { owner: string; repo: string } | undefined {
  const match = url.match(/^https?:\/\/github\.com\/([^/\s#?]+)\/([^/\s#?]+?)(?:\.git)?(?:[\s/#?].*)?$/i);
  if (!match) return undefined;
  return { owner: match[1], repo: match[2].replace(/\.git$/i, "") };
}

export function createExternalSource(url: string, options: CreateExternalSourceOptions = {}): ExternalSource {
  const trimmed = url.trim();
  const now = options.now ?? new Date();
  const github = parseGitHubRepo(trimmed);
  const label = options.label?.trim() || (github ? `${github.owner}/${github.repo}` : trimmed);

  return {
    id: stableIdForUrl(trimmed),
    url: trimmed,
    kind: github ? "github" : "url",
    label,
    status: "candidate",
    rationale: options.rationale?.trim() || undefined,
    adoptedItems: [],
    addedAt: now.toISOString(),
    nextCheckAt: addWeek(now),
    changedSinceLastCheck: false,
  };
}

export function upsertExternalSource(registry: SourceRegistry, source: ExternalSource): SourceRegistry {
  const existing = registry.sources.find((item) => item.id === source.id);
  if (!existing) return { ...registry, sources: [...registry.sources, source] };
  return {
    ...registry,
    sources: registry.sources.map((item) =>
      item.id === source.id
        ? {
            ...item,
            rationale: source.rationale ?? item.rationale,
            label: source.label || item.label,
          }
        : item,
    ),
  };
}

export function markSourceAdopted(
  registry: SourceRegistry,
  id: string,
  review: string,
  adoptedItems: string[] = [],
): SourceRegistry {
  return {
    ...registry,
    sources: registry.sources.map((source) =>
      source.id === id
        ? {
            ...source,
            status: "adopted",
            lastAdoptionReview: review.trim() || source.lastAdoptionReview,
            adoptedItems: Array.from(new Set([...source.adoptedItems, ...adoptedItems.map((item) => item.trim()).filter(Boolean)])),
          }
        : source,
    ),
  };
}

export function markSourceRejected(registry: SourceRegistry, id: string, review: string): SourceRegistry {
  return {
    ...registry,
    sources: registry.sources.map((source) =>
      source.id === id
        ? {
            ...source,
            status: "rejected",
            lastAdoptionReview: review.trim() || source.lastAdoptionReview,
          }
        : source,
    ),
  };
}

export function sourcesDueForWeeklyCheck(registry: SourceRegistry, now = new Date()): ExternalSource[] {
  return registry.sources.filter((source) => {
    if (source.status === "rejected") return false;
    return new Date(source.nextCheckAt).getTime() <= now.getTime();
  });
}

export function updateSourceCheckResult(registry: SourceRegistry, id: string, result: SourceCheckResult): SourceRegistry {
  return {
    ...registry,
    sources: registry.sources.map((source) => {
      if (source.id !== id) return source;
      const changed = result.ok && result.upstreamRef !== undefined && result.upstreamRef !== source.lastKnownRef;
      return {
        ...source,
        lastCheckedAt: result.checkedAt.toISOString(),
        nextCheckAt: addWeek(result.checkedAt),
        lastKnownRef: result.upstreamRef ?? source.lastKnownRef,
        changedSinceLastCheck: changed,
        lastCheckOk: result.ok,
        lastCheckError: result.ok ? undefined : result.error ?? "unknown check failure",
      };
    }),
    lastAutoCheckAt: result.checkedAt.toISOString(),
  };
}

export function summarizeDueSources(registry: SourceRegistry, now = new Date()): string {
  const due = sourcesDueForWeeklyCheck(registry, now);
  if (due.length === 0) return "No external sources are due for weekly update check.";
  return [
    "The following external sources are due for weekly update check:",
    ...due.map((source) => `- ${source.label} (${source.status}) — ${source.url}`),
  ].join("\n");
}

export function summarizeChangedSources(registry: SourceRegistry): string {
  const changed = registry.sources.filter((source) => source.changedSinceLastCheck && source.status !== "rejected");
  if (changed.length === 0) return "No tracked external sources changed since the last check.";
  return [
    "Changed external sources that need autonomous adoption analysis:",
    ...changed.map((source) => `- ${source.label} (${source.status}) — ${source.url} @ ${source.lastKnownRef ?? "unknown ref"}`),
  ].join("\n");
}

export function gitRemoteUrlForSource(source: ExternalSource): string | undefined {
  const github = parseGitHubRepo(source.url);
  if (!github) return undefined;
  return `https://github.com/${github.owner}/${github.repo}.git`;
}
