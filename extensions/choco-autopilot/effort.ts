import { getSupportedThinkingLevels, type Model, type ModelThinkingLevel } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const EXPLICIT_EFFORT_LEVELS = ["low", "medium", "high", "xhigh"] as const;
const EFFORT_COMMAND_VALUES = [...EXPLICIT_EFFORT_LEVELS, "max", "auto"] as const;
const THINKING_LEVEL_ORDER = ["off", "minimal", "low", "medium", "high", "xhigh"] as const satisfies readonly ModelThinkingLevel[];
const DEFAULT_AUTO_EFFORT = "medium" satisfies ModelThinkingLevel;

export type EffortCommandValue = (typeof EFFORT_COMMAND_VALUES)[number];

export const EFFORT_USAGE = "Usage: /effort [<available-level>|auto]";

function isEffortCommandValue(value: string): value is EffortCommandValue {
  return EFFORT_COMMAND_VALUES.includes(value as EffortCommandValue);
}

function effortArgument(args: string): EffortCommandValue | undefined {
  const tokens = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens[0] === "status" || tokens[0] === "show" || tokens[0] === "current") return undefined;
  if (tokens.length > 1) throw new Error(EFFORT_USAGE);
  const [value] = tokens;
  if (isEffortCommandValue(value)) return value;
  throw new Error(`Unknown effort '${value}'. ${EFFORT_USAGE}`);
}

function supportedThinkingLevels(model: Model<any> | undefined): ModelThinkingLevel[] {
  if (!model) return [...THINKING_LEVEL_ORDER];
  return getSupportedThinkingLevels(model);
}

function availableThinkingLevels(ctx: ExtensionCommandContext): ModelThinkingLevel[] {
  return supportedThinkingLevels(ctx.model);
}

function displayEffortLevels(levels: readonly ModelThinkingLevel[]): Array<(typeof EXPLICIT_EFFORT_LEVELS)[number]> {
  return levels.filter((level): level is (typeof EXPLICIT_EFFORT_LEVELS)[number] => EXPLICIT_EFFORT_LEVELS.includes(level as (typeof EXPLICIT_EFFORT_LEVELS)[number]));
}

function completionValues(levels: readonly ModelThinkingLevel[]): string[] {
  const visibleLevels = displayEffortLevels(levels);
  return visibleLevels.length > 0 ? [...visibleLevels, "auto"] : [];
}

function formatAvailable(levels: readonly ModelThinkingLevel[]): string {
  return displayEffortLevels(levels).join(", ") || "none";
}

function effortUsage(levels: readonly ModelThinkingLevel[]): string {
  const values = completionValues(levels);
  return values.length > 0 ? `Usage: /effort [${values.join("|")}]` : "Usage: /effort status";
}

function maxSupportedEffort(levels: readonly ModelThinkingLevel[]): ModelThinkingLevel | undefined {
  for (let index = THINKING_LEVEL_ORDER.length - 1; index >= 0; index -= 1) {
    const level = THINKING_LEVEL_ORDER[index];
    if (levels.includes(level)) return level;
  }
  return undefined;
}

function resolveEffort(value: EffortCommandValue, levels: readonly ModelThinkingLevel[]): ModelThinkingLevel | undefined {
  if (value === "max") return maxSupportedEffort(levels);
  if (value === "auto") {
    if (levels.includes(DEFAULT_AUTO_EFFORT)) return DEFAULT_AUTO_EFFORT;
    return maxSupportedEffort(levels);
  }
  return levels.includes(value) ? value : undefined;
}

function commandSuffix(value: EffortCommandValue): string {
  return value === "auto" ? " (auto)" : "";
}

function effortStatus(current: ModelThinkingLevel, levels: readonly ModelThinkingLevel[]): string {
  return `effort: ${current} | available: ${formatAvailable(levels)} | ${effortUsage(levels)}`;
}

export function registerEffortCommand(pi: ExtensionAPI): void {
  let currentModel: Model<any> | undefined;

  pi.on("session_start", (_event, ctx) => {
    currentModel = ctx.model;
  });
  pi.on("model_select", (event, ctx) => {
    currentModel = event.model ?? ctx.model;
  });
  pi.on("agent_start", (_event, ctx) => {
    currentModel = ctx.model;
  });

  pi.registerCommand("effort", {
    description: "Show or change thinking effort for the active model",
    getArgumentCompletions: (prefix) => {
      const query = prefix.trim().toLowerCase();
      return completionValues(supportedThinkingLevels(currentModel))
        .filter((value) => value.startsWith(query))
        .map((value) => ({ value, label: value }));
    },
    handler: async (args, ctx) => {
      currentModel = ctx.model;
      let value: EffortCommandValue | undefined;
      try {
        value = effortArgument(args);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        return;
      }

      const levels = availableThinkingLevels(ctx);
      const before = pi.getThinkingLevel();

      if (!value) {
        ctx.ui.notify(effortStatus(before, levels), "info");
        return;
      }

      const resolved = resolveEffort(value, levels);
      if (!resolved || resolved === "off" || resolved === "minimal") {
        ctx.ui.notify(`Unsupported effort '${value}' for this model. Available: ${formatAvailable(levels)}`, "error");
        return;
      }

      pi.setThinkingLevel(resolved);
      const after = pi.getThinkingLevel();
      const suffix = commandSuffix(value);
      ctx.ui.notify(before === after ? `effort: ${after}${suffix}` : `effort: ${before} -> ${after}${suffix}`, "info");
    },
  });
}
