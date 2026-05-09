import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DDOTZ_PI_VERSION } from "../extensions/ddotz-autopilot/version.ts";
import { analyzeVersionSync } from "../extensions/ddotz-autopilot/version-sync.ts";

function read(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  return readFileSync(path, "utf8");
}

function gitShow(path: string): string | undefined {
  try {
    return execFileSync("git", ["show", `HEAD:${path}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return undefined;
  }
}

const cwd = process.cwd();
const currentPackageJson = read(join(cwd, "package.json"));
if (!currentPackageJson) {
  console.error("package.json not found");
  process.exit(1);
}

const result = analyzeVersionSync({
  currentPackageJson,
  headPackageJson: gitShow("package.json"),
  currentLockfile: read(join(cwd, "pnpm-lock.yaml")),
  headLockfile: gitShow("pnpm-lock.yaml"),
  currentPluginVersion: DDOTZ_PI_VERSION,
});

if (!result.ok) {
  console.error("Version sync check failed:");
  for (const issue of result.issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Version sync OK: ${DDOTZ_PI_VERSION}`);
