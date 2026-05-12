import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const legacyBrand = ["dd", "otz"].join("");
const legacyPackageName = `${legacyBrand}-pi`;
const legacyAutopilotPath = `extensions/${legacyBrand}-autopilot`;
const legacyFooterPath = `extensions/${legacyBrand}-footer`;
const targetPackageName = "choco-pi";
const targetGitHubOwner = legacyBrand;
const targetGitHubRepo = targetPackageName;

function trackedFiles(): string[] {
  const output = execFileSync("git", ["ls-files"], { encoding: "utf8" });
  return output.split("\n").filter(Boolean);
}

function isText(buffer: Buffer): boolean {
  return !buffer.includes(0);
}

describe("choco-pi branding", () => {
  it("renames package metadata and package resource paths", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      name?: string;
      pi?: { extensions?: string[]; skills?: string[]; prompts?: string[] };
    };

    expect(packageJson.name).toBe(targetPackageName);
    expect(packageJson.pi?.extensions?.join("\n").toLowerCase()).not.toContain(legacyAutopilotPath);
    expect(packageJson.pi?.extensions?.join("\n").toLowerCase()).not.toContain(legacyFooterPath);
    expect(packageJson.pi?.skills?.join("\n").toLowerCase()).not.toContain(`${legacyBrand}-autopilot`);
    expect(packageJson.pi?.prompts?.join("\n").toLowerCase()).not.toContain(legacyPackageName);
  });

  it("keeps the GitHub owner while renaming only the repository", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain(`github.com/${targetGitHubOwner}/${targetGitHubRepo}`);
    expect(readme).not.toContain(`github.com/choco/${targetGitHubRepo}`);
  });

  it("does not leave legacy package, extension, or footer names in tracked paths or text files", () => {
    const forbidden = [legacyPackageName, `${legacyBrand}-autopilot`, `${legacyBrand}-footer`];
    const offenders: string[] = [];

    for (const file of trackedFiles()) {
      const lowerPath = file.toLowerCase();
      for (const term of forbidden) {
        if (lowerPath.includes(term)) offenders.push(`${file}: path contains ${term}`);
      }
      const content = readFileSync(file);
      if (!isText(content)) continue;
      const lowerContent = content.toString("utf8").toLowerCase();
      for (const term of forbidden) {
        if (lowerContent.includes(term)) offenders.push(`${file}: content contains ${term}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
