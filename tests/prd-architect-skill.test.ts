import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  pi: { skills: string[] };
};

function skillContent(): string {
  return readFileSync(join(process.cwd(), "skills/prd-architect/SKILL.md"), "utf8");
}

describe("advanced PRD architect skill", () => {
  it("is exposed as a Pi skill", () => {
    expect(packageJson.pi.skills).toContain("skills/prd-architect");
  });

  it("uses advanced autonomous PRD behavior instead of beginner interviews", () => {
    const content = skillContent();
    expect(content).toContain("Advanced PRD Architect");
    expect(content).toContain("critical questions only");
    expect(content).toContain("Do not run a beginner interview");
    expect(content).toContain("AskUserQuestion-first");
    expect(content).toContain("assumption ledger");
    expect(content).toContain("Decision Records");
    expect(content).toContain("retrieval-first");
  });

  it("defines a deep document set for advanced users", () => {
    const content = skillContent();
    expect(content).toContain("01_PRD.md");
    expect(content).toContain("02_SYSTEM_MODEL.md");
    expect(content).toContain("03_DELIVERY_PLAN.md");
    expect(content).toContain("04_AGENT_SPEC.md");
    expect(content).toContain("README.md");
  });
});
