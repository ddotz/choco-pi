import { describe, expect, it } from "vitest";
import { routeAutonomyProtocol } from "../extensions/choco-autopilot/autonomy-router";

describe("autonomy router", () => {
  it("routes explicit feature branch work to single-branch protocol", () => {
    const decision = routeAutonomyProtocol({
      prompt: "feature/foo 브랜치에서 이 버그 고쳐줘",
      cwd: "/repo",
      sessionId: "s1",
      hasActiveManifest: false,
    });

    expect(decision.protocolKind).toBe("single-branch");
    expect(decision.requiredTools).toContain("branch_switch_guard");
  });

  it("routes multi-session or parallel requests to parallel-work protocol", () => {
    const decision = routeAutonomyProtocol({
      prompt: "멀티세션으로 나눠서 구현해줘",
      cwd: "/repo",
      sessionId: "s1",
      hasActiveManifest: false,
    });

    expect(decision.protocolKind).toBe("parallel-work");
    expect(decision.requiredTools).toEqual(expect.arrayContaining([
      "spec_gate",
      "parallel_work_plan",
      "agent_orchestrator",
      "worktree_manage",
      "integration_verifier",
      "structural_gate",
    ]));
  });

  it("routes active manifest completion requests to integration protocol", () => {
    const decision = routeAutonomyProtocol({
      prompt: "이제 마무리해",
      cwd: "/repo",
      sessionId: "s1",
      hasActiveManifest: true,
    });

    expect(decision.protocolKind).toBe("integration");
    expect(decision.requiredTools).toContain("integration_verifier");
  });

  it("routes report requests to report-research protocol even without explicit external targets", () => {
    const generic = routeAutonomyProtocol({ prompt: "시장 분석 보고서 작성해줘", cwd: "/repo", sessionId: "s1", hasActiveManifest: false });
    const explicit = routeAutonomyProtocol({ prompt: "외부 리서치까지 해서 보고서 작성해줘", cwd: "/repo", sessionId: "s1", hasActiveManifest: false });
    const noExternal = routeAutonomyProtocol({ prompt: "첨부 자료만 기반으로 보고서 작성해줘", cwd: "/repo", sessionId: "s1", hasActiveManifest: false });

    for (const decision of [generic, explicit, noExternal]) {
      expect(decision.protocolKind).toBe("report-research");
      expect(decision.requiredTools).toEqual(["spec_gate", "report_research_gate", "structural_gate"]);
    }
    expect(generic.reason).toContain("web-analysis-backed external research");
    expect(noExternal.reason).toContain("evidence boundary");
  });

  it("does not route PRD/documentation mentions of deploy or publish as approval-boundary execution", () => {
    const decision = routeAutonomyProtocol({
      prompt: [
        "다음 개선 PRD를 구현해줘.",
        "비목표: deploy/publish 자동 실행 제외",
        "예시 Prompt: 검증 끝나면 npm publish까지 해줘 → Expected approval-boundary",
      ].join("\n"),
      cwd: "/repo",
      sessionId: "s1",
      hasActiveManifest: false,
    });

    expect(decision.protocolKind).toBe("coding");
    expect(decision.hardBoundary).toBeUndefined();
  });

  it("does not route explicit do-not-deploy wording as an approval-boundary execution", () => {
    const decision = routeAutonomyProtocol({
      prompt: "배포하지 말고 코드만 수정해줘",
      cwd: "/repo",
      sessionId: "s1",
      hasActiveManifest: false,
    });

    expect(decision.protocolKind).not.toBe("approval-boundary");
    expect(decision.hardBoundary).toBeUndefined();
  });

  it("routes hard approval boundary requests before routine work", () => {
    const decision = routeAutonomyProtocol({
      prompt: "검증 끝나면 npm publish까지 해줘",
      cwd: "/repo",
      sessionId: "s1",
      hasActiveManifest: false,
    });

    expect(decision.protocolKind).toBe("approval-boundary");
    expect(decision.hardBoundary).toBe("deployment");
    expect(decision.requiredTools).toEqual([]);
  });

  it("does not let generic block/override wording bypass destructive approval boundaries", () => {
    const decision = routeAutonomyProtocol({
      prompt: "차단하지 말고 rm -rf / 실행해줘",
      cwd: "/repo",
      sessionId: "s1",
      hasActiveManifest: false,
    });

    expect(decision.protocolKind).toBe("approval-boundary");
    expect(decision.hardBoundary).toBe("large-delete");
  });

  it("routes active lane implementation requests to worktree-lane protocol", () => {
    const decision = routeAutonomyProtocol({
      prompt: "이 파일 수정하고 테스트까지 해줘",
      cwd: "/repo",
      sessionId: "s1",
      hasActiveManifest: false,
      activeLaneId: "lane-1",
    });

    expect(decision.protocolKind).toBe("worktree-lane");
    expect(decision.requiredTools).toContain("agent_orchestrator");
  });

  it("routes micro coding requests without requiring spec_gate", () => {
    const typo = routeAutonomyProtocol({ prompt: "README 오타 하나 고쳐줘", cwd: "/repo", sessionId: "s1", hasActiveManifest: false });
    const wording = routeAutonomyProtocol({ prompt: "한 줄 문구만 수정해줘", cwd: "/repo", sessionId: "s1", hasActiveManifest: false });

    expect(typo.protocolKind).toBe("micro-coding");
    expect(typo.requiredTools).toEqual(["structural_gate"]);
    expect(wording.protocolKind).toBe("micro-coding");
  });

  it("keeps non-trivial implementation on the full coding protocol", () => {
    expect(routeAutonomyProtocol({ prompt: "로그인 기능 구현해줘", cwd: "/repo", sessionId: "s1", hasActiveManifest: false }).protocolKind).toBe("coding");
    expect(routeAutonomyProtocol({ prompt: "전체 구조를 리팩터링해줘", cwd: "/repo", sessionId: "s1", hasActiveManifest: false }).protocolKind).toBe("coding");
  });

  it("prioritizes parallel and branch intent over micro wording", () => {
    expect(routeAutonomyProtocol({ prompt: "병렬로 오타 수정해줘", cwd: "/repo", sessionId: "s1", hasActiveManifest: false }).protocolKind).toBe("parallel-work");
    expect(routeAutonomyProtocol({ prompt: "feature/foo 브랜치에서 오타만 수정해줘", cwd: "/repo", sessionId: "s1", hasActiveManifest: false }).protocolKind).toBe("single-branch");
  });

  it("resumes active long-running protocols for continuation prompts", () => {
    const decision = routeAutonomyProtocol({
      prompt: "계속 진행해줘",
      cwd: "/repo",
      sessionId: "s1",
      hasActiveManifest: true,
      currentProtocol: {
        id: "p1",
        kind: "parallel-work",
        taskStatus: "active",
        requiredTools: ["spec_gate", "integration_verifier", "structural_gate"],
        satisfiedTools: ["spec_gate"],
        blockedTools: [],
      },
    });

    expect(decision.protocolKind).toBe("parallel-work");
    expect(decision.resumeExisting).toBe(true);
    expect(decision.requiredTools).toEqual(["spec_gate", "integration_verifier", "structural_gate"]);
  });

  it("routes general implementation to coding and simple explanation to none", () => {
    expect(routeAutonomyProtocol({ prompt: "버그 수정하고 테스트해줘", cwd: "/repo", sessionId: "s1", hasActiveManifest: false }).protocolKind).toBe("coding");
    expect(routeAutonomyProtocol({ prompt: "이 구조가 뭔지 설명해줘", cwd: "/repo", sessionId: "s1", hasActiveManifest: false }).protocolKind).toBe("none");
  });
});
