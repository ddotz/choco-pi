export type ConfidenceLevel = "high" | "medium" | "low";
export type OperationDetailKind = "code-create" | "code-modify" | "code-delete" | "command-output" | "final-summary";

const RESET = "\u001b[0m";
const GREEN = "\u001b[32m";
const YELLOW = "\u001b[33m";
const RED = "\u001b[31m";

export function formatConfidenceLabel(level: ConfidenceLevel): string {
  switch (level) {
    case "high":
      return `${GREEN}High${RESET}`;
    case "medium":
      return `${YELLOW}Medium${RESET}`;
    case "low":
      return `${RED}Low${RESET}`;
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
    "Use confidence labels: High, Medium, Low. Do not use Korean labels like [높음], [중간], [낮음]. In terminal/UI contexts, render High green, Medium yellow, Low red when possible.",
  ].join("\n");
}
