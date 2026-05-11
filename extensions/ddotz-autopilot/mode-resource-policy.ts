import type { WorkMode } from "./mode";

export interface ModeResourcePolicy {
  mode: WorkMode;
  skills: string[];
  extensionGuidance: string[];
  toolPriority: string[];
  processPriorities: string[];
}

const EMPTY_POLICY: Omit<ModeResourcePolicy, "mode"> = {
  skills: [],
  extensionGuidance: [],
  toolPriority: [],
  processPriorities: [],
};

const WEB_ANALYSIS_POLICY: ModeResourcePolicy = {
  mode: "web-analysis",
  skills: ["insane-search"],
  extensionGuidance: [
    "Use external fivetaku/insane-search; do not vendor it into ddotz-pi.",
    "Use mode-scoped web-analysis retrieval and review instructions only when web-analysis is active.",
    "Keep default mode prompt, resource guidance, and priorities unchanged.",
  ],
  toolPriority: [
    "external retrieval before synthesis",
    "source extraction before interpretation",
    "source scoring before final answer",
    "critical review before completion",
  ],
  processPriorities: [
    "freshness and provenance before narrative polish",
    "primary sources before summaries",
    "conflict detection before recommendation",
    "critical review before final answer",
  ],
};

const ADOPTION_ANALYSIS_POLICY: ModeResourcePolicy = {
  mode: "adoption-analysis",
  skills: ["insane-search"],
  extensionGuidance: [
    "Use existing ddotz-pi source-registry behavior; do not duplicate default adoption capability.",
    "Use adoption-analysis guidance only when adoption-analysis is active.",
    "Keep default mode prompt, resource guidance, and priorities unchanged.",
  ],
  toolPriority: [
    "source/package evidence before adoption decision",
    "adoption depth before implementation",
    "license/security/source freshness before dependency, fork, or vendor choices",
    "tracking decision before final answer",
  ],
  processPriorities: [
    "smallest sufficient adoption depth before vendoring or dependency adoption",
    "mode isolation before broad policy changes",
    "fit and risk review before implementation",
    "track only reflected or explicitly requested sources",
  ],
};

const REPORT_POLICY: ModeResourcePolicy = {
  mode: "report",
  skills: ["insane-search", "kami"],
  extensionGuidance: [
    "Use Kami-derived layout constraints for report artifacts; do not vendor upstream templates wholesale.",
    "Use im-not-ai-derived Korean polishing rules as report-mode policy; do not depend on Claude-only agents or commands.",
    "Keep report-mode source, layout, and polishing guardrails isolated from default mode.",
  ],
  toolPriority: [
    "user materials and report objective before source collection",
    "evidence ledger before synthesis",
    "confidence scoring before drafting",
    "logic review before polishing",
    "Kami layout and im-not-ai polishing after evidence is stable",
  ],
  processPriorities: [
    "factual confidence before narrative polish",
    "primary sources before secondary summaries",
    "double-check Medium evidence and triple-check Low evidence before use",
    "C-level concise report style before decorative writing",
    "mode isolation before reusable report helpers",
  ],
};

const CODING_POLICY: ModeResourcePolicy = {
  mode: "coding",
  skills: ["test-driven-development", "systematic-debugging", "gstack"],
  extensionGuidance: [
    "Use coding mode guidance only while coding is active; do not leak its strict output contract into default mode.",
    "Use gstack QA only when browser, UI, screenshot, or deployed-flow verification is relevant.",
    "Use external workflow packages as ideas only unless source adoption is explicitly reviewed and tracked.",
  ],
  toolPriority: [
    "assumptions and success criteria before editing",
    "failing test before implementation for feature or bugfix work",
    "root-cause evidence before fixes for unexpected behavior",
    "targeted verification before full quality gate",
    "commit hygiene before commit",
  ],
  processPriorities: [
    "simplicity and surgical diffs before abstraction",
    "TDD RED/GREEN evidence before completion claims",
    "systematic debugging before implementation guesses",
    "verification loop before final answer",
    "mode isolation before shared coding helpers",
  ],
};

function clonePolicy(policy: ModeResourcePolicy): ModeResourcePolicy {
  return {
    mode: policy.mode,
    skills: [...policy.skills],
    extensionGuidance: [...policy.extensionGuidance],
    toolPriority: [...policy.toolPriority],
    processPriorities: [...policy.processPriorities],
  };
}

export function buildModeResourcePolicy(mode: WorkMode): ModeResourcePolicy {
  if (mode === "web-analysis") return clonePolicy(WEB_ANALYSIS_POLICY);
  if (mode === "adoption-analysis") return clonePolicy(ADOPTION_ANALYSIS_POLICY);
  if (mode === "report") return clonePolicy(REPORT_POLICY);
  if (mode === "coding") return clonePolicy(CODING_POLICY);
  return { ...clonePolicy({ ...EMPTY_POLICY, mode }) };
}

export function formatModeResourcePolicy(policy: ModeResourcePolicy): string {
  if (policy.skills.length === 0 && policy.extensionGuidance.length === 0 && policy.toolPriority.length === 0) {
    return "";
  }

  return [
    "#### Mode-scoped resources",
    `- Skills active by policy: ${policy.skills.join(", ") || "none"}`,
    "- Extension/plugin guidance:",
    ...policy.extensionGuidance.map((item) => `  - ${item}`),
    "- Tool/process priority:",
    ...policy.toolPriority.map((item) => `  - ${item}`),
    "- Process priority:",
    ...policy.processPriorities.map((item) => `  - ${item}`),
  ].join("\n");
}
