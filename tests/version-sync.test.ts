import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DDOTZ_PI_VERSION } from "../extensions/ddotz-autopilot/version";
import { analyzeVersionSync } from "../extensions/ddotz-autopilot/version-sync";

describe("version sync", () => {
  it("keeps the package version and plugin version constant identical", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version: string };
    expect(DDOTZ_PI_VERSION).toBe(packageJson.version);
  });

  it("fails when package metadata changes without a package/plugin version bump", () => {
    const result = analyzeVersionSync({
      currentPackageJson: JSON.stringify({ version: "0.1.0", scripts: { check: "new" } }),
      headPackageJson: JSON.stringify({ version: "0.1.0", scripts: { check: "old" } }),
      currentLockfile: "lock-a",
      headLockfile: "lock-a",
      currentPluginVersion: "0.1.0",
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("package.json changed but package/plugin version did not change");
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
