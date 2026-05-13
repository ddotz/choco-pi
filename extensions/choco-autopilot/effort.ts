import { getSupportedThinkingLevels, type ModelThinkingLevel } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const EXPLICIT_EFFORT_LEVELS = ["low", "medium", "high", "xhigh"] as const;
const EFFORT_COMMAND_VALUES = [...EXPLICIT_EFFORT_LEVELS, "max", "auto"] as const;
const THINKING_LEVEL_ORDER = ["off", "minimal", "low", "medium", "high", "xhigh"] as const satisfies readonly ModelThinkingLevel[];
const DEFAULT_AUTO_EFFORT = "medium" satisfies ModelThinkingLevel;

export type EffortCommandValue = (typeof EFFORT_COMMAND_VALUES)[number];

export const EFFORT_USAGE = "Usage: /effort [low|medium|high|xhigh|max|auto]";

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

function availableThinkingLevels(ctx: ExtensionCommandContext): ModelThinkingLevel[] {
  if (!ctx.model) return [...THINKING_LEVEL_ORDER];
  return getSupportedThinkingLevels(ctx.model);
}

function formatAvailable(levels: readonly ModelThinkingLevel[]): string {
  return levels.filter((level) => level !== "off" && level !== "minimal").join(", ") || "none";
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
  return `effort: ${current} | available: ${formatAvailable(levels)} | ${EFFORT_USAGE}`;
}

export function registerEffortCommand(pi: ExtensionAPI): void {
  pi.registerCommand("effort", {
    description: "Show or change thinking effort: low, medium, high, xhigh, max, or auto",
    getArgumentCompletions: (prefix) => {
      const query = prefix.trim().toLowerCase();
      return EFFORT_COMMAND_VALUES.filter((value) => value.startsWith(query)).map((value) => ({ value, label: value }));
    },
    handler: async (args, ctx) => {
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
