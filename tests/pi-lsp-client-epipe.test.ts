import { describe, expect, it } from "vitest";
import { LspClientTransport } from "../node_modules/pi-lsp-client/src/lsp/transport.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}\n${error.stack ?? ""}`;
  return String(error);
}

describe("pi-lsp-client EPIPE handling", () => {
  it("does not leave an unhandled rejection when an LSP notification write fails asynchronously", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    const client = new LspClientTransport(process.cwd(), {
      id: "epipe-repro",
      command: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
      extensions: [".ts"],
      priority: 0,
    });

    Object.assign(client as unknown as Record<string, unknown>, {
      connection: {
        sendNotification: () => Promise.reject(Object.assign(new Error("write EPIPE"), { code: "EPIPE" })),
      },
      proc: { exitCode: null },
      processExited: false,
    });

    try {
      (client as unknown as { sendNotification: (method: string, params: unknown) => void }).sendNotification("textDocument/didOpen", {});
      await delay(50);

      expect(unhandled.map(errorText).join("\n---\n")).not.toMatch(/EPIPE|ERR_STREAM_DESTROYED|write after end/i);
    } finally {
      process.removeListener("unhandledRejection", onUnhandled);
    }
  });
});
