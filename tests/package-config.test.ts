import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  pi: { extensions: string[]; skills: string[]; prompts: string[] };
  dependencies?: Record<string, string>;
};

describe("package configuration", () => {
  it("absorbs selected roach-pi utilities under ddotz-pi instead of requiring a top-level roach-pi package", () => {
    expect(packageJson.dependencies).toHaveProperty("ddotz-pi-utilities");
    expect(packageJson.pi.extensions).toContain("node_modules/ddotz-pi-utilities/extensions/fff-search/index.ts");
    expect(packageJson.pi.extensions).toContain("node_modules/pi-lsp-client/src/index.ts");
    expect(packageJson.pi.extensions).toContain("node_modules/ddotz-pi-utilities/extensions/pi-code-previews/index.ts");
    expect(packageJson.pi.extensions).toContain("extensions/todo-widget.ts");
    expect(packageJson.pi.extensions).toContain("extensions/ddotz-footer/index.ts");
    expect(packageJson.pi.extensions).toContain("extensions/focus-rendering/index.ts");
    expect(packageJson.pi.extensions.indexOf("extensions/focus-rendering/index.ts")).toBeGreaterThan(
      packageJson.pi.extensions.indexOf("node_modules/ddotz-pi-utilities/extensions/pi-code-previews/index.ts"),
    );
    expect(JSON.stringify(packageJson.pi)).not.toContain("roach-pi");
  });
});
