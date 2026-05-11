export type WorkModeStatus = "implemented" | "planned";

export interface WorkModeDefinition {
  id: string;
  description: string;
  status: WorkModeStatus;
  custom: boolean;
  folder: string;
  instructionFile: string;
  createdAt: string;
}

export interface WorkModeRegistry {
  version: 1;
  modes: WorkModeDefinition[];
}

export interface AddCustomWorkModeInput {
  id: string;
  description: string;
}

const BUILT_IN_MODES: Array<Omit<WorkModeDefinition, "createdAt" | "folder" | "instructionFile">> = [
  {
    id: "default",
    description: "Root all-purpose generalist mode that best preserves ddotz-pi philosophy and can apply specialized overlays when useful.",
    status: "implemented",
    custom: false,
  },
  {
    id: "coding",
    description: "Implemented mode for TDD-first implementation, systematic debugging, surgical changes, tight verification, and coding completion quality guards.",
    status: "implemented",
    custom: false,
  },
  {
    id: "report",
    description: "Implemented mode for evidence-led report writing, source confidence gating, Kami-derived layout, and im-not-ai-derived Korean polishing.",
    status: "implemented",
    custom: false,
  },
  {
    id: "web-analysis",
    description: "Implemented mode for retrieval-first external web research, source confidence scoring, and critical review.",
    status: "implemented",
    custom: false,
  },
  {
    id: "adoption-analysis",
    description: "Implemented mode for external source/package/repo adoption decisions with explicit adoption depth, fit, risk, scope, and tracking review.",
    status: "implemented",
    custom: false,
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeModeId(id: string): string {
  const normalized = id.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized) throw new Error("Mode id must contain at least one letter or number");
  return normalized;
}

export function modeFolderFor(id: string): string {
  return `modes/${normalizeModeId(id)}`;
}

export function modeInstructionFileFor(id: string): string {
  return `${modeFolderFor(id)}/MODE.md`;
}

function withModePaths<T extends { id: string }>(mode: T): T & { folder: string; instructionFile: string } {
  return {
    ...mode,
    folder: modeFolderFor(mode.id),
    instructionFile: modeInstructionFileFor(mode.id),
  };
}

export function createWorkModeRegistry(): WorkModeRegistry {
  const createdAt = nowIso();
  return {
    version: 1,
    modes: BUILT_IN_MODES.map((mode) => ({ ...withModePaths(mode), createdAt })),
  };
}

export function ensureBuiltInModes(registry: WorkModeRegistry | undefined): WorkModeRegistry {
  const base = registry?.modes ? registry : createWorkModeRegistry();
  const builtIns = createWorkModeRegistry().modes;
  const custom = base.modes.filter((mode) => mode.custom).map((mode) => ({ ...withModePaths(mode), createdAt: mode.createdAt }));
  const mergedCustom = custom.filter((mode) => !builtIns.some((builtIn) => builtIn.id === mode.id));
  return { version: 1, modes: [...builtIns, ...mergedCustom] };
}

export function addCustomWorkMode(registry: WorkModeRegistry, input: AddCustomWorkModeInput): WorkModeRegistry {
  const id = normalizeModeId(input.id);
  if (registry.modes.some((mode) => mode.id === id)) throw new Error(`Work mode already exists: ${id}`);
  const description = input.description.trim();
  if (!description) throw new Error("Work mode description is required");
  return {
    ...registry,
    modes: [
      ...registry.modes,
      {
        id,
        description,
        status: "planned",
        custom: true,
        folder: modeFolderFor(id),
        instructionFile: modeInstructionFileFor(id),
        createdAt: nowIso(),
      },
    ],
  };
}

export function removeCustomWorkMode(registry: WorkModeRegistry, id: string): WorkModeRegistry {
  const normalized = normalizeModeId(id);
  const existing = registry.modes.find((mode) => mode.id === normalized);
  if (!existing) return registry;
  if (!existing.custom) throw new Error(`Cannot remove built-in work mode: ${normalized}`);
  return { ...registry, modes: registry.modes.filter((mode) => mode.id !== normalized) };
}

export function findWorkMode(registry: WorkModeRegistry, id: string): WorkModeDefinition | undefined {
  try {
    const normalized = normalizeModeId(id);
    return registry.modes.find((mode) => mode.id === normalized);
  } catch {
    return undefined;
  }
}

function modeStatusLabel(mode: WorkModeDefinition, currentMode?: string): string {
  const tags: string[] = [mode.status];
  if (mode.custom) tags.push("custom");
  if (mode.id === currentMode) tags.push("current");
  return tags.join(", ");
}

export function formatWorkModeSelectionOption(mode: WorkModeDefinition, currentMode: string): string {
  return `${mode.id} [${modeStatusLabel(mode, currentMode)}] — ${mode.description}`;
}

export function listWorkModeSelectionOptions(registry: WorkModeRegistry, currentMode: string): string[] {
  return registry.modes.map((mode) => formatWorkModeSelectionOption(mode, currentMode));
}

export function findWorkModeBySelectionOption(
  registry: WorkModeRegistry,
  selectedOption: string,
  currentMode: string,
): WorkModeDefinition | undefined {
  return registry.modes.find((mode) => formatWorkModeSelectionOption(mode, currentMode) === selectedOption);
}

export function listWorkModes(registry: WorkModeRegistry): string {
  return registry.modes
    .map((mode) => `- ${mode.id} [${modeStatusLabel(mode)}] ${mode.instructionFile} — ${mode.description}`)
    .join("\n");
}
