import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { withFileLock } from "../extensions/choco-autopilot/state-lock";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

async function tempPath(name = "state.json"): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), "choco-pi-lock-"));
  return join(tempDir, name);
}

describe("state lock", () => {
  it("serializes concurrent writes without lost updates", async () => {
    const target = await tempPath();
    await writeFile(target, "[]", "utf8");

    await Promise.all(Array.from({ length: 8 }, (_, index) => withFileLock(target, async () => {
      const current = JSON.parse(await readFile(target, "utf8")) as number[];
      current.push(index);
      await writeFile(target, JSON.stringify(current), "utf8");
    }, { staleMs: 5_000, retryMs: 2, timeoutMs: 1_000 })));

    const written = JSON.parse(await readFile(target, "utf8")) as number[];
    expect(written).toHaveLength(8);
    expect(new Set(written).size).toBe(8);
  });

  it("removes stale lock files before running the operation", async () => {
    const target = await tempPath();
    const lockPath = `${target}.lock`;
    await writeFile(lockPath, "stale", "utf8");

    await withFileLock(target, async () => {
      await writeFile(target, "fresh", "utf8");
    }, { staleMs: 0, retryMs: 1, timeoutMs: 500 });

    await expect(readFile(lockPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(target, "utf8")).toBe("fresh");
  });

  it("cleans up the lock when the operation throws", async () => {
    const target = await tempPath();
    const lockPath = `${target}.lock`;

    await expect(withFileLock(target, async () => {
      throw new Error("boom");
    })).rejects.toThrow("boom");

    await expect(stat(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("fails closed with a structured timeout error", async () => {
    const target = await tempPath();
    const lockPath = `${target}.lock`;
    await mkdir(lockPath);

    await expect(withFileLock(target, async () => undefined, { staleMs: 60_000, retryMs: 1, timeoutMs: 5 }))
      .rejects.toMatchObject({ name: "FileLockTimeoutError", lockPath });
  });
});
