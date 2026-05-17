import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import chocoFooterExtension, { readFooterProjectMetadata } from "../extensions/choco-footer/index";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe("choco footer project metadata", () => {
  it("reads the nearest project package version from cwd instead of choco-pi", async () => {
    const project = await tempDir("choco-footer-project-version-");
    const nested = join(project, "packages", "app", "src");
    await mkdir(nested, { recursive: true });
    await writeFile(join(project, "package.json"), JSON.stringify({ name: "actual-project", version: "2.3.4" }), "utf8");

    const metadata = readFooterProjectMetadata(nested);

    expect(metadata).toEqual({ branch: null, version: "2.3.4" });
  });

  it("uses the cwd git branch and does not fall back to the choco-pi package branch outside a git repo", async () => {
    const project = await tempDir("choco-footer-project-branch-");
    execFileSync("git", ["init", "-b", "feature-statusline"], { cwd: project, stdio: "ignore" });

    const nonGit = await tempDir("choco-footer-non-git-");

    expect(readFooterProjectMetadata(project).branch).toBe("feature-statusline");
    expect(readFooterProjectMetadata(nonGit).branch).toBeNull();
  });

  it("reads QuickLate-style app metadata version when package.json is absent", async () => {
    const project = await tempDir("choco-footer-swift-version-");
    const nested = join(project, "Sources", "QuickLate");
    await mkdir(join(project, "script"), { recursive: true });
    await mkdir(nested, { recursive: true });
    await writeFile(join(project, "script", "app_metadata.sh"), 'VERSION="${VERSION:-0.2.2}"\n', "utf8");

    expect(readFooterProjectMetadata(nested).version).toBe("0.2.2");
  });

  it("keeps the footer cwd pinned to the session cwd when tools inspect another worktree", async () => {
    const project = await tempDir("choco-footer-session-cwd-project-");
    execFileSync("git", ["init", "-b", "main"], { cwd: project, stdio: "ignore" });
    await writeFile(join(project, "README.md"), "base\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: project, stdio: "ignore" });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"], { cwd: project, stdio: "ignore" });

    const worktreeParent = await tempDir("choco-footer-other-worktree-");
    const worktree = join(worktreeParent, "feature");
    execFileSync("git", ["worktree", "add", "-b", "feature-footer", worktree], { cwd: project, stdio: "ignore" });
    await mkdir(join(worktree, "Sources"), { recursive: true });
    await writeFile(join(worktree, "Sources", "App.swift"), "// feature\n", "utf8");

    const handlers = new Map<string, Array<(event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown>>();
    let footerFactory: ((tui: { requestRender: () => void }, theme: Record<string, unknown>) => { render: (width: number) => string[] }) | undefined;
    chocoFooterExtension({
      events: { on: vi.fn(() => () => {}) },
      getThinkingLevel: () => "high",
      on: (eventName: string, handler: (event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown) => {
        handlers.set(eventName, [...(handlers.get(eventName) ?? []), handler]);
      },
    } as never);

    const ctx = {
      cwd: project,
      hasUI: true,
      ui: { setFooter: vi.fn((factory) => { footerFactory = factory; }) },
      model: undefined,
      sessionManager: { getCwd: () => project, getSessionId: () => "session-1", getBranch: () => [] },
      getContextUsage: () => undefined,
    };

    for (const handler of handlers.get("session_start") ?? []) handler({ reason: "startup" }, ctx as never);
    expect(footerFactory).toBeDefined();

    const footer = footerFactory!({ requestRender: vi.fn() }, {
      bold: (text: string) => text,
      fg: (_name: string, text: string) => text,
    });
    expect(footer.render(200)[0]).toContain(`⎇ main | ${project}`);

    for (const handler of handlers.get("tool_call") ?? []) handler({ toolName: "read", input: { path: join(worktree, "Sources", "App.swift") } }, ctx as never);
    for (const handler of handlers.get("tool_call") ?? []) handler({ toolName: "bash", input: { command: `git -C "${worktree}" status --short` } }, ctx as never);

    const rendered = footer.render(200)[0];
    expect(rendered).toContain(`⎇ main | ${project}`);
    expect(rendered).not.toContain("feature-footer");
    expect(rendered).not.toContain(worktree);
  });
});
