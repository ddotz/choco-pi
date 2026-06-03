import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  buildHeadroomCompressCommand,
  buildHeadroomRetrieveCommand,
  formatHeadroomCliResult,
  type HeadroomCommand,
  type HeadroomProcessResult,
} from "./core.ts";

const HeadroomCompressParams = Type.Object({
  content: Type.String({ description: "Text or transcript content to compress with Headroom." }),
});

const HeadroomRetrieveParams = Type.Object({
  hash: Type.String({ description: "24-character hash returned by headroom_compress." }),
  query: Type.Optional(Type.String({ description: "Optional case-insensitive line filter for the stored original content." })),
});

type HeadroomToolAPI = Pick<ExtensionAPI, "registerTool">;

export function runHeadroomCommand(command: HeadroomCommand, signal?: AbortSignal): Promise<HeadroomProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(command.command, command.args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: HeadroomProcessResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.stdin.on("error", (error) => {
      stderr = stderr ? `${stderr}\n${error.message}` : error.message;
    });
    child.on("error", (error) => {
      finish({ exitCode: 127, stdout, stderr: stderr || error.message });
    });
    child.on("close", (code) => {
      finish({ exitCode: code ?? 1, stdout, stderr });
    });

    if (signal) {
      if (signal.aborted) child.kill("SIGTERM");
      signal.addEventListener(
        "abort",
        () => {
          child.kill("SIGTERM");
        },
        { once: true },
      );
    }

    try {
      child.stdin.end(command.stdin);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      finish({ exitCode: 127, stdout, stderr: stderr || message });
    }
  });
}

export function registerHeadroomCompressTool(pi: HeadroomToolAPI): void {
  pi.registerTool({
    name: "headroom_compress",
    label: "Headroom Compress",
    description: "Compress large tool-output style content through the locally installed Headroom MCP compression path.",
    promptSnippet: "Use headroom_compress when the current context, logs, or transcripts need loss-conscious compression before continuing.",
    promptGuidelines: [
      "Pass only the text that needs compression in content.",
      "Treat the returned JSON as the compressed content plus a hash for later retrieval.",
      "Use headroom_retrieve with the returned hash when uncompressed details are needed.",
    ],
    parameters: HeadroomCompressParams,
    renderShell: "self",

    async execute(_toolCallId, params, signal) {
      const command = buildHeadroomCompressCommand({
        content: params.content,
      });
      const result = await runHeadroomCommand(command, signal);
      return {
        content: [{ type: "text", text: formatHeadroomCliResult(result) }],
        details: { command: command.command, args: command.args, exitCode: result.exitCode },
      };
    },
  });

  pi.registerTool({
    name: "headroom_retrieve",
    label: "Headroom Retrieve",
    description: "Retrieve original content that was stored by the Pi headroom_compress tool.",
    promptSnippet: "Use headroom_retrieve with a hash returned by headroom_compress when more original detail is needed.",
    promptGuidelines: [
      "Pass the exact 24-character hash returned by headroom_compress.",
      "Use query only when you need matching original lines instead of the full original content.",
    ],
    parameters: HeadroomRetrieveParams,
    renderShell: "self",

    async execute(_toolCallId, params, signal) {
      const command = buildHeadroomRetrieveCommand({
        hash: params.hash,
        query: params.query,
      });
      const result = await runHeadroomCommand(command, signal);
      return {
        content: [{ type: "text", text: formatHeadroomCliResult(result) }],
        details: { command: command.command, args: command.args, exitCode: result.exitCode },
      };
    },
  });
}

export default function headroomExtension(pi: ExtensionAPI): void {
  registerHeadroomCompressTool(pi);
}
