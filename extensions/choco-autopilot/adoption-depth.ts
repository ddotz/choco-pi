export const ADOPTION_DEPTHS = [
  "idea-only",
  "prompt-policy",
  "test-only",
  "small-local-code",
  "partial-port",
  "dependency",
  "fork-or-vendor",
] as const;

export type AdoptionDepth = typeof ADOPTION_DEPTHS[number];

export function isAdoptionDepth(value: string): value is AdoptionDepth {
  return (ADOPTION_DEPTHS as readonly string[]).includes(value);
}

export function formatAdoptionDepthLadder(): string {
  return [
    "- idea-only: adopt only the concept, philosophy, naming, or decision frame.",
    "- prompt-policy: adopt prompt, skill, policy, or documentation guidance only.",
    "- test-only: adopt regression expectations or fixtures without runtime behavior.",
    "- small-local-code: reimplement a small utility or local behavior in choco-pi style.",
    "- partial-port: port selected structure while rejecting unrelated package/runtime shape.",
    "- dependency: add an external package dependency after license/security/maintenance review.",
    "- fork-or-vendor: fork, clone, or vendor code only when this is the smallest safe long-term option.",
  ].join("\n");
}
