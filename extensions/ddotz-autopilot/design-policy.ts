import { buildModeResourcePolicy, formatModeResourcePolicy } from "./mode-resource-policy";

export function buildDesignModeGuidance(): string {
  const resourcePolicy = formatModeResourcePolicy(buildModeResourcePolicy("design"));

  return [
    "### Design Mode",
    "Mode isolation: this section applies only while Work mode is design. Do not apply this overlay in default mode.",
    "Use design mode for product/UI/UX direction, visual systems, interaction critique, frontend design briefs, and browser-backed design QA.",
    "The goal is deliberate, testable design direction before implementation, not generic modern/clean styling.",
    "",
    resourcePolicy,
    "",
    "#### Design brief before pixels or code",
    "- Define the product goal, audience, brand constraints, primary user journey, and success criteria before proposing visuals.",
    "- Inspect existing DESIGN.md, tokens, CSS variables, component systems, screenshots, and brand references before inventing a new direction.",
    "- Choose a specific visual thesis: tone, typography, color, spacing, surface/background, motion, and differentiation. Do not accept vague 'modern/clean/polished' as sufficient direction.",
    "- If the design will change code, preserve the coding-mode implementation gate for that later step; design mode decides intent and QA criteria first.",
    "",
    "#### UX and visual critique loop",
    "- Separate user goals, information architecture, interaction states, accessibility, and visual hierarchy before recommending changes.",
    "- Prefer concrete tradeoffs and named design patterns over broad taste statements.",
    "- For UI artifacts, include responsive behavior, empty/loading/error states, keyboard/focus expectations, contrast, typography rhythm, and motion restraint.",
    "- Use existing style systems unless the user explicitly asks to replace them; mode isolation prevents design defaults from leaking into unrelated work.",
    "",
    "#### Browser-backed verification",
    "- UI/browser-impacting work requires gstack QA, screenshot/DOM evidence, or a concrete blocker before claiming Confidence: High.",
    "- Verify layout at relevant breakpoints and critical states rather than only reading code.",
    "- If only a design brief is produced, verify by checking that every recommendation traces to a stated goal, evidence source, or explicit assumption.",
    "",
    "#### Design completion contract",
    "- Final design-mode reports must include Result, Verification, Notes, and Confidence.",
    "- Include the chosen visual direction, key UX decisions, explicit assumptions, and deferred implementation work.",
    "- Confidence: High only when context scan/design QA passed and no critical ambiguity remains; otherwise stop with a concrete blocker.",
  ].filter(Boolean).join("\n");
}
