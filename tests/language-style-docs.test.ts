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
});
