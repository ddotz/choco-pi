import { describe, expect, it } from "vitest";
import {
  buildHeadroomCompressCommand,
  buildHeadroomRetrieveCommand,
  formatHeadroomCliResult,
  normalizeHeadroomHash,
  normalizeHeadroomContent,
} from "../extensions/headroom/core.ts";
import { registerHeadroomCompressTool, runHeadroomCommand } from "../extensions/headroom/index.ts";

describe("headroom Pi extension", () => {
  it("builds a deterministic Python API command for compression", () => {
    const command = buildHeadroomCompressCommand({
      content: "alpha\nbeta\n",
      pythonPath: "/tmp/headroom-python",
    });

    expect(command.command).toBe("/tmp/headroom-python");
    expect(command.args[0]).toBe("-c");
    expect(command.args[1]).toContain("HeadroomMCPServer");
    expect(JSON.parse(command.stdin)).toEqual({
      action: "compress",
      content: "alpha\nbeta\n",
    });
  });

  it("builds a deterministic retrieve command", () => {
    const command = buildHeadroomRetrieveCommand({
      hash: "ABCDEF123456ABCDEF123456",
      query: "beta",
      pythonPath: "/tmp/headroom-python",
    });

    expect(command.command).toBe("/tmp/headroom-python");
    expect(JSON.parse(command.stdin)).toEqual({
      action: "retrieve",
      hash: "abcdef123456abcdef123456",
      query: "beta",
    });
  });

  it("rejects empty content before spawning headroom", () => {
    expect(() => normalizeHeadroomContent(" \n\t")).toThrow("content is required");
  });

  it("rejects invalid retrieval hashes before spawning headroom", () => {
    expect(() => normalizeHeadroomHash("../not-a-hash")).toThrow("hash must be 24 hex characters");
  });

  it("formats stdout and stderr from headroom CLI", () => {
    expect(formatHeadroomCliResult({ exitCode: 0, stdout: "saved 42 tokens\n", stderr: "" })).toBe("saved 42 tokens");
    expect(formatHeadroomCliResult({ exitCode: 2, stdout: "", stderr: "bad input\n" })).toBe("headroom exited 2: bad input");
  });

  it("registers the Pi tool", () => {
    const registeredNames: string[] = [];
    registerHeadroomCompressTool({
      registerTool(tool) {
        registeredNames.push(tool.name);
      },
    });

    expect(registeredNames).toEqual(["headroom_compress", "headroom_retrieve"]);
  });

  it("captures command output for the registered runner", async () => {
    const result = await runHeadroomCommand({
      command: process.execPath,
      args: ["-e", "process.stdin.pipe(process.stdout)"],
      stdin: "round-trip",
    });

    expect(result).toEqual({ exitCode: 0, stdout: "round-trip", stderr: "" });
  });

  it("reports missing command failures without throwing", async () => {
    const result = await runHeadroomCommand({
      command: "/tmp/not-headroom-python",
      args: [],
      stdin: "",
    });

    expect(result.exitCode).toBe(127);
    expect(result.stderr).toContain("not-headroom-python");
  });
});
