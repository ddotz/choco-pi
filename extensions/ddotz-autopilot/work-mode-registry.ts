export type WorkModeStatus = "implemented" | "planned";

export interface WorkModeDefinition {
  id: string;
  description: string;
  status: WorkModeStatus;
  custom: boolean;
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

const BUILT_IN_MODES: Array<Omit<WorkModeDefinition, "createdAt">> = [
  {
    id: "default",
    description: "General autonomous PM/development-team behavior. The only currently implemented work mode.",
    status: "implemented",
    custom: false,
  },
  {
    id: "coding",
    description: "Planned mode for implementation, refactoring, debugging, testing, and verification.",
    status: "planned",
    custom: false,
  },
  {
    id: "report",
    description: "Planned mode for evidence gathering, report writing, and document polishing.",
    status: "planned",
    custom: false,
  },
  {
    id: "web-analysis",
    description: "Planned mode for external web research and requested follow-up actions.",
    status: "planned",
    custom: false,
  },
  {
    id: "adoption-analysis",
    description: "Planned mode for analyzing external repos/links and adopting improvements into ddotz-pi.",
    status: "planned",
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

export function createWorkModeRegistry(): WorkModeRegistry {
  const createdAt = nowIso();
  return {
    version: 1,
    modes: BUILT_IN_MODES.map((mode) => ({ ...mode, createdAt })),
  };
}

export function ensureBuiltInModes(registry: WorkModeRegistry | undefined): WorkModeRegistry {
  const base = registry?.modes ? registry : createWorkModeRegistry();
  const builtIns = createWorkModeRegistry().modes;
  const custom = base.modes.filter((mode) => mode.custom);
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
  const normalized = normalizeModeId(id);
  return registry.modes.find((mode) => mode.id === normalized);
}

export function listWorkModes(registry: WorkModeRegistry): string {
  return registry.modes
    .map((mode) => `- ${mode.id} [${mode.status}${mode.custom ? ", custom" : ""}] ${mode.description}`)
    .join("\n");
}
