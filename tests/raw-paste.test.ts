import { describe, expect, it } from "vitest";
import { createRawPasteEditorFactory, PASTE_END, PASTE_START, RawPasteInputState } from "../extensions/raw-paste/index";

describe("raw paste input state", () => {
  it("disarms after the first non-paste input", () => {
    const state = new RawPasteInputState();
    state.arm();

    const decision = state.handleInput("x");

    expect(decision.handled).toBe(false);
    expect(state.isActive()).toBe(false);
    expect(state.handleInput(`${PASTE_START}later${PASTE_END}`).handled).toBe(false);
  });

  it("captures only the armed bracketed paste content", () => {
    const state = new RawPasteInputState();
    state.arm();

    const decision = state.handleInput(`${PASTE_START}hello\r\nworld${PASTE_END}`);

    expect(decision.handled).toBe(true);
    expect(decision.pasteContent).toBe("hello\r\nworld");
    expect(state.isActive()).toBe(false);
  });

  it("wraps an existing editor factory instead of replacing it", () => {
    const forwarded: string[] = [];
    const baseEditor = {
      marker: "fff-editor",
      handleInput(data: string) {
        forwarded.push(data);
      },
    };
    let armed = false;
    let controller: { armRawPaste: () => void } | null = null;
    const previousFactory = () => baseEditor;

    const factory = createRawPasteEditorFactory(previousFactory, (nextController) => {
      controller = nextController;
    }, () => {
      armed = true;
    });

    const editor = (factory as (...args: any[]) => typeof baseEditor)({}, {}, {});
    controller!.armRawPaste();
    editor.handleInput(`${PASTE_START}a\r\nb${PASTE_END}!`);

    expect(editor).toBe(baseEditor);
    expect(armed).toBe(true);
    expect(forwarded).toEqual(["a", "\n", "b", "!"]);
  });
});
