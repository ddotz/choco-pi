import { describe, expect, it } from "vitest";
import {
  AUTONOMOUS_PM_BASE,
  buildAutopilotSystemPrompt,
  classifyExecutionIntensity,
  shouldAskUser,
} from "../extensions/choco-autopilot/policy";
import {
  DEFAULT_WORK_MODE,
  IMPLEMENTED_WORK_MODES,
  PLANNED_WORK_MODES,
  isWorkModeImplemented,
  parseExecutionIntensity,
  parseWorkMode,
} from "../extensions/choco-autopilot/mode";

describe("choco autonomous PM policy", () => {
  it("keeps autonomous PM as the base philosophy while implementing every built-in work mode", () => {
    expect(AUTONOMOUS_PM_BASE).toBe(true);
    expect(DEFAULT_WORK_MODE).toBe("default");
    expect(IMPLEMENTED_WORK_MODES).toEqual(["default", "web-analysis", "adoption-analysis", "report", "coding", "design"]);
    expect(PLANNED_WORK_MODES).toEqual([]);
    expect(parseWorkMode("autopilot")).toBeUndefined();
    expect(parseWorkMode("coding")).toBe("coding");
    expect(isWorkModeImplemented("default")).toBe(true);
    expect(isWorkModeImplemented("web-analysis")).toBe(true);
    expect(isWorkModeImplemented("adoption-analysis")).toBe(true);
    expect(isWorkModeImplemented("report")).toBe(true);
    expect(isWorkModeImplemented("coding")).toBe(true);
    expect(isWorkModeImplemented("design")).toBe(true);
  });

  it("separates execution intensity from work mode", () => {
    expect(classifyExecutionIntensity("이 함수 이름만 바꿔줘")).toBe("micro");
    expect(classifyExecutionIntensity("로그인 버그 고치고 테스트까지 돌려줘")).toBe("standard");
    expect(classifyExecutionIntensity("역할 나눠서 전체 리팩터링 끝까지 진행하고 리뷰까지 해줘")).toBe("deep");
    expect(parseExecutionIntensity("heavy")).toBe("deep");
    expect(parseExecutionIntensity("autopilot-heavy")).toBe("deep");
  });

  it("prevents routine clarification questions and only allows hard blockers or mode switches", () => {
    expect(shouldAskUser({ kind: "routine-choice", reversible: true, hasReasonableDefault: true })).toBe(false);
    expect(shouldAskUser({ kind: "work-mode-switch", reversible: true, hasReasonableDefault: true })).toBe(true);
    expect(shouldAskUser({ kind: "deployment", reversible: false, hasReasonableDefault: false })).toBe(true);
    expect(shouldAskUser({ kind: "secret-or-account", reversible: false, hasReasonableDefault: false })).toBe(true);
    expect(shouldAskUser({ kind: "external-data-transfer", reversible: false, hasReasonableDefault: false })).toBe(true);
    expect(shouldAskUser({ kind: "external-adoption-decision", reversible: true, hasReasonableDefault: true })).toBe(false);
    expect(shouldAskUser({ kind: "contradictory-goal", reversible: true, hasReasonableDefault: false })).toBe(true);
  });

  it("injects report-research required tool guidance into report-backed protocol turns", () => {
    const prompt = buildAutopilotSystemPrompt({
      workMode: "default",
      effectiveWorkMode: "report",
      modeSequence: ["web-analysis", "report"],
      executionIntensity: "standard",
      cwd: "/repo",
      autonomyProtocol: {
        version: 1,
        id: "report-research-test",
        kind: "report-research",
        sessionId: "s1",
        cwd: "/repo",
        promptHash: "hash",
        requiredTools: ["spec_gate", "report_research_gate", "structural_gate"],
        satisfiedTools: [],
        blockedTools: [],
        reason: "report mode requires web-analysis-backed external research",
        taskStatus: "active",
        createdAt: "2026-05-19T00:00:00.000Z",
        updatedAt: "2026-05-19T00:00:00.000Z",
      },
    });

    expect(prompt).toContain("Effective work mode sequence for this turn: web-analysis -> report");
    expect(prompt).toContain("Protocol: report-research");
    expect(prompt).toContain("- report_research_gate");
    expect(prompt).toContain("Run these mode stages in order");
  });

  it("injects a non-negotiable structural gate that preserves autonomous PM discipline under long context", () => {
    const prompt = buildAutopilotSystemPrompt({
      workMode: "default",
      effectiveWorkMode: "web-analysis",
      executionIntensity: "standard",
      cwd: "/repo",
    });

    expect(prompt).toContain("Persistent work mode: default");
    expect(prompt).toContain("Effective work mode for this turn: web-analysis");
    expect(prompt).toContain("temporary, session-scoped overlay");
    expect(prompt).not.toContain("Do not switch automatically");
    expect(prompt).toContain("Technical debt cleanup");
    expect(prompt).toContain("After verification passes on a major task");
    expect(prompt).toContain("re-run verification after cleanup");
    expect(prompt).toContain("Do not turn cleanup into new features");
    expect(prompt).toContain("Dynamic SDD layer");
    expect(prompt).toContain("spec_gate");
    expect(prompt).toContain("Working Spec");
    expect(prompt).toContain("Spec Delta");
    expect(prompt).toContain("SDD does not replace TDD");
    expect(prompt).toContain("Structural execution gate");
    expect(prompt).toContain("non-negotiable");
    expect(prompt).toContain("must not be skipped or softened when context is long");
    expect(prompt).toContain("complete autonomous PM");
    expect(prompt).toContain("structured development flow");
    expect(prompt).toContain("Acceptance fit");
    expect(prompt).toContain("Runtime fit");
    expect(prompt).toContain("Failure modes");
    expect(prompt).toContain("Verification evidence");
    expect(prompt).toContain("Completion boundary");
    expect(prompt).toContain("structural_gate");
    expect(prompt).toContain("Medium confidence");
    expect(prompt).toContain("reinforce");
    expect(prompt).toContain("concrete blocker");
    expect(prompt).toContain("message_end hook");
    expect(prompt).toContain("blank final-message placeholder");
    expect(prompt).not.toContain("short visible repair-status message");
    expect(prompt).toContain("fail-closed");
    expect(prompt).toContain("Loop governance");
    expect(prompt).toContain("current todo");
    expect(prompt).toContain("new steering");
    expect(prompt).toContain("new loop");
    expect(prompt).toContain("loop_transition");
    expect(prompt).toContain("Do not clear or remove active todos when newly discovered work starts");
    expect(prompt).toContain("return to the preserved parent todo");
  });

  it("injects evidence-first autonomous harness guidance", () => {
    const prompt = buildAutopilotSystemPrompt({
      workMode: "default",
      executionIntensity: "standard",
      cwd: "/repo",
    });

    expect(prompt).toContain("Evidence-first autonomous harness");
    expect(prompt).toContain("Premise Check");
    expect(prompt).toContain("Evidence Ledger");
    expect(prompt).toContain("Fail-Closed Gate");
    expect(prompt).toContain("Autonomous Boundary");
    expect(prompt).toContain("facts, assumptions, inferences, and speculation");
    expect(prompt).toContain("Do not invent citations, numbers, names, dates, examples, or source claims");
    expect(prompt).toContain("If information is missing, name the missing variable instead of guessing");
    expect(prompt).toContain("Start with the strongest counterargument when evaluating a claim, plan, or opinion");
    expect(prompt).toContain("If the user challenges an answer without new evidence");
  });

  it("requires collision-resistant area partitioning before writable parallel development", () => {
    const prompt = buildAutopilotSystemPrompt({
      workMode: "default",
      executionIntensity: "standard",
      cwd: "/repo",
    });

    expect(prompt).toContain("Parallel development collision avoidance");
    expect(prompt).toContain("parallel_work_plan");
    expect(prompt).toContain("worktree_manage");
    expect(prompt).toContain("agent_orchestrator");
    expect(prompt).toContain("integration_verifier");
    expect(prompt).toContain("/sessions");
    expect(prompt).toContain("mode_scaffold");
    expect(prompt).toContain("default hybrid uses worktrees for writable lanes");
    expect(prompt).toContain("spawned agents for read-only lanes");
    expect(prompt).toContain("one writable owner per file/domain");
    expect(prompt).toContain("serialize shared files");
    expect(prompt).toContain("worktree per writable lane");
    expect(prompt).toContain("Single-session branch work");
    expect(prompt).toContain("branch_switch_guard");
    expect(prompt).toContain("keep the current working directory as the work root");
    expect(prompt).toContain("use branch_switch_guard before git switch");
    expect(prompt).toContain("detach that other clean worktree first");
  });

  it("injects a mode-agnostic Markdown artifact rendering guard", () => {
    const prompt = buildAutopilotSystemPrompt({
      workMode: "default",
      executionIntensity: "standard",
      cwd: "/repo",
    });

    expect(prompt).toContain("Markdown artifact rendering");
    expect(prompt).toContain("Never build HTML/PDF/DOCX artifacts by escaping raw Markdown text");
    expect(prompt).toContain("Use a real Markdown renderer");
    expect(prompt).toContain("rendered HTML");
    expect(prompt).toContain("visible Markdown control syntax");
    expect(prompt).toContain("`**bold**`");
    expect(prompt).toContain("unrendered pipe-table rows");
  });

  it("injects autonomous base, default-only work mode, concise response, folded details, confidence, context, memory, and source tracking", () => {
    const prompt = buildAutopilotSystemPrompt({
      workMode: "default",
      executionIntensity: "deep",
      cwd: "/repo",
      ledgerSummary: "Objective: ship",
      dueSourceSummary: "- can1357/oh-my-pi changed since last check",
    });

    expect(prompt).toContain("choco-pi default-root all-purpose generalist base");
    expect(prompt).toContain("root all-purpose generalist mode");
    expect(prompt).toContain("one managed project");
    expect(prompt).toContain("structural gates intact");
    expect(prompt).toContain("Default mode remains the persistent root all-purpose baseline");
    expect(prompt).toContain("Work mode: default");
    expect(prompt).toContain("Default mode is active");
    expect(prompt).not.toContain("Only default work mode is currently implemented");
    expect(prompt).toContain("Execution intensity: deep");
    expect(prompt).toContain("Runtime reality correction");
    expect(prompt).toContain("claim to verify against observable state");
    expect(prompt).toContain("If inspected state contradicts the user's premise or instruction");
    expect(prompt).toContain("Do not execute an instruction that depends on a false premise");
    expect(prompt).toContain("Do not satisfy recurring Pi/harness behavior requests by editing AGENTS.md");
    expect(prompt).toContain("choco-pi harness policy, extension, guard, or test paths");
    expect(prompt).toContain("Do not ask the user for routine implementation choices");
    expect(prompt).toContain("Treat choco-pi as one coherent Pi environment");
    expect(prompt).toContain("Keep final reports concise");
    expect(prompt).toContain("Keep code creation/modification/deletion details folded by default");
    expect(prompt).toContain("User-facing conversation must be in Korean by default");
    expect(prompt).toContain("respectful Korean");
    expect(prompt).toContain("Do not use praise or validation openers");
    expect(prompt).toContain("Do not end replies with suggestion-led opt-in phrasing");
    expect(prompt).toContain("Use confidence labels: High, Medium, Low");
    expect(prompt).toContain("self-review");
    expect(prompt).toContain("verify with observable evidence");
    expect(prompt).toContain("New feature package reuse policy");
    expect(prompt).toContain("https://pi.dev/packages");
    expect(prompt).toContain("high-similarity Pi package");
    expect(prompt).toContain("fork or clone it");
    expect(prompt).toContain("Context Ledger");
    expect(prompt).toContain("insane-search");
    expect(prompt).toContain("Do not reimplement insane-search");
    expect(prompt).toContain("External Source Tracking");
    expect(prompt).toContain("adopt, partially adopt, or reject");
    expect(prompt).toContain("Do not ask for routine external adoption decisions");
    expect(prompt).toContain("Mode isolation is mandatory for every work mode");
    expect(prompt).toContain("New mode policies, skills, plugin/extension guidance, processes, priorities, tools, and guardrails must apply only while that mode is active");
    expect(prompt).toContain("No mode may change default or any other mode as a side effect");
    expect(prompt).toContain("Commit and push autonomously");
    expect(prompt).toContain("Do not treat git push as deployment");
    expect(prompt).not.toContain("Mode: autopilot");
  });
});
