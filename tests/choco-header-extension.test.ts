import { describe, expect, it, vi } from "vitest";
import chocoHeader from "../extensions/choco-header/index";

type Handler = (event: unknown, ctx: any) => void | Promise<void>;

function registerExtension(getThinkingLevel = vi.fn(() => "xhigh")) {
  const handlers = new Map<string, Handler[]>();
  chocoHeader({
    on: (name: string, handler: Handler) => {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    getThinkingLevel,
  } as never);
  return { handlers, getThinkingLevel };
}

async function emit(handlers: Map<string, Handler[]>, name: string, event: unknown, ctx: any): Promise<void> {
  for (const handler of handlers.get(name) ?? []) await handler(event, ctx);
}

function theme() {
  return {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  };
}

describe("choco startup header extension", () => {
  it("installs a startup header that renders version, model with effort, and cwd", async () => {
    const { handlers } = registerExtension();
    const setHeader = vi.fn();
    const ctx = {
      hasUI: true,
      cwd: "/fallback",
      model: { id: "gpt-5.5", name: "GPT-5.5", provider: "openai-codex" },
      sessionManager: { getCwd: () => "/Users/hyuns" },
      ui: { setHeader },
    };

    await emit(handlers, "session_start", { reason: "startup" }, ctx);

    expect(setHeader).toHaveBeenCalledWith(expect.any(Function));
    const factory = setHeader.mock.calls[0][0];
    const component = factory({ requestRender: vi.fn() }, theme());
    const rendered = component.render(160).join("\n");

    expect(rendered).toContain("│ >_ Choco-Pi (v");
    expect(rendered).toContain("model:");
    expect(rendered).toContain("GPT-5.5 Codex with xhigh effort");
    expect(rendered).toContain("/model: change model");
    expect(rendered).toContain("/effort: change thinking effort");
    expect(rendered).toContain("directory:");
    expect(rendered).toContain("/Users/hyuns");
  });

  it("requests a rerender when model or effort changes and restores the built-in header on shutdown", async () => {
    const { handlers } = registerExtension();
    const setHeader = vi.fn();
    const requestRender = vi.fn();
    const ctx = {
      hasUI: true,
      cwd: "/Users/hyuns",
      model: { id: "gpt-5.5", name: "GPT-5.5", provider: "openai-codex" },
      sessionManager: { getCwd: () => "/Users/hyuns" },
      ui: { setHeader },
    };

    await emit(handlers, "session_start", { reason: "startup" }, ctx);
    setHeader.mock.calls[0][0]({ requestRender }, theme());

    await emit(handlers, "model_select", {}, ctx);
    await emit(handlers, "thinking_level_select", {}, ctx);
    await emit(handlers, "session_shutdown", { reason: "quit" }, ctx);

    expect(requestRender).toHaveBeenCalledTimes(2);
    expect(setHeader).toHaveBeenLastCalledWith(undefined);
  });

  it("does not install a header when no UI is available", async () => {
    const { handlers } = registerExtension();
    const setHeader = vi.fn();

    await emit(handlers, "session_start", { reason: "startup" }, { hasUI: false, ui: { setHeader } });

    expect(setHeader).not.toHaveBeenCalled();
  });
});
