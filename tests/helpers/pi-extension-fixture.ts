import { vi } from "vitest";

export interface RegisteredTool {
  name: string;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    ctx: { cwd: string },
  ) => Promise<{ content: Array<{ type: string; text: string }>; details?: unknown }>;
}

export interface RegisteredCommand {
  handler: (args: string, ctx: unknown) => Promise<void>;
}

export interface PiExtensionFixture {
  tools: Map<string, RegisteredTool>;
  commands: Map<string, RegisteredCommand>;
  handlers: Map<string, Array<(event: unknown, ctx: unknown) => unknown>>;
}

export function createPiExtensionFixture(register: (api: never) => void): PiExtensionFixture {
  const tools = new Map<string, RegisteredTool>();
  const commands = new Map<string, RegisteredCommand>();
  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>();

  register({
    on: (name: string, handler: (event: unknown, ctx: unknown) => unknown) => {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    registerCommand: (name: string, definition: RegisteredCommand) => {
      commands.set(name, definition);
    },
    registerTool: (definition: RegisteredTool) => {
      tools.set(definition.name, definition);
    },
    sendUserMessage: vi.fn(),
    sendMessage: vi.fn(),
    exec: vi.fn(),
    getFlag: vi.fn(),
    getThinkingLevel: vi.fn(() => "medium"),
    setThinkingLevel: vi.fn(),
  } as never);

  return { tools, commands, handlers };
}
