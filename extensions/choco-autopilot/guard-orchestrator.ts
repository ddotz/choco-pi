import type { AssistantMessage } from "@mariozechner/pi-ai";

export interface GuardResult {
  message?: AssistantMessage;
  followUp?: string;
}

export interface GuardRunner {
  customType: string;
  run: () => GuardResult;
}

export interface GuardRepair {
  customType: string;
  content: string;
}

export interface GuardPipelineResult {
  message?: AssistantMessage;
  repairs: GuardRepair[];
}

export function runGuardPipeline(message: AssistantMessage, guards: GuardRunner[]): GuardPipelineResult {
  void message;
  const repairs: GuardRepair[] = [];

  for (const guard of guards) {
    const result = guard.run();
    if (result.followUp) repairs.push({ customType: guard.customType, content: result.followUp });
    if (result.message) return { message: result.message, repairs };
  }

  return { repairs };
}
