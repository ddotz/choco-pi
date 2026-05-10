import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";

const ReloadRuntimeParams = Type.Object({});

export const RELOAD_RUNTIME_TOOL_NAME = "reload_runtime";
export const RELOAD_RUNTIME_COMMAND_NAME = "reload-runtime";

export type ReloadRuntimeMode = "direct" | "editor-prefill" | "unavailable";

export interface ReloadRuntimeDetails {
  mode: ReloadRuntimeMode;
  reloaded: boolean;
  command: string;
  reason?: string;
}

function reloadFromToolContext(ctx: ExtensionContext): (() => Promise<void>) | undefined {
  const maybeReload = (ctx as ExtensionContext & { reload?: unknown }).reload;
  return typeof maybeReload === "function" ? maybeReload.bind(ctx) as () => Promise<void> : undefined;
}

export function createReloadRuntimeTool(): ToolDefinition<typeof ReloadRuntimeParams, ReloadRuntimeDetails, unknown> {
  return {
    name: RELOAD_RUNTIME_TOOL_NAME,
    label: "Reload runtime",
    description: "Reload Pi extensions, skills, prompts, and themes without starting a new session when the runtime exposes reload; otherwise prepare the reload command visibly.",
    promptSnippet: "reload_runtime: try to reload extensions, skills, prompts, and themes without starting a new session; if direct reload is unavailable, it prepares /reload-runtime in the editor.",
    promptGuidelines: [
      "Use reload_runtime after changing Pi extensions, skills, prompts, or themes. If it reports editor-prefill, direct tool-initiated reload is unavailable in this Pi runtime and the user must press Enter.",
    ],
    parameters: ReloadRuntimeParams,
    async execute(_toolCallId: string, _params: Record<string, never>, _signal: AbortSignal | undefined, _onUpdate: undefined, ctx: ExtensionContext) {
      const command = `/${RELOAD_RUNTIME_COMMAND_NAME}`;
      const reload = reloadFromToolContext(ctx);
      if (reload) {
        await reload();
        return {
          content: [{ type: "text", text: "Reloaded Pi runtime without starting a new session." }],
          details: { mode: "direct", reloaded: true, command },
          terminate: true,
        };
      }

      if (ctx.hasUI) {
        ctx.ui.setEditorText(command);
        ctx.ui.notify(`Direct tool reload is unavailable in this Pi runtime. Press Enter to execute: ${command}`, "warning");
        return {
          content: [{ type: "text", text: `Prepared ${command} in the editor because this Pi runtime does not expose reload() to tools.` }],
          details: {
            mode: "editor-prefill",
            reloaded: false,
            command,
            reason: "ExtensionContext does not expose reload(); slash commands sent via sendUserMessage skip command routing.",
          },
          terminate: true,
        };
      }

      return {
        content: [{ type: "text", text: `Cannot reload from a tool in this non-interactive Pi runtime. Run ${command}.` }],
        details: {
          mode: "unavailable",
          reloaded: false,
          command,
          reason: "ExtensionContext does not expose reload() and no UI is available for command prefill.",
        },
        terminate: true,
      };
    },
  };
}

export function registerRuntimeReload(pi: Pick<ExtensionAPI, "registerCommand" | "registerTool">): void {
  pi.registerCommand(RELOAD_RUNTIME_COMMAND_NAME, {
    description: "Reload extensions, skills, prompts, and themes without starting a new session",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      await ctx.reload();
      return;
    },
  });

  pi.registerTool(createReloadRuntimeTool());
}
