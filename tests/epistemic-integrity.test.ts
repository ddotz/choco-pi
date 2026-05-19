import { describe, expect, it } from "vitest";
import { buildEpistemicIntegrityGuidance } from "../extensions/choco-autopilot/epistemic-integrity";
import { buildAutopilotSystemPrompt } from "../extensions/choco-autopilot/policy";

describe("epistemic integrity harness policy", () => {
  it("requires runtime claims to be verified and corrected instead of blindly accepted", () => {
    const guidance = buildEpistemicIntegrityGuidance();

    expect(guidance).toContain("Runtime reality correction");
    expect(guidance).toContain("claim to verify against observable state");
    expect(guidance).toContain("say so plainly before acting");
    expect(guidance).toContain("아닙니다. 그 해석은 다릅니다.");
    expect(guidance).toContain("false premise");
    expect(guidance).toContain("verified evidence, assumptions, and unknowns");
  });

  it("routes durable Pi behavior changes through choco-pi harness paths instead of agent instruction files", () => {
    const guidance = buildEpistemicIntegrityGuidance();

    expect(guidance).toContain("Do not satisfy recurring Pi/harness behavior requests by editing AGENTS.md");
    expect(guidance).toContain("choco-pi harness policy, extension, guard, or test paths");
    expect(guidance).toContain("unless the user explicitly asks for instruction-file edits");
  });

  it("requires mechanism-first reasoning before causal conclusions", () => {
    const guidance = buildEpistemicIntegrityGuidance();

    expect(guidance).toContain("Mechanism-first reasoning");
    expect(guidance).toContain("Do not complete the story. Follow the mechanism.");
    expect(guidance).toContain("related facts, coincident trends, and narrative fit");
    expect(guidance).toContain("missing variables that could reverse it");
    expect(guidance).toContain("state the gap and the decisive data needed to close it");
  });

  it("injects the correction policy through the runtime autopilot system prompt", () => {
    const prompt = buildAutopilotSystemPrompt({
      workMode: "default",
      executionIntensity: "standard",
      cwd: "/repo",
    });

    expect(prompt).toContain("Runtime reality correction");
    expect(prompt).toContain("If inspected state contradicts the user's premise or instruction");
    expect(prompt).toContain("Do not execute an instruction that depends on a false premise");
    expect(prompt).toContain("choco-pi harness policy, extension, guard, or test paths");
    expect(prompt).toContain("Mechanism-first reasoning");
    expect(prompt).toContain("Do not complete the story. Follow the mechanism.");
  });
});
