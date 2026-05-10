import { existsSync, realpathSync } from "node:fs";
import { sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExtensionAPI, Theme, ToolDefinition } from "@earendil-works/pi-coding-agent";

const ESC = String.fromCharCode(27);
const ANSI_PATTERN = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, "g");
const FOCUS_RESULT_COMPONENT = Symbol.for("ddotz.focus-rendering.result-component");
const RENDER_PATCH_VERSION_KEY = Symbol.for("ddotz.focus-rendering.render-patch-version");
const RESULT_RENDERER_PATCH_VERSION_KEY = Symbol.for("ddotz.focus-rendering.result-renderer-patch-version");
const UPDATE_DISPLAY_PATCH_VERSION_KEY = Symbol.for("ddotz.focus-rendering.update-display-patch-version");
const INTERNAL_SPACER_COMPONENT = Symbol.for("ddotz.focus-rendering.internal-spacer-component");
const RENDER_PATCH_VERSION = 7;

type RenderableComponent = {
  render(width: number): string[];
  invalidate?: () => void;
};

type MutableBox = {
  children?: unknown[];
  paddingY?: number;
  invalidateCache?: () => void;
  invalidate?: () => void;
};

type ToolResultRenderer = NonNullable<ToolDefinition<any, any, any>["renderResult"]>;

type ToolExecutionPrototype = {
  render(width: number): string[];
  updateDisplay?: () => void;
  getResultRenderer?: () => ToolResultRenderer | undefined;
  getRenderShell?: () => "default" | "self";
  contentBox?: MutableBox;
};

type ToolExecutionComponentConstructor = {
  prototype: ToolExecutionPrototype;
};

interface FocusResultState {
  result: { content?: unknown; details?: unknown };
  theme: Theme;
  isError: boolean;
  inner: RenderableComponent | undefined;
  hasExplicitRenderer: boolean;
  suppressWhenRendererEmpty: boolean;
}

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

function textContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } => {
      return !!part && typeof part === "object" && Reflect.get(part, "type") === "text" && typeof Reflect.get(part, "text") === "string";
    })
    .map((part) => part.text)
    .join("\n");
}

function nonEmptyLines(text: string): string[] {
  return text
    .replace(/\s+$/g, "")
    .split("\n")
    .filter((line) => stripAnsi(line).trim().length > 0);
}

function isFooterLine(line: string): boolean {
  const plain = stripAnsi(line).trim();
  if (!plain) return false;
  if (/^\.\.\. \(\d+ (?:more |output )?(?:lines?|matches|results?)(?: hidden)?\)$/i.test(plain)) return true;
  if (/^--- \d+ .*hidden ---$/i.test(plain)) return true;
  if (/^\[\d+ more lines in file\. Use offset=\d+ to continue\.\]$/i.test(plain)) return true;
  if (/^\[Showing lines \d+-\d+ of \d+(?: \([^)]+\))?\. Use offset=\d+ to continue\.\]$/i.test(plain)) return true;
  if (/^\[Showing (?:last .+ of line \d+|lines \d+-\d+ of \d+(?: \([^)]+\))?)\. Full output: .+\]$/i.test(plain)) return true;
  if (/^\[(?:Truncated|.*limit reached|Some lines truncated|More results available|.*total matches|.*indexed files).+\]$/i.test(plain)) return true;
  if (/^Showing \d+ of \d+ .*(?:lines?|matches|results?)(?: · .*expand)?$/i.test(plain)) return true;
  if (/^(No matches found|No files found|Empty file|image\b|\(no output\))/i.test(plain)) return true;
  return false;
}

function isRendererFooterLine(line: string): boolean {
  const plain = stripAnsi(line).trim();
  if (!plain) return false;
  if (/^(?:Took|Elapsed) \d+(?:\.\d+)?s$/i.test(plain)) return true;
  if (/^\[.*(?:Full output:|Truncated:|limit reached|Showing lines|Showing last).+\]$/i.test(plain)) return true;
  return false;
}

