import { describe, expect, it, vi } from "vitest";
import { patchInputDialogsToMultiline } from "../extensions/input-newline/index";

describe("input newline patch", () => {
  it("routes extension text input prompts through the multiline editor so Ctrl+J follows editor newline handling", async () => {
    const originalInput = vi.fn(async (_title: string, _placeholder?: string, _opts?: { timeout?: number }) => "single-line");
    const editor = vi.fn(async (_title: string, _prefill?: string) => "first line\nsecond line");
    const ui = { input: originalInput, editor };

    const patched = patchInputDialogsToMultiline({ hasUI: true, ui });
    const result = await ui.input("Add todo", "Describe the task");

    expect(patched).toBe(true);
    expect(result).toBe("first line\nsecond line");
    expect(editor).toHaveBeenCalledWith("Add todo", undefined);
    expect(originalInput).not.toHaveBeenCalled();
  });

  it("falls back to the original input when abort/timeout options are required", async () => {
    const originalInput = vi.fn(async (_title: string, _placeholder?: string, _opts?: { timeout?: number }) => "timed");
    const editor = vi.fn(async (_title: string, _prefill?: string) => "multiline");
    const ui = { input: originalInput, editor };

    patchInputDialogsToMultiline({ hasUI: true, ui });
    const result = await ui.input("Name", "placeholder", { timeout: 1000 });

    expect(result).toBe("timed");
    expect(originalInput).toHaveBeenCalledWith("Name", "placeholder", { timeout: 1000 });
    expect(editor).not.toHaveBeenCalled();
  });

  it("does not patch non-UI contexts", () => {
    const ui = {
      input: vi.fn(async (_title: string, _placeholder?: string, _opts?: { timeout?: number }) => "single-line"),
      editor: vi.fn(async (_title: string, _prefill?: string) => "multiline"),
    };

    expect(patchInputDialogsToMultiline({ hasUI: false, ui })).toBe(false);
  });
});
