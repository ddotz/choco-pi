export type WorkMode = "default" | "coding" | "report" | "web-analysis" | "adoption-analysis";
export type ExecutionIntensity = "micro" | "standard" | "deep";

export const DEFAULT_WORK_MODE: WorkMode = "default";
export const DEFAULT_EXECUTION_INTENSITY: ExecutionIntensity = "standard";
export const IMPLEMENTED_WORK_MODES: WorkMode[] = ["default", "web-analysis", "adoption-analysis", "report"];
export const PLANNED_WORK_MODES: Exclude<WorkMode, "default" | "web-analysis" | "adoption-analysis" | "report">[] = ["coding"];

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
  if (/repo|github|도입|채택|업데이트\s*체크|외부\s*(아이디어|링크|소스)/i.test(text)) return "adoption-analysis";
  if (/웹|사이트|검색|분석|리서치|뉴스|자료|url|https?:\/\//i.test(text)) return "web-analysis";
  if (/보고서|문서|글|카드뉴스|요약문|리포트|white\s*paper|report/i.test(text)) return "report";
  if (/코드|구현|수정|버그|테스트|리팩터|리팩토|파일|함수|class|api|build|lint/i.test(text)) return "coding";
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
      return "Coding mode is planned, not active yet. Keep using default mode unless the user explicitly asks to implement/switch this mode.";
    case "report":
      return "Report mode is active. Apply only the report mode-scoped overlay for evidence-led report writing, source confidence gating, Kami-derived layout, and im-not-ai-derived Korean polishing; keep default mode behavior isolated.";
    case "web-analysis":
      return "Web-analysis mode is active. Apply only the web-analysis mode-scoped overlay for retrieval-first external research, source confidence scoring, and critical review; keep default mode behavior isolated.";
    case "adoption-analysis":
      return "Adoption-analysis mode is active. Keep default adoption capability intact, then apply only the adoption-analysis mode-scoped overlay for external source/package/repo adoption decisions, adoption depth, fit/risk review, tracking decision, and critical scope control.";
    case "default":
      return "Default mode is active. Execute autonomously using the base PM philosophy without specialized mode overlays.";
  }
}

export function buildModeSwitchGuidance(suggestedMode: WorkMode | undefined, effectiveMode: WorkMode = DEFAULT_WORK_MODE): string {
  if (suggestedMode && suggestedMode !== "default" && isWorkModeImplemented(suggestedMode) && effectiveMode === suggestedMode) {
    return `This turn is using implemented ${effectiveMode} as a temporary, session-scoped overlay. Do not persistently change the user's work mode unless explicitly requested.`;
  }
  if (!suggestedMode || suggestedMode === "default") {
    return "Default mode remains the persistent baseline unless the user explicitly sets another implemented mode.";
  }
  if (isWorkModeImplemented(suggestedMode)) {
    return `This task resembles implemented ${suggestedMode} mode. Apply it only as a temporary, session-scoped overlay when the persistent mode is default; otherwise keep the explicit mode.`;
  }
  return [
    "Some specialized modes are planned but not implemented.",
    `This task resembles planned ${suggestedMode} mode, so keep the current implemented mode and do not emulate unavailable mode-specific guardrails.`,
    "If the user explicitly asks to add this mode, implement it in an isolated mode folder before activating it.",
  ].join("\n");
}
