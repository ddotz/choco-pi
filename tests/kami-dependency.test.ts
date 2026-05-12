import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveKamiSkillContribution } from "../extensions/ddotz-autopilot/kami-dependency";

let tempDir: string | undefined;

afterEach(async () => {
  delete process.env.DDOTZ_PI_KAMI_DISABLE_GLOBAL;
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

async function makeTempDir(): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), "ddotz-pi-kami-"));
  return tempDir;
}

async function writeSkill(path: string, name = "kami"): Promise<void> {
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "SKILL.md"), `---\nname: ${name}\ndescription: Typeset documents.\n---\n`, "utf8");
}

describe("kami skill dependency", () => {
  it("does not contribute bundled kami when an auto-discovered external kami skill exists", async () => {
    const root = await makeTempDir();
    const external = join(root, "agents", "skills", "kami");
    const bundled = join(root, "package", "skills", "kami");
    await writeSkill(external);
    await writeSkill(bundled);

    const result = await resolveKamiSkillContribution({
      bundledSkillPath: bundled,
      candidatePaths: [{ path: external, autoDiscovered: true }],
    });

    expect(result.status).toBe("external");
    expect(result.skillPath).toBe(external);
    expect(result.contribution).toBeUndefined();
  });

  it("contributes an existing Claude/Codex kami skill when it is not auto-discovered by Pi", async () => {
    const root = await makeTempDir();
    const external = join(root, "codex", "skills", "kami");
    const bundled = join(root, "package", "skills", "kami");
    await writeSkill(external);
    await writeSkill(bundled);

    const result = await resolveKamiSkillContribution({
      bundledSkillPath: bundled,
      candidatePaths: [{ path: external, autoDiscovered: false }],
    });

    expect(result.status).toBe("external");
    expect(result.skillPath).toBe(external);
    expect(result.contribution).toEqual({ skillPaths: [external] });
  });

  it("contributes the bundled kami fallback when no external install exists", async () => {
    const root = await makeTempDir();
    const bundled = join(root, "package", "skills", "kami");
    await writeSkill(bundled);

    const result = await resolveKamiSkillContribution({
      bundledSkillPath: bundled,
      candidatePaths: [],
    });

    expect(result.status).toBe("bundled");
    expect(result.skillPath).toBe(bundled);
    expect(result.contribution).toEqual({ skillPaths: [bundled] });
  });
});
