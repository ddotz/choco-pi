import { Type } from "typebox";
import { Container, Text } from "@mariozechner/pi-tui";
import { ToolExecutionComponent } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/tool-execution.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { setThemeInstance } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import focusRendering from "../extensions/focus-rendering/index";

interface RenderableComponent {
  render: (width: number) => string[];
}

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => void | Promise<void>;

const testTheme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
  italic: (text: string) => text,
};

const baseToolExecutionRender = ToolExecutionComponent.prototype.render;

function installLegacyBlankLineFilterPatch(): void {
  const prototype = ToolExecutionComponent.prototype as typeof ToolExecutionComponent.prototype & { __chocoFocusRenderingPatched?: boolean };
  prototype.render = function legacyRenderWithoutBlankLines(this: typeof ToolExecutionComponent.prototype, width: number): string[] {
    return baseToolExecutionRender.call(this, width).filter((line) => line.trim() !== "");
  };
  prototype.__chocoFocusRenderingPatched = true;
  Reflect.deleteProperty(prototype, Symbol.for("choco.focus-rendering.render-patch-version"));
  Reflect.deleteProperty(prototype, Symbol.for("choco.focus-rendering.result-renderer-patch-version"));
}

async function setupFocusExtension(): Promise<{
  handlers: Map<string, EventHandler[]>;
}> {
  const handlers = new Map<string, EventHandler[]>();

  await focusRendering({
    on: (event: string, handler: EventHandler) => {
      const existing = handlers.get(event) ?? [];
      existing.push(handler);
      handlers.set(event, existing);
    },
    registerTool: vi.fn(),
  } as never);

  return { handlers };
}

async function emit(
  handlers: Map<string, EventHandler[]>,
  eventName: string,
  event: Record<string, unknown>,
  ctx: Record<string, unknown>,
): Promise<void> {
  for (const handler of handlers.get(eventName) ?? []) await handler(event, ctx);
}

function renderedLines(component: RenderableComponent): string[] {
  return component.render(160).flatMap((line) => line.split("\n"));
}

function renderedText(component: RenderableComponent): string {
  return renderedLines(component).join("\n").trim();
}

function ui() {
  return { requestRender: vi.fn() };
}

beforeAll(() => {
  setThemeInstance(testTheme as never);
});

