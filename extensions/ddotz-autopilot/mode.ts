export type WorkMode = "default" | "coding" | "report" | "web-analysis" | "adoption-analysis";
export type ExecutionIntensity = "micro" | "standard" | "deep";

export const DEFAULT_WORK_MODE: WorkMode = "default";
export const DEFAULT_EXECUTION_INTENSITY: ExecutionIntensity = "standard";

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

export function parseExecutionIntensity(input: string): ExecutionIntensity | undefined {
  const value = input.trim().toLowerCase();
  if (value === "micro" || value === "light" || value === "small") return "micro";
  if (value === "standard" || value === "normal") return "standard";
  if (value === "deep" || value === "heavy" || value === "autopilot-heavy" || value === "long") return "deep";
  return undefined;
}

export function inferWorkMode(input: string): WorkMode {
  const text = input.trim().toLowerCase();
  if (!text) return "default";
  if (/repo|github|도입|채택|업데이트\s*체크|외부\s*(아이디어|링크|소스)/i.test(text)) return "adoption-analysis";
  if (/웹|사이트|검색|분석|리서치|뉴스|자료|url|https?:\/\//i.test(text)) return "web-analysis";
  if (/보고서|문서|글|카드뉴스|요약문|리포트|white\s*paper|report/i.test(text)) return "report";
  if (/코드|구현|수정|버그|테스트|리팩터|리팩토|파일|함수|class|api|build|lint/i.test(text)) return "coding";
  return "default";
}

export function createRuntimeState(
  workMode: WorkMode = DEFAULT_WORK_MODE,
  executionIntensity: ExecutionIntensity = DEFAULT_EXECUTION_INTENSITY,
): RuntimeState {
  return { workMode, executionIntensity, updatedAt: new Date().toISOString() };
}

export function describeWorkMode(mode: WorkMode): string {
  switch (mode) {
    case "coding":
      return "Coding mode: implement, refactor, debug, test, and verify code changes autonomously.";
    case "report":
      return "Report mode: gather evidence, structure findings, write polished documents, and verify factual support.";
    case "web-analysis":
      return "Web-analysis mode: research external sources, synthesize findings, and take the requested follow-up action.";
    case "adoption-analysis":
      return "Adoption-analysis mode: analyze external repos/links, decide fit with ddotz philosophy, track adopted sources, and propose improvements.";
    case "default":
      return "Default mode: choose the right concrete action domain while preserving autonomous PM/development-team behavior.";
  }
}
