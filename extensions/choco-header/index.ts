import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { CHOCO_PI_VERSION } from "../choco-autopilot/version.ts";
import { buildStartupHeaderLines, createStartupHeaderStyle, type MinimalModel } from "./core.ts";

interface HeaderTuiLike {
  requestRender: () => void;
}

function currentCwd(ctx: ExtensionContext): string {
  return ctx.sessionManager.getCwd() || ctx.cwd;
}

function installHeader(ctx: ExtensionContext, version: string, getThinkingLevel: () => string, renderCallbacks: Set<() => void>): void {
  if (!ctx.hasUI) return;

  ctx.ui.setHeader((tui: HeaderTuiLike, theme: Theme) => {
    const requestRender = () => tui.requestRender();
    renderCallbacks.add(requestRender);

    return {
      dispose() {
        renderCallbacks.delete(requestRender);
      },
      invalidate() {},
      render(width: number): string[] {
        return buildStartupHeaderLines(
          {
            version,
            model: ctx.model as MinimalModel | undefined,
            thinkingLevel: getThinkingLevel(),
            cwd: currentCwd(ctx),
          },
          width,
          createStartupHeaderStyle(theme),
        );
      },
    };
  });
}

export default function chocoHeaderExtension(pi: ExtensionAPI): void {
  const renderCallbacks = new Set<() => void>();
  const requestRenderAll = (): void => {
    for (const callback of renderCallbacks) callback();
  };

  pi.on("session_start", (_event, ctx) => {
    installHeader(ctx, CHOCO_PI_VERSION, () => pi.getThinkingLevel(), renderCallbacks);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setHeader(undefined);
    renderCallbacks.clear();
  });

  pi.on("model_select", requestRenderAll);
  pi.on("thinking_level_select", requestRenderAll);
}