describe("focus rendering", () => {
  it("upgrades legacy focus patches on reload so visible tool blocks keep one external spacer and regain inner padding", async () => {
    installLegacyBlankLineFilterPatch();
    await setupFocusExtension();

    const visibleTool = {
      name: "visible",
      label: "Visible",
      description: "visible tool",
      parameters: Type.Object({}),
      async execute() {
        return { content: [], details: undefined };
      },
      renderCall() {
        return new Text("visible header", 0, 0);
      },
    };

    const visibleBlock = new ToolExecutionComponent("visible", "visible-legacy", {}, {}, visibleTool, ui() as never, "/repo");
    const contentBox = (visibleBlock as unknown as { contentBox: { paddingY: number; children: unknown[] } }).contentBox;
    const internalSpacerKey = Symbol.for("choco.focus-rendering.internal-spacer-component");

    expect(contentBox.paddingY).toBe(1);
    expect(contentBox.children.some((child) => !!child && typeof child === "object" && Reflect.get(child, internalSpacerKey) === true)).toBe(false);

    const visibleLines = visibleBlock.render(80);
    expect(visibleLines).toHaveLength(4);
    expect(visibleLines[0]).toBe("");
    expect(visibleLines[1]).not.toBe("");
    expect(visibleLines[1]?.trim()).toBe("");
    expect(visibleLines[2]?.trim()).toBe("visible header");
    expect(visibleLines[3]).not.toBe("");
    expect(visibleLines[3]?.trim()).toBe("");
  });

  it("wraps an already-registered grep renderer, keeping its header while hiding matched/context output lines", async () => {
    await setupFocusExtension();

    const fffGrepTool = {
      name: "grep",
      label: "grep (fff)",
      description: "FFF grep override",
      parameters: Type.Object({}),
      async execute() {
        return { content: [], details: undefined };
      },
      renderCall(args: unknown, theme: typeof testTheme, context: { lastComponent?: RenderableComponent }) {
        const renderArgs = args as Record<string, unknown>;
        const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
        text.setText(`${theme.fg("toolTitle", theme.bold("grep"))} ${theme.fg("accent", `/${String(renderArgs.pattern)}/`)}${theme.fg("toolOutput", ` limit ${String(renderArgs.limit)}`)}`);
        return text;
      },
      renderResult(_result: unknown, _options: unknown, theme: typeof testTheme, context: { lastComponent?: RenderableComponent }) {
        const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
        text.setText(
          [
            "",
            theme.fg("toolOutput", "interactive-mode.js-119- editorContainer;"),
            theme.fg("toolOutput", "interactive-mode.js:127: loadingAnimation = undefined;"),
            theme.fg("muted", "... (580 more lines)"),
          ].join("\n"),
        );
        return text;
      },
    };

    const block = new ToolExecutionComponent(
      "grep",
      "grep-1",
      { pattern: "loadingAnimation", path: "/repo/src/interactive-mode.js", limit: 100 },
      {},
      fffGrepTool as never,
      ui() as never,
      "/repo",
    );
    block.updateResult(
      {
        content: [
          {
            type: "text",
            text: [
              "interactive-mode.js-119- editorContainer;",
              "interactive-mode.js:127: loadingAnimation = undefined;",
              "[100 matches limit reached. Use limit=200 for more]",
            ].join("\n"),
          },
        ],
        details: {},
        isError: false,
      },
      false,
    );

    const text = renderedText(block);
    expect(text).toContain("grep");
    expect(text).toContain("/loadingAnimation/");
    expect(text).toContain("limit 100");
    expect(text).not.toContain("editorContainer");
    expect(text).not.toContain("loadingAnimation = undefined");
    expect(text).toContain("output lines hidden");
    expect(text).toContain("[100 matches limit reached. Use limit=200 for more]");

    const lines = renderedLines(block);
    expect(lines[0]).toBe("");
    expect(lines[1]).not.toBe("");
    expect(lines[1]?.trim()).toBe("");
    expect(lines[2]).toContain("grep");
    expect(lines.at(-1)).not.toBe("");
    expect(lines.at(-1)?.trim()).toBe("");
    expect(lines.filter((line) => line === "")).toHaveLength(1);
  });

  it("keeps read continuation footers while hiding read output body", async () => {
    await setupFocusExtension();

    const block = new ToolExecutionComponent("read", "read-1", { path: "AGENTS.md" }, {}, undefined, ui() as never, "/repo");
    block.updateResult(
      {
        content: [
          {
            type: "text",
            text: [
              "## Structural Execution Gate",
              "- This gate is non-negotiable.",
              "[7 more lines in file. Use offset=49 to continue.]",
            ].join("\n"),
          },
        ],
        details: {},
        isError: false,
      },
      false,
    );

    const text = renderedText(block);
    expect(text).not.toContain("Structural Execution Gate");
    expect(text).not.toContain("non-negotiable");
    expect(text).toContain("output lines hidden");
    expect(text).toContain("[7 more lines in file. Use offset=49 to continue.]");
  });

  it("does not misclassify source-code lines containing footer words as footers", async () => {
    await setupFocusExtension();

    const block = new ToolExecutionComponent("read", "read-2", { path: "index.ts" }, {}, undefined, ui() as never, "/repo");
    block.updateResult(
      {
        content: [
          {
            type: "text",
            text: [
              "if (/lines?\\s+hidden/i.test(plain)) return true;",
              "if (/\\b(showing|truncated|limit reached|to expand|continue|offset=)\\b/i.test(plain)) return true;",
              "out.push(theme.fg(\"muted\", `... (${bodyLineCount} output ${pluralize(bodyLineCount, \"line\")} hidden)`));",
              "[7 more lines in file. Use offset=49 to continue.]",
            ].join("\n"),
          },
        ],
        details: {},
        isError: false,
      },
      false,
    );

    const text = renderedText(block);
    expect(text).toContain("output lines hidden");
    expect(text).toContain("[7 more lines in file. Use offset=49 to continue.]");
    expect(text).not.toContain("return true");
    expect(text).not.toContain("bodyLineCount");
  });

  it("hides bash output body while preserving the renderer-generated footer", async () => {
    await setupFocusExtension();

    const block = new ToolExecutionComponent("bash", "bash-1", { command: "node -e \"console.log('body')\"" }, {}, undefined, ui() as never, "/repo");
    block.markExecutionStarted();
    block.updateResult(
      {
        content: [{ type: "text", text: "node body output" }],
        details: undefined,
        isError: false,
      },
      false,
    );

    const text = renderedText(block);
    expect(text).toContain("$ node -e");
    expect(text).not.toContain("node body output");
    expect(text).toContain("output line hidden");
    expect(text).toMatch(/Took \d+(?:\.\d+)?s/);
  });

  it("hides the built-in working loader to avoid bottom status spacing", async () => {
    const { handlers } = await setupFocusExtension();
    const setWorkingVisible = vi.fn();
    const ctx = { cwd: "/repo", hasUI: true, ui: { setWorkingVisible } };

    await emit(handlers, "session_start", {}, ctx);
    await emit(handlers, "agent_start", {}, ctx);

    expect(setWorkingVisible).toHaveBeenCalledWith(false);
    expect(setWorkingVisible).toHaveBeenCalledTimes(2);
  });

  it("keeps one external spacer for visible tool boxes while hiding fully empty todo-style blocks", async () => {
    await setupFocusExtension();

    const emptyTool = {
      name: "todo",
      label: "Todo",
      description: "hidden todo",
      parameters: Type.Object({}),
      renderShell: "self" as const,
      async execute() {
        return { content: [], details: undefined };
      },
      renderCall() {
        return new Container();
      },
      renderResult() {
        return new Container();
      },
    };
    const visibleTool = {
      ...emptyTool,
      name: "visible",
      renderCall() {
        return new Text("visible header", 0, 0);
      },
    };

    const emptyBlock = new ToolExecutionComponent("todo", "todo-1", {}, {}, emptyTool, ui() as never, "/repo");
    emptyBlock.updateResult({ content: [{ type: "text", text: "Added #1" }], details: undefined, isError: false }, false);
    expect(emptyBlock.render(80)).toEqual([]);

    const visibleBlock = new ToolExecutionComponent("visible", "visible-1", {}, {}, visibleTool, ui() as never, "/repo");
    const visibleLines = visibleBlock.render(80);
    expect(visibleLines).toHaveLength(2);
    expect(visibleLines[0]).toBe("");
    expect(visibleLines[1]?.trim()).toBe("visible header");
  });
});