function isTruncatedDetails(details: unknown): boolean {
  if (!details || typeof details !== "object") return false;
  const truncation = Reflect.get(details, "truncation");
  return !!(
    Reflect.get(details, "matchLimitReached") ||
    Reflect.get(details, "linesTruncated") ||
    Reflect.get(details, "truncated") ||
    (truncation && typeof truncation === "object" && Reflect.get(truncation, "truncated"))
  );
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function firstTextLine(text: string): string {
  return nonEmptyLines(text)[0] ?? "";
}

function appendUniqueLine(lines: string[], line: string): void {
  if (!lines.some((existing) => stripAnsi(existing) === stripAnsi(line))) {
    lines.push(line);
  }
}

function formatFocusResultLines(result: { content?: unknown; details?: unknown }, theme: Theme, isError: boolean): string[] {
  const output = textContent(result.content);
  if (isError) {
    return [theme.fg("error", firstTextLine(output) || "Tool failed")];
  }

  const lines = nonEmptyLines(output);
  const footerLines = lines.filter(isFooterLine);
  const bodyLineCount = lines.length - footerLines.length;
  const out: string[] = [];

  if (bodyLineCount > 0) {
    out.push(theme.fg("muted", `... (${bodyLineCount} output ${pluralize(bodyLineCount, "line")} hidden)`));
  }

  for (const line of footerLines) appendUniqueLine(out, theme.fg("muted", line));

  if (isTruncatedDetails(result.details) && !out.some((line) => /truncated|limit|full output/i.test(stripAnsi(line)))) {
    out.push(theme.fg("warning", "[Truncated output hidden]"));
  }

  return out;
}

function renderComponentLines(component: RenderableComponent | undefined, width: number): string[] {
  if (!component) return [];
  try {
    return component
      .render(width)
      .flatMap((line) => line.split("\n"))
      .filter((line) => stripAnsi(line).trim().length > 0);
  } catch {
    return [];
  }
}

function isFocusResultComponent(component: unknown): component is FocusResultComponent {
  return !!component && typeof component === "object" && Reflect.get(component, FOCUS_RESULT_COMPONENT) === true;
}

class FocusResultComponent implements RenderableComponent {
  [FOCUS_RESULT_COMPONENT] = true;
  inner: RenderableComponent | undefined;
  private state: FocusResultState;

  constructor(state: FocusResultState) {
    this.state = state;
    this.inner = state.inner;
  }

  update(state: FocusResultState): void {
    this.state = state;
    this.inner = state.inner;
  }

  invalidate(): void {
    this.inner?.invalidate?.();
  }

  render(width: number): string[] {
    const innerLines = renderComponentLines(this.inner, width);
    if (this.state.suppressWhenRendererEmpty && this.state.hasExplicitRenderer && innerLines.length === 0 && !this.state.isError) return [];

    const lines = formatFocusResultLines(this.state.result, this.state.theme, this.state.isError);
    for (const line of innerLines.filter(isRendererFooterLine)) appendUniqueLine(lines, this.state.theme.fg("muted", line));
    return lines;
  }
}

function renderFocusedResult(
  result: { content?: unknown; details?: unknown },
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  context: { lastComponent?: unknown; isError: boolean },
  originalRenderer: ToolResultRenderer | undefined,
  suppressWhenRendererEmpty = false,
): RenderableComponent {
  const previousFocus = isFocusResultComponent(context.lastComponent) ? context.lastComponent : undefined;
  const originalLastComponent = previousFocus?.inner ?? context.lastComponent;
  let inner: RenderableComponent | undefined;

  if (originalRenderer) {
    try {
      inner = originalRenderer(result as never, options, theme, { ...context, lastComponent: originalLastComponent } as never) as RenderableComponent;
    } catch {
      inner = undefined;
    }
  }

  const state: FocusResultState = {
    result,
    theme,
    isError: context.isError,
    inner,
    hasExplicitRenderer: !!originalRenderer,
    suppressWhenRendererEmpty,
  };

  if (previousFocus) {
    previousFocus.update(state);
    return previousFocus;
  }

  return new FocusResultComponent(state);
}

function isInternalSpacerComponent(component: unknown): boolean {
  return !!component && typeof component === "object" && Reflect.get(component, INTERNAL_SPACER_COMPONENT) === true;
}

function restoreDefaultToolBoxPadding(instance: ToolExecutionPrototype): void {
  if (instance.getRenderShell?.() !== "default") return;

  const box = instance.contentBox;
  if (!box) return;

  box.paddingY = 1;
  if (Array.isArray(box.children)) {
    box.children = box.children.filter((child) => !isInternalSpacerComponent(child));
  }
  box.invalidateCache?.();
  box.invalidate?.();
}

function normalizeToolBlockLines(lines: string[]): string[] {
  let firstContentLine = 0;
  while (firstContentLine < lines.length && lines[firstContentLine] === "") firstContentLine += 1;
  const contentLines = lines.slice(firstContentLine);
  if (contentLines.length === 0) return [];
  return ["", ...contentLines];
}

function patchToolExecutionPrototype(prototype: ToolExecutionPrototype, basePrototype?: ToolExecutionPrototype): boolean {
  let patched = false;

  const baseUpdateDisplay = basePrototype?.updateDisplay ?? prototype.updateDisplay;
  if (baseUpdateDisplay && Reflect.get(prototype, UPDATE_DISPLAY_PATCH_VERSION_KEY) !== RENDER_PATCH_VERSION) {
    prototype.updateDisplay = function updateDisplayWithRestoredDefaultToolBoxPadding(this: ToolExecutionPrototype): void {
      baseUpdateDisplay.call(this);
      restoreDefaultToolBoxPadding(this);
    };
    Reflect.set(prototype, UPDATE_DISPLAY_PATCH_VERSION_KEY, RENDER_PATCH_VERSION);
    patched = true;
  }

  if (Reflect.get(prototype, RENDER_PATCH_VERSION_KEY) !== RENDER_PATCH_VERSION) {
    const baseRender = basePrototype?.render ?? prototype.render;
    prototype.render = function renderWithSingleExternalToolSpacer(this: ToolExecutionPrototype, width: number): string[] {
      return normalizeToolBlockLines(baseRender.call(this, width));
    };
    Reflect.set(prototype, RENDER_PATCH_VERSION_KEY, RENDER_PATCH_VERSION);
    patched = true;
  }

  const baseGetResultRenderer = basePrototype?.getResultRenderer ?? prototype.getResultRenderer;
  if (baseGetResultRenderer && Reflect.get(prototype, RESULT_RENDERER_PATCH_VERSION_KEY) !== RENDER_PATCH_VERSION) {
    const focusedGetResultRenderer = function getFocusedResultRenderer(this: ToolExecutionPrototype): ToolResultRenderer | undefined {
      const originalRenderer = baseGetResultRenderer.call(this);
      const suppressWhenRendererEmpty = this.getRenderShell?.() === "self";
      return (result, options, theme, context) => renderFocusedResult(result, options, theme, context, originalRenderer, suppressWhenRendererEmpty) as never;
    };
    prototype.getResultRenderer = focusedGetResultRenderer;
    Reflect.set(prototype, RESULT_RENDERER_PATCH_VERSION_KEY, RENDER_PATCH_VERSION);
    patched = true;
  }

  return patched;
}

function packageRootFromPath(inputPath: string): string | undefined {
  let realPath: string;
  try {
    realPath = realpathSync(inputPath);
  } catch {
    return undefined;
  }

  const parts = realPath.split(sep);
  for (let index = 0; index < parts.length - 2; index += 1) {
    if (parts[index] === "node_modules" && parts[index + 1] === "@earendil-works" && parts[index + 2] === "pi-coding-agent") {
      return parts.slice(0, index + 3).join(sep) || sep;
    }
  }
  return undefined;
}

function toolExecutionPathFromPackageRoot(packageRoot: string): string {
  return [packageRoot, "dist", "modes", "interactive", "components", "tool-execution.js"].join(sep);
}

function toolExecutionCandidatePaths(): string[] {
  const candidates = [
    fileURLToPath(new URL("../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/tool-execution.js", import.meta.url)),
    fileURLToPath(new URL("../../node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/components/tool-execution.js", import.meta.url)),
  ];

  for (const argvPath of process.argv) {
    const packageRoot = packageRootFromPath(argvPath);
    if (packageRoot) candidates.push(toolExecutionPathFromPackageRoot(packageRoot));
  }

  const seen = new Set<string>();
  return candidates
    .filter((candidate) => existsSync(candidate))
    .map((candidate) => realpathSync(candidate))
    .filter((candidate) => {
      if (seen.has(candidate)) return false;
      seen.add(candidate);
      return true;
    });
}

async function installToolExecutionPatches(): Promise<number> {
  let patched = 0;
  for (const candidate of toolExecutionCandidatePaths()) {
    try {
      const moduleUrl = pathToFileURL(candidate).href;
      const mod = (await import(moduleUrl)) as { ToolExecutionComponent?: ToolExecutionComponentConstructor };
      const freshMod = (await import(`${moduleUrl}?ddotzFocusPatch=${RENDER_PATCH_VERSION}-${Date.now()}-${Math.random()}`)) as {
        ToolExecutionComponent?: ToolExecutionComponentConstructor;
      };
      if (mod.ToolExecutionComponent?.prototype && patchToolExecutionPrototype(mod.ToolExecutionComponent.prototype, freshMod.ToolExecutionComponent?.prototype)) patched += 1;
    } catch {
      // Ignore candidates that are not loadable in the current runtime.
    }
  }
  return patched;
}

export default async function focusRendering(pi: ExtensionAPI) {
  await installToolExecutionPatches();

  const applyFocusUi = (ctx: { hasUI: boolean; ui: { setWorkingVisible?: (visible: boolean) => void } }): void => {
    if (ctx.hasUI) ctx.ui.setWorkingVisible?.(false);
  };

  pi.on("session_start", (_event, ctx) => {
    applyFocusUi(ctx);
  });

  pi.on("agent_start", (_event, ctx) => {
    applyFocusUi(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setWorkingVisible(true);
  });
}
