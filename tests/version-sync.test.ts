import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHOCO_PI_VERSION } from "../extensions/choco-autopilot/version";
import { analyzeVersionSync } from "../extensions/choco-autopilot/version-sync";

describe("version sync", () => {
  it("keeps package, plugin, and README current package versions identical", () => {
    const currentPackageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const packageJson = JSON.parse(currentPackageJson) as { version: string };
    expect(CHOCO_PI_VERSION).toBe(packageJson.version);

    const result = analyzeVersionSync({
      currentPackageJson,
      currentPluginVersion: CHOCO_PI_VERSION,
      currentReadme: readFileSync(join(process.cwd(), "README.md"), "utf8"),
    });
    expect(result.ok).toBe(true);
  });

  it("allows package metadata changes without forcing a version bump", () => {
    const result = analyzeVersionSync({
      currentPackageJson: JSON.stringify({ version: "0.1.0", scripts: { check: "new" } }),
      headPackageJson: JSON.stringify({ version: "0.1.0", scripts: { check: "old" } }),
      currentLockfile: "lock-a",
      headLockfile: "lock-a",
      currentPluginVersion: "0.1.0",
    });

    expect(result.ok).toBe(true);
  });

  it("fails when a chosen package version bump is not mirrored to the plugin version", () => {
    const result = analyzeVersionSync({
      currentPackageJson: JSON.stringify({ version: "0.1.1" }),
      headPackageJson: JSON.stringify({ version: "0.1.0" }),
      currentLockfile: "lock-a",
      headLockfile: "lock-a",
      currentPluginVersion: "0.1.0",
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("package.json version and plugin version constant differ");
  });

  it("fails when README current package version is stale after a version bump", () => {
    const result = analyzeVersionSync({
      currentPackageJson: JSON.stringify({ version: "0.1.1" }),
      headPackageJson: JSON.stringify({ version: "0.1.0" }),
      currentLockfile: "lock-a",
      headLockfile: "lock-a",
      currentPluginVersion: "0.1.1",
      currentReadme: "# choco-pi\n\n- Current package version: `0.1.0`.\n",
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("README current package version does not match package.json version");
  });

  it("fails when dependency metadata changes without lockfile sync", () => {
    const result = analyzeVersionSync({
      currentPackageJson: JSON.stringify({ version: "0.1.1", dependencies: { a: "2.0.0" } }),
      headPackageJson: JSON.stringify({ version: "0.1.0", dependencies: { a: "1.0.0" } }),
      currentLockfile: "lock-a",
      headLockfile: "lock-a",
      currentPluginVersion: "0.1.1",
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("dependency metadata changed but pnpm-lock.yaml did not change");
  });
});
