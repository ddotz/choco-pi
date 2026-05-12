import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const legacyBrand = ["dd", "otz"].join("");
const targetPackageName = "choco-pi";

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
    expect(packageJson.pi?.extensions?.join("\n").toLowerCase()).not.toContain(legacyBrand);
    expect(packageJson.pi?.skills?.join("\n").toLowerCase()).not.toContain(legacyBrand);
    expect(packageJson.pi?.prompts?.join("\n").toLowerCase()).not.toContain(legacyBrand);
  });

  it("does not leave the legacy brand in tracked paths or text files", () => {
    const offenders: string[] = [];

    for (const file of trackedFiles()) {
      if (file.toLowerCase().includes(legacyBrand)) offenders.push(`${file}: path`);
      const content = readFileSync(file);
      if (!isText(content)) continue;
      if (content.toString("utf8").toLowerCase().includes(legacyBrand)) offenders.push(`${file}: content`);
    }

    expect(offenders).toEqual([]);
  });
});
