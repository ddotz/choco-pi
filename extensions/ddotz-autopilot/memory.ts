export type MemoryKind =
  | "user-preference"
  | "project-rule"
  | "repeated-mistake"
  | "verification-command"
  | "decision"
  | "noise";

export interface MemoryCandidate {
  kind: MemoryKind;
  text: string;
  reason: string;
}

const MAX_MEMORY_TEXT_LENGTH = 2000;

export function classifyMemoryCandidate(input: string): MemoryCandidate {
  const text = input.trim();
  const lower = text.toLowerCase();

  if (!text || text.length > MAX_MEMORY_TEXT_LENGTH) {
    return { kind: "noise", text, reason: "empty or oversized" };
  }

  if (/^(temporary log|temp log|임시|casual chat|잡담|thanks|고마워)/i.test(text)) {
    return { kind: "noise", text, reason: "one-off chatter or temporary log" };
  }

  if (/user preference|사용자 취향|사용자 선호|preference:/i.test(text)) {
    return { kind: "user-preference", text, reason: "durable user preference" };
  }

  if (/project rule|프로젝트 규칙|rule:/i.test(text)) {
    return { kind: "project-rule", text, reason: "project-level rule" };
  }

  if (/repeated mistake|반복 실수|mistake:/i.test(text)) {
    return { kind: "repeated-mistake", text, reason: "prevents repeated failure" };
  }

  if (/verification command|검증 명령|verify:|pnpm run|npm run|pytest|vitest|tsc/i.test(text)) {
    return { kind: "verification-command", text, reason: "reusable verification evidence" };
  }

  if (/decision:|결정|we decided|use external|external dependency/i.test(text)) {
    return { kind: "decision", text, reason: "durable design decision" };
  }

  return { kind: "noise", text, reason: "not durable enough" };
}

export function shouldStoreMemory(candidate: MemoryCandidate): boolean {
  return candidate.kind !== "noise";
}

export interface StoredMemory {
  id: string;
  kind: Exclude<MemoryKind, "noise">;
  text: string;
  createdAt: string;
}

export function createStoredMemory(candidate: MemoryCandidate, now = new Date()): StoredMemory | undefined {
  if (!shouldStoreMemory(candidate)) return undefined;
  const id = `${candidate.kind}-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    kind: candidate.kind,
    text: candidate.text,
    createdAt: now.toISOString(),
  } as StoredMemory;
}
