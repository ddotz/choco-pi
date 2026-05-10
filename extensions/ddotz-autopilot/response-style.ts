export type ConfidenceLevel = "high" | "medium" | "low";
export type OperationDetailKind = "code-create" | "code-modify" | "code-delete" | "command-output" | "final-summary";

const RESET = "\u001b[0m";
const WHITE = "\u001b[37m";
const GREEN_BACKGROUND = "\u001b[42m";
const YELLOW_BACKGROUND = "\u001b[43m";
const RED_BACKGROUND = "\u001b[41m";

export function formatConfidenceLabel(level: ConfidenceLevel): string {
  switch (level) {
    case "high":
      return `${GREEN_BACKGROUND}${WHITE}High${RESET}`;
    case "medium":
      return `${YELLOW_BACKGROUND}${WHITE}Medium${RESET}`;
    case "low":
      return `${RED_BACKGROUND}${WHITE}Low${RESET}`;
  }
}

export function shouldFoldOperationDetails(kind: OperationDetailKind): boolean {
  return kind !== "final-summary";
}

export function buildResponseStyleGuidance(): string {
  return [
    "### Response style",
    "Keep final reports concise and sectioned.",
    "Use at most 3 sections by default: Result, Verification, Notes.",
    "Each section should use maximum 4 short bullets unless the user asks for detail.",
    "avoid long process narration; summarize what changed and why it matters.",
    "Keep code creation/modification/deletion details folded by default: show a short summary first, then put noisy details under a collapsed `<details><summary>작업 상세</summary>...</details>` block only when details are useful.",
    "For TDD, bug-fix, or regression-fix work, final reports must include the evidence chain: RED (failing test/symptom), Root cause, Fix, and GREEN (passing verification). Keep it concise but do not omit this chain.",
    "Use confidence labels: High, Medium, Low. Do not use Korean labels like [높음], [중간], [낮음]. Do not use HTML tags such as `<span>` for confidence labels because Pi renders them as literal text. In terminal/UI contexts, render them as high-contrast ANSI badges: High with green background, Medium with yellow background, Low with red background, all with white text when possible. In plain Markdown final answers, use plain `Confidence: High` if ANSI rendering is unavailable.",
  ].join("\n");
}
