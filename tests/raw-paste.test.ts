import { describe, expect, it } from "vitest";
import { PASTE_END, PASTE_START, RawPasteInputState } from "../extensions/raw-paste/index";

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
});
