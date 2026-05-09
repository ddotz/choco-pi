import type { DdotzMode } from "./policy";

export const DEFAULT_MODE: DdotzMode = "autopilot";

export interface ModeState {
  mode: DdotzMode;
  updatedAt: string;
}

export function parseMode(input: string): DdotzMode | undefined {
  const value = input.trim().toLowerCase();
  if (value === "normal") return "normal";
  if (value === "autopilot" || value === "auto") return "autopilot";
  if (value === "heavy" || value === "autopilot-heavy") return "autopilot-heavy";
  return undefined;
}

export function createModeState(mode: DdotzMode = DEFAULT_MODE): ModeState {
  return { mode, updatedAt: new Date().toISOString() };
}
