import { basename, join } from "node:path";
import { homedir } from "node:os";
import { normalizeSessionId } from "./session-scope";

export interface SessionWorktreePlanInput {
  repoRoot: string;
  sessionId: string;
  taskName?: string;
  homeDir?: string;
}

export interface SessionWorktreePlan {
  projectName: string;
  sessionId: string;
  slug: string;
  branchName: string;
  path: string;
}

export type ParallelStrategy = "hybrid" | "worktree-first" | "spawn-only";
export type LaneExecutionStrategy = "worktree" | "spawn-agent" | "serial";

export interface ParallelWorkItemInput {
  id?: string;
  description: string;
  files?: string[];
  domains?: string[];
  dependsOn?: string[];
  write?: boolean;
}

export interface ParallelWorkItem {
  id: string;
  description: string;
  files: string[];
  domains: string[];
  dependsOn: string[];
  write: boolean;
}

export interface ParallelWorkConflict {
  type: "file" | "domain";
  scope: string;
  itemIds: string[];
  resolution: "same-lane-serial";
}

export interface ParallelWorkLane {
  id: string;
  itemIds: string[];
  descriptions: string[];
  files: string[];
  domains: string[];
  writable: boolean;
  serial: boolean;
  executionStrategy: LaneExecutionStrategy;
  blockedByLaneIds: string[];
  rationale: string;
}

export interface ParallelWorkAreaPlan {
  goal?: string;
  parallelStrategy: ParallelStrategy;
  items: ParallelWorkItem[];
  lanes: ParallelWorkLane[];
  firstWaveLaneIds: string[];
  serialLaneIds: string[];
  ownership: {
    files: Record<string, string>;
    domains: Record<string, string>;
  };
  conflicts: ParallelWorkConflict[];
  recommendations: string[];
}

export interface ParallelWorkAreaPlanInput {
  goal?: string;
  items: ParallelWorkItemInput[];
  maxLanes?: number;
  parallelStrategy?: ParallelStrategy;
}

function taskSlug(taskName: string | undefined): string {
  const expanded = (taskName || "work")
    .toLowerCase()
    .replace(/멀티/g, " multi ")
    .replace(/세션/g, " session ")
    .replace(/투두|할일/g, " todo ")
    .replace(/격리/g, " ");
  const words = expanded.match(/[a-z0-9]+/g)?.filter((word) => word.length > 1) ?? [];
  const unique = words.filter((word, index) => words.indexOf(word) === index).slice(0, 3);
  return unique.length ? unique.join("-") : "work";
}

