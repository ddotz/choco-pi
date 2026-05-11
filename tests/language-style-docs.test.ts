import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const docs = [
  "README.md",
  "skills/ddotz-autopilot/SKILL.md",
  "prompts/autopilot.md",
  "modes/_base/MODE.md",
];

describe("language and tone documentation", () => {
  it("ships Korean respectful response style rules with every user-facing entry point", () => {
    for (const file of docs) {
      const content = readFileSync(join(process.cwd(), file), "utf8");
      expect(content, file).toContain("Korean by default");
      expect(content, file).toContain("respectful Korean");
      expect(content, file).toContain("Do not use praise or validation openers");
      expect(content, file).toContain("Do not end replies with suggestion-led opt-in phrasing");
    }
  });

  it("documents package-gallery reuse before new Pi feature implementation", () => {
    for (const file of docs) {
      const content = readFileSync(join(process.cwd(), file), "utf8");
      expect(content, file).toContain("https://pi.dev/packages");
      expect(content, file).toMatch(/high-similarity|높은 유사도/);
    }
  });

  it("documents mandatory mode isolation for future modes", () => {
    for (const file of docs) {
      const content = readFileSync(join(process.cwd(), file), "utf8");
      expect(content, file).toContain("Mode isolation is mandatory for every work mode");
      expect(content, file).toContain("No mode may change default or any other mode as a side effect");
    }
  });
});
