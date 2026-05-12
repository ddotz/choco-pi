import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const publicRuntimeFiles = [
  "README.md",
  "docs/design.md",
  "skills/choco-autopilot/SKILL.md",
  "prompts/autopilot.md",
  "modes/_base/MODE.md",
  "modes/default/MODE.md",
];

describe("runtime branding", () => {
  it("does not expose upstream roach-pi or choco-prefixed mode command names in public runtime docs", () => {
    for (const file of publicRuntimeFiles) {
      const content = readFileSync(join(process.cwd(), file), "utf8");
      expect(content, file).not.toMatch(/\broach-pi\b/i);
      expect(content, file).not.toMatch(/\bchoco-mode\b/i);
    }
  });
});