function normalizePathScope(path: string): string | undefined {
  const normalized = path
    .trim()
    .replace(/^@/, "")
    .replace(/\\+/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
  return normalized || undefined;
}

function normalizeDomainScope(domain: string): string | undefined {
  const normalized = domain
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || undefined;
}

function itemIdFromDescription(description: string, index: number): string {
  const slug = description.toLowerCase().match(/[a-z0-9]+/g)?.slice(0, 4).join("-");
  return slug || `item-${index + 1}`;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function normalizeItems(items: ParallelWorkItemInput[]): ParallelWorkItem[] {
  const seen = new Map<string, number>();
  return items.map((item, index) => {
    const baseId = (item.id?.trim() || itemIdFromDescription(item.description, index))
      .replace(/\s+/g, "-");
    const count = seen.get(baseId) ?? 0;
    seen.set(baseId, count + 1);
    const id = count === 0 ? baseId : `${baseId}-${count + 1}`;
    return {
      id,
      description: item.description.trim(),
      files: uniqueStrings((item.files ?? []).map(normalizePathScope)).sort(),
      domains: uniqueStrings((item.domains ?? []).map(normalizeDomainScope)).sort(),
      dependsOn: uniqueStrings(item.dependsOn ?? []),
      write: item.write !== false,
    };
  });
}

class DisjointSet {
  private readonly parent = new Map<string, string>();

  add(id: string): void {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    const parent = this.parent.get(id) ?? id;
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}

function collectScopeOwners(items: ParallelWorkItem[], key: "files" | "domains"): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  for (const item of items) {
    if (!item.write) continue;
    for (const scope of item[key]) {
      owners.set(scope, [...(owners.get(scope) ?? []), item.id]);
    }
  }
  return owners;
}

function buildConflicts(items: ParallelWorkItem[], key: "files" | "domains", type: "file" | "domain"): ParallelWorkConflict[] {
  const owners = collectScopeOwners(items, key);
  return [...owners.entries()]
    .filter(([, itemIds]) => itemIds.length > 1)
    .map(([scope, itemIds]) => ({
      type,
      scope,
      itemIds,
      resolution: "same-lane-serial" as const,
    }));
}

function unknownWritableItems(items: ParallelWorkItem[]): ParallelWorkItem[] {
  return items.filter((item) => item.write && item.files.length === 0 && item.domains.length === 0);
}

function buildUnknownWritableConflict(items: ParallelWorkItem[]): ParallelWorkConflict[] {
  const unknownItems = unknownWritableItems(items);
  if (unknownItems.length <= 1) return [];
  return [{
    type: "domain",
    scope: "unknown-writable-scope",
    itemIds: unknownItems.map((item) => item.id),
    resolution: "same-lane-serial",
  }];
}

function mergeLaneDraft(target: ParallelWorkLane, source: ParallelWorkLane): ParallelWorkLane {
  return {
    ...target,
    itemIds: [...target.itemIds, ...source.itemIds],
    descriptions: [...target.descriptions, ...source.descriptions],
    files: uniqueStrings([...target.files, ...source.files]).sort(),
    domains: uniqueStrings([...target.domains, ...source.domains]).sort(),
    writable: target.writable || source.writable,
    serial: target.serial || source.serial || source.itemIds.length > 0,
    executionStrategy: "serial",
    rationale: `${target.rationale}; capped lane also owns ${source.itemIds.join(", ")}`,
    blockedByLaneIds: [],
  };
}

function applyLaneCap(lanes: ParallelWorkLane[], maxLanes: number | undefined): ParallelWorkLane[] {
  if (!maxLanes || maxLanes < 1 || lanes.length <= maxLanes) return lanes;
  const laneLimit = Math.max(1, Math.floor(maxLanes));
  const capped = lanes.slice(0, laneLimit);
  for (const lane of lanes.slice(laneLimit)) {
    const targetIndex = capped
      .map((candidate, index) => ({ index, size: candidate.itemIds.length }))
      .sort((a, b) => a.size - b.size || a.index - b.index)[0]?.index ?? capped.length - 1;
    capped[targetIndex] = mergeLaneDraft(capped[targetIndex], lane);
  }
  return capped.map((lane, index) => ({ ...lane, id: `lane-${index + 1}` }));
}

export function planSessionWorktree(input: SessionWorktreePlanInput): SessionWorktreePlan {
  const projectName = basename(input.repoRoot.replace(/\/+$/, ""));
  const sessionId = normalizeSessionId(input.sessionId).slice(0, 12);
  const slug = taskSlug(input.taskName);
  return {
    projectName,
    sessionId,
    slug,
    branchName: `session/${sessionId}/${slug}`,
    path: join(input.homeDir ?? homedir(), ".config", "superpowers", "worktrees", projectName, `${sessionId}-${slug}`),
  };
}

function normalizeParallelStrategy(strategy: ParallelStrategy | undefined): ParallelStrategy {
  return strategy ?? "hybrid";
}

function laneExecutionStrategy(lane: Pick<ParallelWorkLane, "serial" | "writable">, strategy: ParallelStrategy): LaneExecutionStrategy {
  if (lane.serial) return "serial";
  if (strategy === "spawn-only") return "spawn-agent";
  if (strategy === "worktree-first") return "worktree";
  return lane.writable ? "worktree" : "spawn-agent";
}

function parallelRecommendations(strategy: ParallelStrategy): string[] {
  const shared = [
    "Assign exactly one writable owner per file/domain before spawning parallel workers.",
    "Serialize lanes with blockedByLaneIds until prerequisites pass verification.",
    "Keep shared files/domains inside the same lane and merge only after lane-level tests pass.",
  ];
  if (strategy === "spawn-only") {
    return [
      ...shared,
      "Use spawn-only only for read-only lanes or strictly owned writable lanes; prefer hybrid when writable lanes need filesystem isolation.",
    ];
  }
  if (strategy === "worktree-first") {
    return [
      ...shared,
      "Prefer a worktree per lane, including read-only review lanes, when maximum filesystem/session isolation is more important than speed.",
    ];
  }
  return [
    ...shared,
    "Hybrid default: writable lanes run in isolated worktrees, read-only lanes may use spawned agents, and integration lanes stay serial.",
  ];
}

export function planParallelWorkAreas(input: ParallelWorkAreaPlanInput): ParallelWorkAreaPlan {
  const parallelStrategy = normalizeParallelStrategy(input.parallelStrategy);
  const items = normalizeItems(input.items);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const conflicts = [
    ...buildConflicts(items, "files", "file"),
    ...buildConflicts(items, "domains", "domain"),
    ...buildUnknownWritableConflict(items),
  ];
  const disjoint = new DisjointSet();
  for (const item of items) disjoint.add(item.id);

  for (const conflict of conflicts) {
    for (const itemId of conflict.itemIds.slice(1)) disjoint.union(conflict.itemIds[0], itemId);
  }

  const byRoot = new Map<string, ParallelWorkItem[]>();
  for (const item of items) {
    const root = disjoint.find(item.id);
    byRoot.set(root, [...(byRoot.get(root) ?? []), item]);
  }

  const rawLanes = [...byRoot.values()].map((laneItems, index): ParallelWorkLane => {
    const itemIds = laneItems.map((item) => item.id);
    const hasUnknownWritableScope = laneItems.some((item) => item.write && item.files.length === 0 && item.domains.length === 0);
    const serial = itemIds.length > 1 || hasUnknownWritableScope;
    return {
      id: `lane-${index + 1}`,
      itemIds,
      descriptions: laneItems.map((item) => item.description),
      files: uniqueStrings(laneItems.flatMap((item) => item.files)).sort(),
      domains: uniqueStrings(laneItems.flatMap((item) => item.domains)).sort(),
      writable: laneItems.some((item) => item.write),
      serial,
      executionStrategy: "serial",
      blockedByLaneIds: [],
      rationale: hasUnknownWritableScope
        ? "unknown writable scope is serialized until files or domains are declared"
        : itemIds.length > 1
          ? "shared writable file/domain scope is serialized in one owner lane"
          : "independent writable scope can run in parallel",
    };
  });

  const lanes = applyLaneCap(rawLanes, input.maxLanes);
  const itemToLane = new Map<string, string>();
  for (const lane of lanes) for (const itemId of lane.itemIds) itemToLane.set(itemId, lane.id);

  const ownership = { files: {} as Record<string, string>, domains: {} as Record<string, string> };
  for (const item of items) {
    if (!item.write) continue;
    const laneId = itemToLane.get(item.id);
    if (!laneId) continue;
    for (const file of item.files) ownership.files[file] = laneId;
    for (const domain of item.domains) ownership.domains[domain] = laneId;
  }

  const lanesWithDependencies = lanes.map((lane) => {
    const blockedByLaneIds = uniqueStrings(
      lane.itemIds.flatMap((itemId) => {
        const item = itemById.get(itemId);
        return (item?.dependsOn ?? [])
          .map((dependencyId) => itemToLane.get(dependencyId))
          .filter((laneId) => laneId && laneId !== lane.id);
      }),
    ).sort();
    return {
      ...lane,
      blockedByLaneIds,
      executionStrategy: laneExecutionStrategy(lane, parallelStrategy),
    };
  });

  const firstWaveLaneIds = lanesWithDependencies
    .filter((lane) => lane.blockedByLaneIds.length === 0)
    .map((lane) => lane.id);
  const serialLaneIds = lanesWithDependencies.filter((lane) => lane.serial).map((lane) => lane.id);
  const recommendations = parallelRecommendations(parallelStrategy);

  return {
    goal: input.goal?.trim() || undefined,
    parallelStrategy,
    items,
    lanes: lanesWithDependencies,
    firstWaveLaneIds,
    serialLaneIds,
    ownership,
    conflicts,
    recommendations,
  };
}

function formatList(values: string[]): string {
  return values.length ? values.join(", ") : "none";
}

export function formatParallelWorkPlan(plan: ParallelWorkAreaPlan): string {
  const lines = ["# Parallel work ownership plan"];
  if (plan.goal) lines.push("", `Goal: ${plan.goal}`);
  lines.push("", `Parallel strategy: ${plan.parallelStrategy}`);
  lines.push("", "## First parallel wave");
  lines.push(plan.firstWaveLaneIds.length ? `- ${plan.firstWaveLaneIds.join(", ")}` : "- none; resolve blockers before parallel execution");

  lines.push("", "## Lanes");
  for (const lane of plan.lanes) {
    lines.push(`- ${lane.id}: ${lane.itemIds.join(", ")}`);
    lines.push(`  - files: ${formatList(lane.files)}`);
    lines.push(`  - domains: ${formatList(lane.domains)}`);
    lines.push(`  - writable: ${lane.writable ? "yes" : "no"}`);
    lines.push(`  - execution: ${lane.serial ? "serial lane" : "parallel-safe lane"}`);
    lines.push(`  - run: ${lane.executionStrategy}`);
    lines.push(`  - blocked by: ${formatList(lane.blockedByLaneIds)}`);
    lines.push(`  - rationale: ${lane.rationale}`);
  }

  lines.push("", "## File/domain ownership");
  const fileEntries = Object.entries(plan.ownership.files);
  const domainEntries = Object.entries(plan.ownership.domains);
  lines.push("Files:");
  lines.push(...(fileEntries.length ? fileEntries.map(([file, laneId]) => `- ${file} → ${laneId}`) : ["- none"]));
  lines.push("Domains:");
  lines.push(...(domainEntries.length ? domainEntries.map(([domain, laneId]) => `- ${domain} → ${laneId}`) : ["- none"]));

  lines.push("", "## Conflict handling");
  lines.push(...(plan.conflicts.length
    ? plan.conflicts.map((conflict) => `- ${conflict.type} ${conflict.scope}: ${conflict.itemIds.join(", ")} → ${conflict.resolution}`)
    : ["- No overlapping writable scopes detected."]));

  lines.push("", "## Recommendations");
  lines.push(...plan.recommendations.map((recommendation) => `- ${recommendation}`));
  return lines.join("\n");
}

export function buildWorktreeGuidance(): string {
  return [
    "### Parallel development collision avoidance",
    "- Before launching 2+ writable parallel agents/sessions, create a file/domain ownership map first; use the parallel_work_plan tool when available.",
    "- Choose a parallel strategy before dispatch: default hybrid uses worktrees for writable lanes, spawned agents for read-only lanes, and serial execution for shared/integration lanes.",
    "- Enforce one writable owner per file/domain. Do not assign the same writable path, package, mode, prompt, test fixture, or runtime state file to multiple lanes.",
    "- If work touches shared files or shared domains, serialize shared files in one owner lane or split the prerequisite refactor into a separate first step before fanout.",
    "- Run read-only research/review in parallel freely, but writable implementation requires the ownership map, dependency order, and verification owner before dispatch.",
    "- Prefer a worktree per writable lane for parallel development, then merge only after lane-local verification and a final integration verification pass.",
    "### Multi-session worktree isolation",
    "- When the user asks for parallel or multi-session work, prefer isolated git worktrees instead of sharing one cwd.",
    "- Default local worktree root: ~/.config/superpowers/worktrees/<project>/<session>-<task>.",
    "- Keep each session's todos and ledger scoped to that session; use project-shared todos only when explicitly requested.",
    "- Do not delete worktrees or branches without an explicit irreversible-action approval boundary.",
  ].join("\n");
}
