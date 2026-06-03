import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { runUlwHarness } from "../extensions/choco-autopilot/ulw-harness-tool";

const execFileAsync = promisify(execFile);
const describeRealTmux = process.env.CHOCO_PI_REAL_TMUX_SMOKE === "1" ? describe : describe.skip;
let tempCwd: string | undefined;

afterEach(async () => {
  if (tempCwd) await rm(tempCwd, { recursive: true, force: true });
  tempCwd = undefined;
});

async function useTempCwd(): Promise<string> {
  tempCwd = await mkdtemp(join(tmpdir(), "choco-ulw-real-"));
  return tempCwd;
}

async function exec(command: string, args: string[], options: { timeout?: number; signal?: AbortSignal } = {}) {
  try {
    const result = await execFileAsync(command, args, {
      timeout: options.timeout,
      signal: options.signal,
      encoding: "utf8",
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string };
    return { code: typeof err.code === "number" ? err.code : 1, stdout: err.stdout ?? "", stderr: err.stderr ?? err.message };
  }
}

function ctx(cwd: string) {
  return { cwd, sessionManager: { getSessionId: () => "real" } };
}

describeRealTmux("real ulw_harness tmux smoke", () => {
  it("waits for delayed success and records the transcript", async () => {
    const cwd = await useTempCwd();

    const result = await runUlwHarness({ exec, registerCommand() {}, registerTool() {} } as never, "real-delay", {
      action: "tmux-test",
      command: "sleep 0.3; printf DELAYED_OK",
      label: "real delayed",
      timeoutMs: 5000,
    }, undefined, ctx(cwd));

    const evidencePath = join(cwd, ".pi", "ulw", "real", "evidence", "real-delayed.txt");
    const transcript = await readFile(evidencePath, "utf8");

    expect(result.details.result).toMatchObject({ ok: true, action: "tmux-test", evidencePath });
    expect(transcript).toContain("DELAYED_OK");
  });

  it("returns failed on nonzero command exit and records cleanup", async () => {
    const cwd = await useTempCwd();

    const result = await runUlwHarness({ exec, registerCommand() {}, registerTool() {} } as never, "real-fail", {
      action: "tmux-test",
      command: "printf REAL_FAIL; exit 7",
      label: "real failing",
      timeoutMs: 5000,
    }, undefined, ctx(cwd));

    const evidencePath = join(cwd, ".pi", "ulw", "real", "evidence", "real-failing.txt");
    const ledger = await readFile(join(cwd, ".pi", "ulw", "real", "ledger.md"), "utf8");
    const transcript = await readFile(evidencePath, "utf8");

    expect(result.details.result).toMatchObject({ ok: false, reason: "exit code: 7", evidencePath });
    expect(transcript).toContain("REAL_FAIL");
    expect(ledger).toContain("cleanup: tmux kill-session -t choco-ulw-real-real-fail");
  });
});
