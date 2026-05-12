export type WorkMode = "default" | "coding" | "report" | "design" | "web-analysis" | "adoption-analysis";
export type ExecutionIntensity = "micro" | "standard" | "deep";

export const DEFAULT_WORK_MODE: WorkMode = "default";
export const DEFAULT_EXECUTION_INTENSITY: ExecutionIntensity = "standard";
export const IMPLEMENTED_WORK_MODES: WorkMode[] = ["default", "web-analysis", "adoption-analysis", "report", "coding", "design"];
export const PLANNED_WORK_MODES: Exclude<WorkMode, "default" | "web-analysis" | "adoption-analysis" | "report" | "coding" | "design">[] = [];

export interface RuntimeState {
  workMode: WorkMode;
  executionIntensity: ExecutionIntensity;
  updatedAt: string;
}

export function parseWorkMode(input: string): WorkMode | undefined {
  const value = input.trim().toLowerCase();
  if (value === "default" || value === "base") return "default";
  if (value === "coding" || value === "code" || value === "dev" || value === "development") return "coding";
  if (value === "report" || value === "writing" || value === "document" || value === "doc") return "report";
  if (value === "design" || value === "designer" || value === "ui" || value === "ux" || value === "ui-ux" || value === "visual") return "design";
  if (value === "web" || value === "web-analysis" || value === "analysis" || value === "research-action") return "web-analysis";
  if (value === "adoption" || value === "adoption-analysis" || value === "source" || value === "repo") {
    return "adoption-analysis";
  }
  return undefined;
}

export function isWorkModeImplemented(mode: WorkMode): boolean {
  return IMPLEMENTED_WORK_MODES.includes(mode);
}

export function parseExecutionIntensity(input: string): ExecutionIntensity | undefined {
  const value = input.trim().toLowerCase();
  if (value === "micro" || value === "light" || value === "small") return "micro";
  if (value === "standard" || value === "normal") return "standard";
  if (value === "deep" || value === "heavy" || value === "autopilot-heavy" || value === "long") return "deep";
  return undefined;
}

export function inferPlannedWorkMode(input: string): WorkMode | undefined {
  const text = input.trim().toLowerCase();
  if (!text) return undefined;

  const hasAdoptionIntent = /도입|채택|업데이트\s*체크|외부\s*(아이디어|링크|소스)|adopt|adoption/i.test(text);
  if (hasAdoptionIntent) return "adoption-analysis";

  const hasCodingIntent = /코드\s*(작성|수정|구현)|구현\s*(해|하고|하라|하세요|해주세요|한다|할)|수정|버그|테스트|리팩터|리팩토|파일|함수|오타|class|api|build|lint|readme|\.md\b/i.test(text);
  if (hasCodingIntent) return "coding";

  const hasDesignIntent = /디자인|ui\b|ux\b|ui\/ux|비주얼|시각|레이아웃|랜딩\s*페이지|랜딩페이지|와이어프레임|프로토타입|컴포넌트\s*디자인|브랜드\s*(시스템|가이드|디자인)|design|visual|wireframe|prototype|landing\s*page/i.test(text);
  if (hasDesignIntent) return "design";

  const hasExternalResearchTarget = /https?:\/\/|\burl\b|웹|사이트|검색|리서치|뉴스|자료|external|source-backed/i.test(text);
  if (hasExternalResearchTarget) return "web-analysis";

  if (/보고서|글|카드뉴스|요약문|리포트|white\s*paper|report/i.test(text)) return "report";
  return undefined;
}

export function createRuntimeState(
  workMode: WorkMode = DEFAULT_WORK_MODE,
  executionIntensity: ExecutionIntensity = DEFAULT_EXECUTION_INTENSITY,
): RuntimeState {
  const implementedMode = isWorkModeImplemented(workMode) ? workMode : DEFAULT_WORK_MODE;
  return { workMode: implementedMode, executionIntensity, updatedAt: new Date().toISOString() };
}

export function describeWorkMode(mode: WorkMode): string {
  switch (mode) {
    case "coding":
      return "Coding mode is active. Apply only the coding mode-scoped overlay for TDD-first implementation, systematic debugging, surgical changes, tight verification, and coding completion quality guards; keep default mode behavior isolated.";
    case "report":
      return "Report mode is active. Apply only the report mode-scoped overlay for evidence-led report writing, source confidence gating, Kami-derived layout, and im-not-ai-derived Korean polishing; keep default mode behavior isolated.";
    case "design":
      return "Design mode is active. Apply only the design mode-scoped overlay for product/UI design direction, visual systems, interaction critique, and browser-backed design QA; keep default mode behavior isolated.";
    case "web-analysis":
      return "Web-analysis mode is active. Apply only the web-analysis mode-scoped overlay for retrieval-first external research, source confidence scoring, and critical review; keep default mode behavior isolated.";
    case "adoption-analysis":
      return "Adoption-analysis mode is active. Keep default adoption capability intact, then apply only the adoption-analysis mode-scoped overlay for external source/package/repo adoption decisions, adoption depth, fit/risk review, tracking decision, and critical scope control.";
    case "default":
      return "Default mode is active. Treat the user's order as one managed project in the root all-purpose generalist mode: choose reversible defaults, execute across domains, verify, and keep structural gates intact. Apply specialized overlays only when inferred or explicitly requested.";
  }
}

export function buildModeSwitchGuidance(suggestedMode: WorkMode | undefined, effectiveMode: WorkMode = DEFAULT_WORK_MODE): string {
  if (suggestedMode && suggestedMode !== "default" && isWorkModeImplemented(suggestedMode) && effectiveMode === suggestedMode) {
    return `This turn is using implemented ${effectiveMode} as a temporary, session-scoped overlay. Do not persistently change the user's work mode unless explicitly requested.`;
  }
  if (!suggestedMode || suggestedMode === "default") {
    return "Default mode remains the persistent root all-purpose baseline unless the user explicitly sets another implemented mode.";
  }
  if (isWorkModeImplemented(suggestedMode)) {
    return `This task resembles implemented ${suggestedMode} mode. In default, apply it only as a temporary, session-scoped expertise overlay; otherwise keep the explicit mode.`;
  }
  return [
    "Some specialized modes are planned but not implemented.",
    `This task resembles planned ${suggestedMode} mode, so keep the current implemented mode and do not emulate unavailable mode-specific guardrails.`,
    "If the user explicitly asks to add this mode, implement it in an isolated mode folder before activating it.",
  ].join("\n");
}
