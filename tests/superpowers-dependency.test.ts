import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import ddotzAutopilot from "../extensions/ddotz-autopilot/index";
import { SUPERPOWERS_REPO_URL, ensureSuperpowersDependency } from "../extensions/ddotz-autopilot/superpowers-dependency";

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
  killed: boolean;
}

type ExecMock = ReturnType<typeof vi.fn<(...args: [string, string[], Record<string, unknown>?]) => Promise<ExecResult>>>;
type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown | Promise<unknown>;

let tempAgentDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  delete process.env.DDOTZ_PI_SUPERPOWERS_INSTALL_PATH;
  delete process.env.DDOTZ_PI_SUPERPOWERS_DISABLE_GLOBAL;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<string> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "ddotz-pi-superpowers-test-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
  return tempAgentDir;
}

function setupAutopilot(exec: ExecMock): { handlers: Map<string, EventHandler[]> } {
  const handlers = new Map<string, EventHandler[]>();
  ddotzAutopilot({
    on: (event: string, handler: EventHandler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerCommand: vi.fn(),
    registerTool: vi.fn(),
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
    exec,
    getFlag: vi.fn(),
  } as never);
  return { handlers };
}

async function emitCollect(handlers: Map<string, EventHandler[]>, eventName: string, event: Record<string, unknown>, ctx: Record<string, unknown>): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const handler of handlers.get(eventName) ?? []) results.push(await handler(event, ctx));
  return results;
}

describe("superpowers dependency", () => {
  it("clones the upstream superpowers repo unchanged when no install exists", async () => {
    const agentDir = await useTempAgentDir();
    const installPath = join(agentDir, "ddotz-pi", "deps", "superpowers");
    const exec = vi.fn(async (command: string, args: string[]): Promise<ExecResult> => {
      if (command === "git" && args[0] === "clone") {
        await mkdir(join(installPath, "using-superpowers"), { recursive: true });
        await writeFile(join(installPath, "using-superpowers", "SKILL.md"), "---\nname: using-superpowers\ndescription: Use skills.\n---\n", "utf8");
        return { code: 0, stdout: "", stderr: "", killed: false };
      }
      throw new Error(`Unexpected exec: ${command} ${args.join(" ")}`);
    });

    const result = await ensureSuperpowersDependency({ exec } as never, { installPath, candidatePaths: [] });

    expect(result.status).toBe("installed");
    expect(result.skillPath).toBe(installPath);
    expect(exec).toHaveBeenCalledWith("git", ["clone", "--depth", "1", SUPERPOWERS_REPO_URL, installPath], expect.any(Object));
  });

  it("reuses an existing external superpowers checkout without cloning", async () => {
    const agentDir = await useTempAgentDir();
    const existingPath = join(agentDir, "external", "superpowers");
    await mkdir(join(existingPath, "using-superpowers"), { recursive: true });
    await writeFile(join(existingPath, "using-superpowers", "SKILL.md"), "---\nname: using-superpowers\ndescription: Use skills.\n---\n", "utf8");
    const exec = vi.fn(async (): Promise<ExecResult> => ({ code: 0, stdout: "", stderr: "", killed: false }));

    const result = await ensureSuperpowersDependency({ exec } as never, { installPath: join(agentDir, "managed", "superpowers"), candidatePaths: [existingPath] });

    expect(result.status).toBe("present");
    expect(result.skillPath).toBe(existingPath);
    expect(exec).not.toHaveBeenCalled();
  });

  it("contributes the installed superpowers skill path during Pi resource discovery", async () => {
    const agentDir = await useTempAgentDir();
    const installPath = join(agentDir, "ddotz-pi", "deps", "superpowers");
    process.env.DDOTZ_PI_SUPERPOWERS_INSTALL_PATH = installPath;
    process.env.DDOTZ_PI_SUPERPOWERS_DISABLE_GLOBAL = "1";
    const exec = vi.fn(async (command: string, args: string[]): Promise<ExecResult> => {
      if (command === "git" && args[0] === "clone") {
        await mkdir(join(installPath, "using-superpowers"), { recursive: true });
        await writeFile(join(installPath, "using-superpowers", "SKILL.md"), "---\nname: using-superpowers\ndescription: Use skills.\n---\n", "utf8");
        return { code: 0, stdout: "", stderr: "", killed: false };
      }
      throw new Error(`Unexpected exec: ${command} ${args.join(" ")}`);
    });
    const { handlers } = setupAutopilot(exec);
    const notify = vi.fn();

    const results = await emitCollect(handlers, "resources_discover", { reason: "startup" }, { hasUI: true, ui: { notify } });

    expect(results).toContainEqual({ skillPaths: [installPath] });
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Installed superpowers skills from upstream"), "info");
    expect(await readFile(join(installPath, "using-superpowers", "SKILL.md"), "utf8")).toContain("using-superpowers");
  });
});
