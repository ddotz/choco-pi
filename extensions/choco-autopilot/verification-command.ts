function objectInput(input: unknown): Record<string, unknown> | undefined {
  return input && typeof input === "object" ? input as Record<string, unknown> : undefined;
}

export function verificationCommandFromInput(input: unknown): string | undefined {
  const command = objectInput(input)?.command;
  if (typeof command !== "string") return undefined;
  const trimmed = command.trim();
  if (!trimmed) return undefined;
  if (/\b(pnpm|npm|yarn)\s+(run\s+)?(check|test|lint|typecheck|version:check)\b/i.test(trimmed)) return trimmed;
  if (/\b(vitest|pytest|tsc|eslint|oxlint)\b/i.test(trimmed)) return trimmed;
  return undefined;
}

export function commandClassFromInput(input: unknown): string | undefined {
  const command = objectInput(input)?.command;
  if (typeof command !== "string") return undefined;
  const trimmed = command.trim();
  if (!trimmed) return undefined;
  if (/(^|\s)(pnpm|npm|yarn)\s+(run\s+)?version:check(\s|$)/i.test(trimmed)) return "version-check";
  if (/(^|\s)((pnpm|npm|yarn)\s+(run\s+)?test|vitest|pytest)(\s|$)/i.test(trimmed)) return "test";
  if (/(^|\s)((pnpm|npm|yarn)\s+(run\s+)?lint|eslint|oxlint)(\s|$)/i.test(trimmed)) return "lint";
  if (/(^|\s)((pnpm|npm|yarn)\s+(run\s+)?typecheck|tsc)(\s|$)/i.test(trimmed)) return "typecheck";
  if (/\bgit\b/i.test(trimmed)) return "git";
  if (/\b(curl|wget)\b|https?:\/\//i.test(trimmed)) return "web-fetch";
  if (/\b(pnpm|npm|yarn)\s+(install|add|remove|update)\b/i.test(trimmed)) return "package-manager";
  return "other";
}
