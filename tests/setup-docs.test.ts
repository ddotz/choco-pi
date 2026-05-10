import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");

describe("fresh environment setup docs", () => {
  it("documents both git and local Pi package setup paths", () => {
    expect(readme).toContain("## Fresh environment setup");
    expect(readme).toContain("pi install git:github.com/ddotz/ddotz-pi");
    expect(readme).toContain("pi install /absolute/path/to/ddotz-pi");
    expect(readme).toContain("/reload-runtime");
  });
});
