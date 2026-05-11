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
