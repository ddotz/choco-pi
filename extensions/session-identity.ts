export const FALLBACK_SESSION_ID = "session-default";

interface SessionContextLike {
  sessionManager?: {
    getSessionId?: () => string;
  };
}

export function normalizeSessionId(sessionId: string | undefined): string {
  const normalized = (sessionId || FALLBACK_SESSION_ID)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || FALLBACK_SESSION_ID;
}

export function sessionIdFromContext(ctx: unknown): string {
  const candidate = (ctx as SessionContextLike | undefined)?.sessionManager?.getSessionId?.();
  return normalizeSessionId(candidate);
}
