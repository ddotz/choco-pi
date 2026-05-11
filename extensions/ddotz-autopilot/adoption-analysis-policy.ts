import { formatAdoptionDepthLadder } from "./adoption-depth";
import { buildModeResourcePolicy, formatModeResourcePolicy } from "./mode-resource-policy";

export function buildAdoptionAnalysisModeGuidance(): string {
  const resourcePolicy = formatModeResourcePolicy(buildModeResourcePolicy("adoption-analysis"));

  return [
    "### Adoption Analysis Mode",
    "Mode isolation: this section applies only while Work mode is adoption-analysis. Do not apply this overlay in default mode.",
    "This mode does not replace default behavior: default already has baseline adoption capability for package reuse, external source tracking, and adopt / partially adopt / reject decisions.",
    "Adoption-analysis adds stricter quality gates only when the task is primarily about whether and how much external source/package/repo material should be adopted into ddotz-pi.",
    "",
    resourcePolicy,
    "",
    "#### Adoption decision pipeline",
    "1. Identify the candidate source, package, repo, link, or upstream change and its concrete claims or code ideas.",
    "2. Compare it against ddotz-pi's default-root all-purpose philosophy, Pi-native runtime model, mode isolation invariant, and current source registry behavior.",
    "3. Decide both whether to adopt and how much to adopt before implementation. Prefer the smallest sufficient adoption depth.",
    "4. Ask only at hard approval boundaries: package publishing, payment, secrets/accounts, private-data transfer, destructive actions, or license/legal ambiguity that cannot be safely resolved.",
    "5. Track sources only when their code/design is actually reflected into ddotz-pi or the user explicitly asks to track them.",
    "",
    "#### Required output contract",
    "- Decision: adopt / partially adopt / reject / watch.",
    "- Adoption depth: choose exactly one depth from the ladder below and explain why this is enough.",
    formatAdoptionDepthLadder(),
    "- Fit review: ddotz-pi philosophy, Pi-native fit, default behavior impact, mode isolation, duplication, and maintenance cost.",
    "- Risk review: license/security/source freshness, privacy, dependency health, reversibility, and runtime conflict risk.",
    "- Scope: what to adopt, what to reject, what to defer, and which files or policies are affected when implementation follows.",
    "- Tracking decision: whether to register/watch/adopt/reject the source, and why it satisfies the source tracking policy.",
    "- Confidence: High only when decision, adoption depth, fit review, risk review, scope, and tracking decision are all explicit.",
    "",
    "#### Guardrails",
    "- Do not vendor or fork when idea-only, prompt-policy, test-only, or small-local-code adoption is enough.",
    "- Do not move default adoption capability into this mode. This mode only adds stricter review format and quality repair while active.",
    "- Do not let adoption-analysis output contracts leak into default mode.",
    "- If source evidence is thin, stale, license-unclear, or security-sensitive, lower confidence or choose watch/reject instead of claiming High.",
  ].filter(Boolean).join("\n");
}
