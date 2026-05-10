import { CustomEditor, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * Raw paste owns only the editor component. It has no focus-rendering order dependency.
 */
export const PASTE_START = "\x1b[200~";
export const PASTE_END = "\x1b[201~";
const PASTE_END_LEN = PASTE_END.length;

type CustomEditorConstructorArgs = ConstructorParameters<typeof CustomEditor>;

export interface RawPasteInputDecision {
  handled: boolean;
  passthroughPrefix?: string;
  pasteContent?: string;
  remaining?: string;
}

export class RawPasteInputState {
  private rawPasteArmed = false;
  private rawPasteBuffer = "";
  private isInRawPaste = false;

  arm(): void {
    this.rawPasteArmed = true;
  }

  disarm(): void {
    this.rawPasteArmed = false;
    this.rawPasteBuffer = "";
    this.isInRawPaste = false;
  }

  isActive(): boolean {
    return this.rawPasteArmed || this.isInRawPaste;
  }

  handleInput(data: string): RawPasteInputDecision {
    if (!this.rawPasteArmed && !this.isInRawPaste) return { handled: false };

    if (!this.isInRawPaste) {
      const startIndex = data.indexOf(PASTE_START);
      if (startIndex === -1) {
        this.disarm();
        return { handled: false };
      }

      this.isInRawPaste = true;
      this.rawPasteBuffer = data.slice(startIndex + PASTE_START.length);
      const endIndex = this.rawPasteBuffer.indexOf(PASTE_END);
      if (endIndex !== -1) return this.completeRawPaste(endIndex, data.slice(0, startIndex));
      return { handled: true, passthroughPrefix: data.slice(0, startIndex) };
    }

    this.rawPasteBuffer += data;
    const endIndex = this.rawPasteBuffer.indexOf(PASTE_END);
    if (endIndex !== -1) return this.completeRawPaste(endIndex);
    return { handled: true };
  }

  private completeRawPaste(endIndex: number, passthroughPrefix?: string): RawPasteInputDecision {
    const pasteContent = this.rawPasteBuffer.slice(0, endIndex);
    const remaining = this.rawPasteBuffer.slice(endIndex + PASTE_END_LEN);
    this.rawPasteBuffer = "";
    this.isInRawPaste = false;
    this.rawPasteArmed = false;
    return { handled: true, passthroughPrefix, pasteContent, remaining };
  }
}

class RawPasteEditor extends CustomEditor {
  private readonly rawPasteState = new RawPasteInputState();

  constructor(
    tui: CustomEditorConstructorArgs[0],
    theme: CustomEditorConstructorArgs[1],
    keybindings: CustomEditorConstructorArgs[2],
    private readonly onArm?: () => void,
  ) {
    super(tui, theme, keybindings);
  }

  armRawPaste(): void {
    this.rawPasteState.arm();
    this.onArm?.();
  }

  disarmRawPaste(): void {
    this.rawPasteState.disarm();
  }

  private flushRawPaste(content: string): void {
    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    for (const char of normalized) {
      super.handleInput(char);
    }
  }

  private handleRawPasteInput(data: string): boolean {
    const decision = this.rawPasteState.handleInput(data);
    if (!decision.handled) return false;

    if (decision.passthroughPrefix) {
      super.handleInput(decision.passthroughPrefix);
    }
    if (decision.pasteContent) {
      this.flushRawPaste(decision.pasteContent);
    }
    if (decision.remaining) {
      this.handleInput(decision.remaining);
    }

    return true;
  }

  override handleInput(data: string): void {
    if (this.rawPasteState.isActive() && this.handleRawPasteInput(data)) {
      return;
    }

    super.handleInput(data);
  }
}

export default function rawPaste(pi: ExtensionAPI) {
  let editor: RawPasteEditor | null = null;

  const notifyArmed = (ctx: ExtensionContext): void => {
    if (!ctx.hasUI) return;
    ctx.ui.notify("Raw paste armed. Paste now to insert the full content.", "info");
  };

  const armRawPaste = (ctx: ExtensionContext): void => {
    if (!editor) {
      if (ctx.hasUI) {
        ctx.ui.notify("Raw paste editor is not ready.", "warning");
      }
      return;
    }

    editor.armRawPaste();
  };

  const cancelRawPaste = (ctx: ExtensionContext): void => {
    editor?.disarmRawPaste();
    if (ctx.hasUI) ctx.ui.notify("Raw paste cancelled.", "info");
  };

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;

    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      editor = new RawPasteEditor(tui, theme, keybindings, () => notifyArmed(ctx));
      return editor;
    });
  });

  pi.on("session_shutdown", () => {
    editor = null;
  });

  pi.registerCommand("paste", {
    description: "Arm raw paste so the next bracketed paste is inserted as full visible editor content; use /paste cancel to disarm",
    handler: async (args: string, ctx) => {
      if (args.trim() === "cancel") {
        cancelRawPaste(ctx);
        return;
      }
      armRawPaste(ctx);
    },
  });
}
