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
