import { normalizeSessionId } from "../session-identity";
import { DEFAULT_WORK_MODE, isWorkModeImplemented, type WorkMode } from "./mode";

export { FALLBACK_SESSION_ID, normalizeSessionId, sessionIdFromContext } from "../session-identity";

export interface EffectiveWorkModeInput {
  persistentMode: WorkMode;
  suggestedMode?: WorkMode;
  suggestedModes?: WorkMode[];
  sessionMode?: WorkMode;
}

export interface EffectiveWorkModeDecision {
  persistentMode: WorkMode;
  effectiveMode: WorkMode;
  suggestedMode?: WorkMode;
  modeSequence: WorkMode[];
  automatic: boolean;
  reason: string;
}

export function sessionScopedKey(cwd: string, sessionId: string): string {
  return Buffer.from(`${cwd || process.cwd()}\0${normalizeSessionId(sessionId)}`).toString("base64url");
}

function normalizedSuggestedModes(input: EffectiveWorkModeInput): WorkMode[] {
  const modes = input.suggestedModes?.length ? input.suggestedModes : input.suggestedMode ? [input.suggestedMode] : [];
  return Array.from(new Set(modes));
}

export function resolveEffectiveWorkMode(input: EffectiveWorkModeInput): EffectiveWorkModeDecision {
  const baseMode = input.sessionMode ?? input.persistentMode;
  const suggestedModes = normalizedSuggestedModes(input);
  const suggestedMode = suggestedModes.at(-1) ?? input.suggestedMode;
  if (baseMode !== DEFAULT_WORK_MODE) {
    return {
      persistentMode: baseMode,
      effectiveMode: baseMode,
      suggestedMode,
      modeSequence: [baseMode],
      automatic: false,
      reason: "explicit session or persistent mode is active",
    };
  }

  const implementedSuggestedModes = suggestedModes.filter((mode) => mode !== DEFAULT_WORK_MODE && isWorkModeImplemented(mode));
  if (implementedSuggestedModes.length > 0 && implementedSuggestedModes.length === suggestedModes.length) {
    return {
      persistentMode: baseMode,
      effectiveMode: implementedSuggestedModes.at(-1)!,
      suggestedMode,
      modeSequence: implementedSuggestedModes,
      automatic: true,
      reason: implementedSuggestedModes.length > 1
        ? "implemented sequential mode plan inferred with high confidence from the current turn"
        : "implemented mode inferred with high confidence from the current turn",
    };
  }

  return {
    persistentMode: baseMode,
    effectiveMode: DEFAULT_WORK_MODE,
    suggestedMode,
    modeSequence: [DEFAULT_WORK_MODE],
    automatic: false,
    reason: suggestedMode ? "suggested mode is not implemented or not safe to apply automatically" : "no specialized mode inferred",
  };
}
