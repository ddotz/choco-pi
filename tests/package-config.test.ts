import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  pi: { extensions: string[]; skills: string[]; prompts: string[] };
  dependencies?: Record<string, string>;
};
const absorbedUtilityAlias = ["choco", "pi", "utilities"].join("-");

describe("package configuration", () => {
  it("absorbs selected utility extensions as local choco-pi runtime entries", () => {
    expect(packageJson.dependencies ?? {}).not.toHaveProperty(absorbedUtilityAlias);
    expect(packageJson.pi.extensions).toContain("extensions/fff-search/index.ts");
    expect(packageJson.pi.extensions).toContain("node_modules/pi-lsp-client/src/index.ts");
    expect(packageJson.pi.extensions).toContain("extensions/input-newline/index.ts");
    expect(packageJson.pi.extensions).toContain("extensions/todo-widget.ts");
    expect(packageJson.pi.extensions).toContain("extensions/choco-footer/index.ts");
    expect(packageJson.pi.extensions).toContain("extensions/focus-rendering/index.ts");
    expect(packageJson.pi.extensions).toContain("extensions/raw-paste/index.ts");
    expect(packageJson.pi.extensions).toContain("extensions/btw.ts");
    expect(packageJson.pi.extensions).not.toContain(`node_modules/${absorbedUtilityAlias}/extensions/pi-code-previews/index.ts`);
    expect(JSON.stringify(packageJson.pi)).not.toContain("pi-code-previews");
    expect(JSON.stringify(packageJson)).not.toContain("roach-pi");
    expect(JSON.stringify(packageJson)).not.toContain("pi-btw");
  });

  it("does not statically expose bundled kami when users already have a kami skill installed", () => {
    expect(packageJson.pi.skills).toContain("skills/choco-autopilot");
    expect(packageJson.pi.skills).not.toContain("skills");
    expect(packageJson.pi.skills).not.toContain("skills/kami");
  });
});
