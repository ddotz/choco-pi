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

export interface RawPasteCompatibleEditor {
  handleInput(data: string): void;
}

type RawPasteEditorFactory = (...args: CustomEditorConstructorArgs) => any;

export class RawPasteEditorController {
  private readonly rawPasteState = new RawPasteInputState();
  private attachedEditor: RawPasteCompatibleEditor | null = null;
  private originalHandleInput: ((data: string) => void) | null = null;

  constructor(private readonly onArm?: () => void) {}

  armRawPaste(): void {
    this.rawPasteState.arm();
    this.onArm?.();
  }

  disarmRawPaste(): void {
    this.rawPasteState.disarm();
  }

  attach<T extends RawPasteCompatibleEditor>(editor: T): T {
    this.attachedEditor = editor;
    this.originalHandleInput = editor.handleInput.bind(editor);
    editor.handleInput = (data: string) => {
      if (this.rawPasteState.isActive() && this.handleRawPasteInput(data)) {
        return;
      }
      this.originalHandleInput?.(data);
    };
    return editor;
  }

  private forwardInput(data: string): void {
    this.originalHandleInput?.(data);
  }

  private flushRawPaste(content: string): void {
    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    for (const char of normalized) {
      this.forwardInput(char);
    }
  }

  private handleRawPasteInput(data: string): boolean {
    const decision = this.rawPasteState.handleInput(data);
    if (!decision.handled) return false;

    if (decision.passthroughPrefix) {
      this.forwardInput(decision.passthroughPrefix);
    }
    if (decision.pasteContent) {
      this.flushRawPaste(decision.pasteContent);
    }
    if (decision.remaining) {
      this.attachedEditor?.handleInput(decision.remaining);
    }

    return true;
  }
}

export function createRawPasteEditorFactory(
  previousFactory: RawPasteEditorFactory | undefined,
  onController: (controller: RawPasteEditorController) => void,
  onArm?: () => void,
): RawPasteEditorFactory {
  return (tui, theme, keybindings) => {
    const controller = new RawPasteEditorController(onArm);
    onController(controller);
    const editor = previousFactory ? previousFactory(tui, theme, keybindings) : new CustomEditor(tui, theme, keybindings);
    return controller.attach(editor);
  };
}

export default function rawPaste(pi: ExtensionAPI) {
  let controller: RawPasteEditorController | null = null;

  const notifyArmed = (ctx: ExtensionContext): void => {
    if (!ctx.hasUI) return;
    ctx.ui.notify("Raw paste armed. Paste now to insert the full content.", "info");
  };

  const armRawPaste = (ctx: ExtensionContext): void => {
    if (!controller) {
      if (ctx.hasUI) {
        ctx.ui.notify("Raw paste editor is not ready.", "warning");
      }
      return;
    }

    controller.armRawPaste();
  };

  const cancelRawPaste = (ctx: ExtensionContext): void => {
    controller?.disarmRawPaste();
    if (ctx.hasUI) ctx.ui.notify("Raw paste cancelled.", "info");
  };

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;

    const previousFactory = ctx.ui.getEditorComponent?.() as RawPasteEditorFactory | undefined;
    ctx.ui.setEditorComponent(createRawPasteEditorFactory(previousFactory, (nextController) => {
      controller = nextController;
    }, () => notifyArmed(ctx)));
  });

  pi.on("session_shutdown", () => {
    controller = null;
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
