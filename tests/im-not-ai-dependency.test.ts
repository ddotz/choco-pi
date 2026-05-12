import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import ddotzAutopilot from "../extensions/ddotz-autopilot/index";
import { IM_NOT_AI_REPO_URL, ensureImNotAiDependency } from "../extensions/ddotz-autopilot/im-not-ai-dependency";

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
  delete process.env.DDOTZ_PI_IM_NOT_AI_INSTALL_PATH;
  delete process.env.DDOTZ_PI_IM_NOT_AI_DISABLE_GLOBAL;
  if (tempAgentDir) await rm(tempAgentDir, { recursive: true, force: true });
  tempAgentDir = undefined;
});

async function useTempAgentDir(): Promise<string> {
  tempAgentDir = await mkdtemp(join(tmpdir(), "ddotz-pi-im-not-ai-"));
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
  return tempAgentDir;
}

async function writeHumanizeSkill(skillRoot: string): Promise<void> {
  await mkdir(join(skillRoot, "humanize-korean"), { recursive: true });
  await writeFile(join(skillRoot, "humanize-korean", "SKILL.md"), "---\nname: humanize-korean\ndescription: Humanize Korean text.\n---\n", "utf8");
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

describe("im-not-ai dependency", () => {
  it("reuses an existing Codex plugin cache skill root without cloning", async () => {
    const agentDir = await useTempAgentDir();
    const codexPluginSkillRoot = join(agentDir, "codex", "plugins", "cache", "epoko77-ai", "im-not-ai", "local", "skills");
    await writeHumanizeSkill(codexPluginSkillRoot);
    const exec = vi.fn(async (): Promise<ExecResult> => ({ code: 0, stdout: "", stderr: "", killed: false }));

    const result = await ensureImNotAiDependency({ exec } as never, {
      installPath: join(agentDir, "managed", "im-not-ai"),
      candidatePaths: [{ path: codexPluginSkillRoot, autoDiscovered: false }],
    });

    expect(result.status).toBe("present");
    expect(result.skillPath).toBe(join(codexPluginSkillRoot, "humanize-korean"));
    expect(result.contribution).toEqual({ skillPaths: [codexPluginSkillRoot] });
    expect(exec).not.toHaveBeenCalled();
  });

  it("does not contribute a Pi auto-discovered humanize-korean skill", async () => {
    const agentDir = await useTempAgentDir();
    const autoSkill = join(agentDir, "skills", "humanize-korean");
    await mkdir(autoSkill, { recursive: true });
    await writeFile(join(autoSkill, "SKILL.md"), "---\nname: humanize-korean\ndescription: Humanize Korean text.\n---\n", "utf8");
    const exec = vi.fn(async (): Promise<ExecResult> => ({ code: 0, stdout: "", stderr: "", killed: false }));

    const result = await ensureImNotAiDependency({ exec } as never, {
      installPath: join(agentDir, "managed", "im-not-ai"),
      candidatePaths: [{ path: autoSkill, autoDiscovered: true }],
    });

    expect(result.status).toBe("present");
    expect(result.skillPath).toBe(autoSkill);
    expect(result.contribution).toBeUndefined();
    expect(exec).not.toHaveBeenCalled();
  });

  it("clones the upstream im-not-ai repo unchanged when no install exists", async () => {
    const agentDir = await useTempAgentDir();
    const installPath = join(agentDir, "ddotz-pi", "deps", "im-not-ai");
    const skillRoot = join(installPath, ".claude", "skills");
    const exec = vi.fn(async (command: string, args: string[]): Promise<ExecResult> => {
      if (command === "git" && args[0] === "clone") {
        await writeHumanizeSkill(skillRoot);
        await writeFile(join(installPath, "README.md"), "# upstream repo root, not a Pi skill\n", "utf8");
        return { code: 0, stdout: "", stderr: "", killed: false };
      }
      throw new Error(`Unexpected exec: ${command} ${args.join(" ")}`);
    });

    const result = await ensureImNotAiDependency({ exec } as never, { installPath, candidatePaths: [] });

    expect(result.status).toBe("installed");
    expect(result.skillPath).toBe(join(skillRoot, "humanize-korean"));
    expect(result.contribution).toEqual({ skillPaths: [skillRoot] });
    expect(exec).toHaveBeenCalledWith("git", ["clone", "--depth", "1", IM_NOT_AI_REPO_URL, installPath], expect.any(Object));
  });

  it("contributes an existing im-not-ai skill path during Pi resource discovery", async () => {
    const agentDir = await useTempAgentDir();
    const installPath = join(agentDir, "ddotz-pi", "deps", "im-not-ai");
    const skillRoot = join(installPath, ".claude", "skills");
    process.env.DDOTZ_PI_IM_NOT_AI_INSTALL_PATH = installPath;
    process.env.DDOTZ_PI_IM_NOT_AI_DISABLE_GLOBAL = "1";
    const exec = vi.fn(async (command: string, args: string[]): Promise<ExecResult> => {
      if (command === "git" && args[0] === "clone") {
        await writeHumanizeSkill(skillRoot);
        await writeFile(join(installPath, "README.md"), "# upstream repo root, not a Pi skill\n", "utf8");
        return { code: 0, stdout: "", stderr: "", killed: false };
      }
      throw new Error(`Unexpected exec: ${command} ${args.join(" ")}`);
    });
    const { handlers } = setupAutopilot(exec);
    const notify = vi.fn();

    const results = await emitCollect(handlers, "resources_discover", { reason: "startup" }, { hasUI: true, ui: { notify } });

    expect(results).toContainEqual({ skillPaths: [skillRoot] });
    expect(results).not.toContainEqual({ skillPaths: [installPath] });
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("Installed im-not-ai skill from upstream"), "info");
    expect(await readFile(join(skillRoot, "humanize-korean", "SKILL.md"), "utf8")).toContain("humanize-korean");
  });
});
