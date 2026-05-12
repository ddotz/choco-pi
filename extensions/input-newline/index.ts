import type { ExtensionAPI, ExtensionUIDialogOptions } from "@mariozechner/pi-coding-agent";

const INPUT_NEWLINE_PATCHED = Symbol.for("choco.input-newline.patched");

type PatchableInputUi = {
  input: (title: string, placeholder?: string, opts?: ExtensionUIDialogOptions) => Promise<string | undefined>;
  editor: (title: string, prefill?: string) => Promise<string | undefined>;
  [INPUT_NEWLINE_PATCHED]?: true;
};

type InputPatchContext = {
  hasUI: boolean;
  ui?: unknown;
};

function isPatchableInputUi(ui: unknown): ui is PatchableInputUi {
  if (!ui || typeof ui !== "object") return false;
  return typeof Reflect.get(ui, "input") === "function" && typeof Reflect.get(ui, "editor") === "function";
}

function requiresOriginalInputOptions(opts?: ExtensionUIDialogOptions): boolean {
  return !!opts?.signal || opts?.timeout !== undefined;
}

/**
 * Route extension text inputs through Pi's multiline editor.
 *
 * Pi's single-line ExtensionInputComponent treats raw LF (Ctrl+J in tmux) as
 * submit/confirm before the editor newline keybinding can win. choco-pi is one
 * coherent Pi environment, so extension prompts should use the same editor
 * newline behavior as the main prompt instead of keeping a separate one-off
 * input path.
 */
export function patchInputDialogsToMultiline(ctx: InputPatchContext): boolean {
  if (!ctx.hasUI || !isPatchableInputUi(ctx.ui)) return false;

  const ui = ctx.ui;
  if (ui[INPUT_NEWLINE_PATCHED]) return false;

  const originalInput = ui.input.bind(ui);
  const editor = ui.editor.bind(ui);

  const patchedInput: PatchableInputUi["input"] = (title, placeholder, opts) => {
    if (requiresOriginalInputOptions(opts)) return originalInput(title, placeholder, opts);
    return editor(title, undefined);
  };

  Object.defineProperty(ui, "input", {
    value: patchedInput,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(ui, INPUT_NEWLINE_PATCHED, {
    value: true,
    configurable: true,
  });

  return true;
}

export default function inputNewline(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    patchInputDialogsToMultiline(ctx);
  });
}
