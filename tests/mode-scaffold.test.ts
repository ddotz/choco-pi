import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runModeScaffold } from "../extensions/choco-autopilot/mode-scaffold-tool";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

async function root(): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), "choco-pi-mode-scaffold-"));
  return tempDir;
}

describe("mode scaffold", () => {
  it("creates a planned MODE.md scaffold", async () => {
    const repoRoot = await root();

    const result = await runModeScaffold({ modeId: "research-pro", description: "Research workflow" }, { repoRoot });

    expect(result.ok).toBe(true);
    expect(result.files).toContain("modes/research-pro/MODE.md");
    expect(await readFile(join(repoRoot, "modes/research-pro/MODE.md"), "utf8")).toContain("Research workflow");
  });

  it("creates implementation stubs with a quality guard when requested", async () => {
    const repoRoot = await root();

    const result = await runModeScaffold({
      modeId: "ops-mode",
      description: "Ops workflow",
      kind: "implementation-stub",
      includeQualityGuard: true,
    }, { repoRoot });

    expect(result.ok).toBe(true);
    expect(result.files).toEqual(expect.arrayContaining([
      "modes/ops-mode/MODE.md",
      "extensions/choco-autopilot/ops-mode-policy.ts",
      "extensions/choco-autopilot/ops-mode-quality.ts",
      "tests/ops-mode-quality.test.ts",
    ]));
  });

  it("blocks invalid ids, existing modes, and dry-runs without writing files", async () => {
    const repoRoot = await root();

    expect((await runModeScaffold({ modeId: "Bad Mode", description: "bad" }, { repoRoot })).ok).toBe(false);
    const dryRun = await runModeScaffold({ modeId: "dry-mode", description: "dry", dryRun: true }, { repoRoot });
    expect(dryRun.ok).toBe(true);
    await expect(readdir(join(repoRoot, "modes"))).rejects.toMatchObject({ code: "ENOENT" });

    await runModeScaffold({ modeId: "existing-mode", description: "first" }, { repoRoot });
    const existing = await runModeScaffold({ modeId: "existing-mode", description: "second" }, { repoRoot });
    expect(existing.ok).toBe(false);
    expect(existing.blockers.join("\n")).toContain("already exists");
  });
});
