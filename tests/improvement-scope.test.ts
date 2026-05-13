import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureAllowedForScope, findGitRoot, parseDogfoodMemoryMode, resolveDogfoodScope } from "../extensions/choco-autopilot/improvement-scope";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("self-improvement scope policy", () => {
  it("parses supported memory modes and falls back to auto for invalid values", () => {
    expect(parseDogfoodMemoryMode(undefined)).toBe("auto");
    expect(parseDogfoodMemoryMode("off")).toBe("off");
    expect(parseDogfoodMemoryMode("readonly")).toBe("readonly");
    expect(parseDogfoodMemoryMode("manual")).toBe("manual");
    expect(parseDogfoodMemoryMode("auto")).toBe("auto");
    expect(parseDogfoodMemoryMode("surprise")).toBe("auto");
  });

  it("uses the git root, not the nested cwd, as the project identity", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "choco-scope-"));
    await mkdir(join(tempDir, ".git"));
    await mkdir(join(tempDir, "packages", "api"), { recursive: true });

    const nested = join(tempDir, "packages", "api");
    const gitRoot = await findGitRoot(nested);
    const root = await realpath(tempDir);
    const scope = await resolveDogfoodScope({ cwd: nested, mode: "auto" });

    expect(gitRoot).toBe(root);
    expect(scope.kind).toBe("project");
    expect(scope.projectRoot).toBe(root);
    expect(scope.projectLabel).toBe(root.split("/").at(-1));
    expect(scope.projectId).toMatch(/^[a-f0-9]{16}$/);
    expect(scope.capture).toBe(true);
  });

  it("turns capture off outside git repos unless an explicit profile is selected", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "choco-noscope-"));

    const offScope = await resolveDogfoodScope({ cwd: tempDir, mode: "auto" });
    expect(offScope).toMatchObject({ kind: "off", capture: false, reason: "cwd is outside a git project and no profile was selected" });

    const personal = await resolveDogfoodScope({ cwd: tempDir, mode: "auto", profile: "personal" });
    expect(personal).toMatchObject({ kind: "personal", projectLabel: "personal", capture: true });
  });

  it("allows automatic capture only in auto mode and keeps readonly/manual non-capturing", () => {
    expect(captureAllowedForScope({ mode: "auto", kind: "project" })).toBe(true);
    expect(captureAllowedForScope({ mode: "manual", kind: "project" })).toBe(false);
    expect(captureAllowedForScope({ mode: "readonly", kind: "project" })).toBe(false);
    expect(captureAllowedForScope({ mode: "off", kind: "project" })).toBe(false);
    expect(captureAllowedForScope({ mode: "auto", kind: "off" })).toBe(false);
  });
});
