import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildModeResourcePolicy } from "../extensions/choco-autopilot/mode-resource-policy";
import { buildAutopilotSystemPrompt } from "../extensions/choco-autopilot/policy";

function promptFor(workMode: "default" | "report"): string {
  return buildAutopilotSystemPrompt({
    workMode,
    executionIntensity: "standard",
    cwd: "/repo",
  });
}

function expectContainsAll(text: string, fragments: readonly string[]): void {
  for (const fragment of fragments) expect(text).toContain(fragment);
}

function expectContainsNone(text: string, fragments: readonly string[]): void {
  for (const fragment of fragments) expect(text).not.toContain(fragment);
}

describe("report mode isolation", () => {
  it("does not leak report overlay into default mode", () => {
    const prompt = promptFor("default");

    expectContainsNone(prompt, [
      "### Report Mode",
      "Report evidence ledger",
      "Section-only pass",
      "Formula-bound numbers",
      "Kami-derived layout",
      "im-not-ai-derived polishing",
    ]);
  });

  it("adds evidence, layout, polishing, and confidence guardrails only in report mode", () => {
    const prompt = promptFor("report");

    expectContainsAll(prompt, [
      "### Report Mode",
      "Mode isolation: this section applies only while Work mode is report",
      "Report evidence ledger",
      "No unsupported assumptions or unchecked citations",
      "double-check",
      "triple-check",
      "C-level",
      "300 Korean characters",
      "Kami-derived layout",
      "im-not-ai-derived polishing",
      "meaning-invariant",
      "artifact or design spec",
      "MD source",
      "evidence sidecar",
      "artifact QA",
    ]);
  });

  it("returns mode-scoped resources for report without changing default policy", () => {
    expect(buildModeResourcePolicy("default")).toEqual({
      mode: "default",
      skills: [],
      extensionGuidance: [],
      toolPriority: [],
      processPriorities: [],
    });

    const policy = buildModeResourcePolicy("report");
    expect(policy.mode).toBe("report");
    expect(policy.skills).toEqual(["insane-search", "kami", "humanize-korean"]);
    expect(policy.extensionGuidance).toContain("Use the kami skill when available for report artifacts and design specs; otherwise apply local Kami-derived constraints and state the fallback when layout fidelity matters.");
    expect(policy.extensionGuidance).toContain("Use Kami-derived layout only for artifacts or design specs; omit visual styling discussion for plain chat/status answers.");
    expect(policy.extensionGuidance).toContain("Use the humanize-korean skill from im-not-ai when available for Korean polishing; otherwise apply local im-not-ai-derived constraints and state the fallback only when polishing fidelity matters.");
    expect(policy.toolPriority).toContain("evidence ledger before synthesis");
    expect(policy.toolPriority).toContain("formula-based calculation before numeric estimation");
    expect(policy.toolPriority).toContain("MD source and evidence sidecar before DOCX/PDF conversion");
    expect(policy.toolPriority).toContain("Markdown rendering before HTML/PDF/DOCX export");
    expect(policy.toolPriority).toContain("artifact QA before returning generated report files");
    expect(policy.processPriorities).toContain("factual confidence before narrative polish");
    expect(policy.processPriorities).toContain("section-only drafting before cross-section review before whole-report critique");
  });

  it("requires section-only, cross-section, and whole-report passes with strict numeric consistency", () => {
    const prompt = promptFor("report");

    expectContainsAll(prompt, [
      "Section-only pass",
      "Cross-section pass",
      "Whole-report pass",
      "partition the report into parts and sections before drafting",
      "review and improve each section in isolation before checking other sections",
      "cross-check consistency, logical structure, sentence flow, and numeric consistency across sections",
      "Formula-bound numbers must be calculated from the stated formula, not estimated",
    ]);
  });

  it("ships a concrete Kami skill for report artifact layout instead of only naming the resource", () => {
    const skillPath = join(process.cwd(), "skills", "kami", "SKILL.md");
    expect(existsSync(skillPath)).toBe(true);

    const skill = readFileSync(skillPath, "utf8");
    expectContainsAll(skill, [
      "name: kami",
      "Use when producing report artifacts",
      "warm parchment",
      "ink-blue",
      "Korean-safe",
      "<report>.evidence.md",
      "artifact QA",
      "Never make HTML/PDF by HTML-escaping raw Markdown",
      "visible Markdown control syntax",
    ]);
  });
});
