import type { ExecutionIntensity, RuntimeState, WorkMode } from "./mode";

export interface ModeStatusSession {
  readonly effectiveWorkMode?: WorkMode;
  readonly effectiveModeSequence?: readonly WorkMode[];
  readonly automaticMode?: boolean;
  readonly executionIntensity?: ExecutionIntensity;
  readonly updatedAt?: string;
}

export interface ModeStatusState {
  readonly runtime: RuntimeState;
  readonly sessions: Readonly<Record<string, ModeStatusSession | undefined>>;
}

function sessionFor(state: ModeStatusState, sessionId: string): ModeStatusSession | undefined {
  return state.sessions[sessionId];
}

function effectiveMode(state: ModeStatusState, sessionId: string): WorkMode {
  return sessionFor(state, sessionId)?.effectiveWorkMode ?? state.runtime.workMode;
}

function effectiveIntensity(state: ModeStatusState, sessionId: string): ExecutionIntensity {
  return sessionFor(state, sessionId)?.executionIntensity ?? state.runtime.executionIntensity;
}

function intensitySource(state: ModeStatusState, sessionId: string): "session" | "persistent" {
  return sessionFor(state, sessionId)?.executionIntensity ? "session" : "persistent";
}

function automaticLabel(state: ModeStatusState, sessionId: string): "yes" | "no" {
  return sessionFor(state, sessionId)?.automaticMode ? "yes" : "no";
}

function modeSequence(state: ModeStatusState, sessionId: string): string {
  const session = sessionFor(state, sessionId);
  const sequence = session?.effectiveModeSequence?.length ? session.effectiveModeSequence : [effectiveMode(state, sessionId)];
  return sequence.join(" -> ");
}

function updatedAt(state: ModeStatusState, sessionId: string): string {
  return sessionFor(state, sessionId)?.updatedAt ?? state.runtime.updatedAt;
}

function intensityLine(state: ModeStatusState, sessionId: string): string {
  const persistent = state.runtime.executionIntensity;
  const effective = effectiveIntensity(state, sessionId);
  const source = intensitySource(state, sessionId);
  return effective === persistent ? `intensity: ${persistent} (${source})` : `intensity: ${persistent} -> ${effective} (${source})`;
}

export function formatModeStatus(state: ModeStatusState, sessionId: string): string {
  const persistent = state.runtime.workMode;
  const effective = effectiveMode(state, sessionId);
  const modeLine = effective === persistent ? `mode: ${persistent}` : `mode: ${persistent} -> ${effective}`;
  return [
    modeLine,
    `persistent: ${persistent}`,
    `effective: ${effective}`,
    `sequence: ${modeSequence(state, sessionId)}`,
    intensityLine(state, sessionId),
    `session: ${sessionId}`,
    `updated: ${updatedAt(state, sessionId)}`,
    `automatic overlay: ${automaticLabel(state, sessionId)}`,
  ].join("\n");
}

export function formatIntensityStatus(state: ModeStatusState, sessionId: string): string {
  return [
    intensityLine(state, sessionId),
    `persistent: ${state.runtime.executionIntensity}`,
    `effective: ${effectiveIntensity(state, sessionId)}`,
    `effective mode: ${effectiveMode(state, sessionId)}`,
    `session: ${sessionId}`,
    `updated: ${updatedAt(state, sessionId)}`,
    `automatic overlay: ${automaticLabel(state, sessionId)}`,
  ].join("\n");
}
