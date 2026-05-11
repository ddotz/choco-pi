import { describe, expect, it } from "vitest";
import {
  classifyCommitPath,
  createDefaultQualityCommands,
  findCommitHygieneIssues,
  findVersionSyncIssues,
  shouldIncludeInCommit,
} from "../extensions/ddotz-autopilot/commit-hygiene";

describe("commit hygiene", () => {
  it("excludes superpowers runtime artifacts, private files, secrets, and unnecessary dotfiles", () => {
    expect(shouldIncludeInCommit("docs/superpowers/plans/temp.md")).toBe(false);
    expect(shouldIncludeInCommit(".superpowers/session.json")).toBe(false);
    expect(shouldIncludeInCommit(".env")).toBe(false);
    expect(shouldIncludeInCommit("private-notes.md")).toBe(false);
    expect(shouldIncludeInCommit(".DS_Store")).toBe(false);
    expect(shouldIncludeInCommit("extensions/ddotz-autopilot/policy.ts")).toBe(true);
    expect(shouldIncludeInCommit(".gitignore")).toBe(true);
  });

  it("classifies path risks for final commit review", () => {
    expect(classifyCommitPath("docs/superpowers/plans/a.md").kind).toBe("superpowers-artifact");
    expect(classifyCommitPath(".env.local").kind).toBe("secret-or-private");
    expect(classifyCommitPath(".cache/tmp").kind).toBe("unnecessary-dotfile");
    expect(classifyCommitPath("src/index.ts").kind).toBe("allowed");
  });

  it("reports actionable hygiene issues before commit", () => {
    const issues = findCommitHygieneIssues([
      "README.md",
      ".env",
      ".superpowers/run.json",
      "extensions/ddotz-autopilot/index.ts",
    ]);

    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.path)).toEqual([".env", ".superpowers/run.json"]);
  });

  it("does not force a version bump for every package metadata change", () => {
    expect(findVersionSyncIssues(["package.json"])).toEqual([]);
    expect(findVersionSyncIssues(["extensions/ddotz-autopilot/version.ts"])).toEqual([
      expect.objectContaining({ missingPath: "package.json" }),
    ]);
    expect(findVersionSyncIssues(["package.json", "extensions/ddotz-autopilot/version.ts"])).toEqual([]);
  });

  it("requires lint and version sync as part of the default post-change quality gate", () => {
    expect(createDefaultQualityCommands()).toEqual([
      "pnpm run version:check",
      "pnpm run lint",
      "pnpm run typecheck",
      "pnpm run test",
    ]);
  });

  it("documents autonomous commit, push, and version-bump judgment", async () => {
    const { buildCommitHygieneGuidance } = await import("../extensions/ddotz-autopilot/commit-hygiene");

    const guidance = buildCommitHygieneGuidance();

    expect(guidance).toContain("Commit and push autonomously");
    expect(guidance).toContain("Do not treat git push as deployment");
    expect(guidance).toContain("no bump");
    expect(guidance).toContain("patch/minor/major");
  });
});
