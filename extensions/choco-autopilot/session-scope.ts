import { normalizeSessionId } from "../session-identity";
import { DEFAULT_WORK_MODE, isWorkModeImplemented, type WorkMode } from "./mode";

export { FALLBACK_SESSION_ID, normalizeSessionId, sessionIdFromContext } from "../session-identity";

export interface EffectiveWorkModeInput {
  persistentMode: WorkMode;
  suggestedMode?: WorkMode;
  sessionMode?: WorkMode;
}

export interface EffectiveWorkModeDecision {
  persistentMode: WorkMode;
  effectiveMode: WorkMode;
  suggestedMode?: WorkMode;
  automatic: boolean;
  reason: string;
}

export function sessionScopedKey(cwd: string, sessionId: string): string {
  return Buffer.from(`${cwd || process.cwd()}\0${normalizeSessionId(sessionId)}`).toString("base64url");
}

export function resolveEffectiveWorkMode(input: EffectiveWorkModeInput): EffectiveWorkModeDecision {
  const baseMode = input.sessionMode ?? input.persistentMode;
  if (baseMode !== DEFAULT_WORK_MODE) {
    return {
      persistentMode: baseMode,
      effectiveMode: baseMode,
      suggestedMode: input.suggestedMode,
      automatic: false,
      reason: "explicit session or persistent mode is active",
    };
  }

  if (input.suggestedMode && input.suggestedMode !== DEFAULT_WORK_MODE && isWorkModeImplemented(input.suggestedMode)) {
    return {
      persistentMode: baseMode,
      effectiveMode: input.suggestedMode,
      suggestedMode: input.suggestedMode,
      automatic: true,
      reason: "implemented mode inferred with high confidence from the current turn",
    };
  }

  return {
    persistentMode: baseMode,
    effectiveMode: DEFAULT_WORK_MODE,
    suggestedMode: input.suggestedMode,
    automatic: false,
    reason: input.suggestedMode ? "suggested mode is not implemented or not safe to apply automatically" : "no specialized mode inferred",
  };
}
