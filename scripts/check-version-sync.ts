import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CHOCO_PI_VERSION } from "../extensions/choco-autopilot/version.ts";
import { analyzeVersionSync } from "../extensions/choco-autopilot/version-sync.ts";

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

const currentReadme = read(join(cwd, "README.md"));
if (!currentReadme) {
  console.error("README.md not found");
  process.exit(1);
}

const result = analyzeVersionSync({
  currentPackageJson,
  headPackageJson: gitShow("package.json"),
  currentLockfile: read(join(cwd, "pnpm-lock.yaml")),
  headLockfile: gitShow("pnpm-lock.yaml"),
  currentPluginVersion: CHOCO_PI_VERSION,
  currentReadme,
});

if (!result.ok) {
  console.error("Version sync check failed:");
  for (const issue of result.issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Version sync OK: ${CHOCO_PI_VERSION}`);
