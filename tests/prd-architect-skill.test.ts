import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  pi: { skills: string[] };
};

function skillContent(): string {
  return readFileSync(join(process.cwd(), "skills/prd-architect/SKILL.md"), "utf8");
}

function projectFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
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

  it("positions PRD as convergence after brainstorming when ideas are still fuzzy", () => {
    const content = skillContent();
    expect(content).toContain("PRD Architect does not replace brainstorming");
    expect(content).toContain("Fuzzy idea → brainstorming first");
    expect(content).toContain("Clear direction + PRD request → prd-architect directly");
    expect(content).toContain("Existing PRD/spec critique or strengthening → prd-architect directly");
    expect(content).toContain("PRD → spec_gate start → implementation plan → TDD");
  });

  it("routes PRD requests through brainstorming only when exploration is still needed", () => {
    for (const file of ["skills/choco-autopilot/SKILL.md", "prompts/autopilot.md", "README.md"]) {
      const content = projectFile(file);
      expect(content, file).toContain("PRD Architect does not replace brainstorming");
      expect(content, file).toContain("fuzzy idea");
      expect(content, file).toContain("clear direction");
      expect(content, file).toContain("existing PRD");
    }
  });
});
