import type { AssistantMessage } from "@mariozechner/pi-ai";

// Intentionally blank: guard failures queue hidden repair follow-ups without rendering a process-status message.
export const GUARD_REPAIR_STATUS_TEXT = "";

export interface GuardRepairState {
  repairQueued: boolean;
  lastRepairKey?: string;
}

export function clearRepairState(repairState?: GuardRepairState): void {
  if (!repairState) return;
  repairState.repairQueued = false;
  repairState.lastRepairKey = undefined;
}

export function repairAttemptKey(message: AssistantMessage, text: string, issues: readonly string[]): string {
  const messageKey = message.responseId ?? (typeof message.timestamp === "number" ? `ts:${message.timestamp}` : undefined);
  return messageKey ? `${messageKey}|${issues.join(",")}` : `${issues.join(",")}|${text}`;
}

export function queueRepairForAttempt(repairState: GuardRepairState | undefined, key: string, prompt: string): string | undefined {
  if (!repairState) return prompt;
  if (repairState.repairQueued) return undefined;
  repairState.repairQueued = true;
  repairState.lastRepairKey = key;
  return prompt;
}
