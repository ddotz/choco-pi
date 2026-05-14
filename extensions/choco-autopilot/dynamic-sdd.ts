import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Container } from "@mariozechner/pi-tui";
import { Type, type Static } from "typebox";
import { FALLBACK_SESSION_ID, normalizeSessionId, sessionIdFromContext } from "../session-identity";

export const SPEC_GATE_TOOL_NAME = "spec_gate";

const SPEC_GATE_ACTIONS = ["start", "delta", "snapshot", "list", "clear"] as const;
const DELTA_HANDLINGS = ["in-scope", "deferred", "new-steering", "new-loop", "approval-boundary"] as const;

type SpecGateAction = typeof SPEC_GATE_ACTIONS[number];
type DeltaHandling = typeof DELTA_HANDLINGS[number];

const SpecGateParams = Type.Object({
  action: StringEnum(SPEC_GATE_ACTIONS, { description: "Spec gate action to run." }),
  objective: Type.Optional(Type.String({ description: "Working Spec objective. Required for start." })),
  scope: Type.Optional(Type.Array(Type.String({ description: "In-scope item." }), { description: "Working Spec scope entries." })),
  acceptanceCriteria: Type.Optional(Type.Array(Type.String({ description: "Acceptance criterion." }), { description: "Completion criteria for the Working Spec." })),
  testStrategy: Type.Optional(Type.Array(Type.String({ description: "Test strategy entry." }), { description: "RED/GREEN or verification strategy entries." })),
  risks: Type.Optional(Type.Array(Type.String({ description: "Risk entry." }), { description: "Known failure or drift risks." })),
  delta: Type.Optional(Type.String({ description: "New fact, interpretation, constraint, or scope-change candidate discovered during work." })),
  deltaHandling: Type.Optional(StringEnum(DELTA_HANDLINGS, { description: "How the discovered delta is handled." })),
  rationale: Type.Optional(Type.String({ description: "Why this spec or delta handling is valid." })),
  label: Type.Optional(Type.String({ description: "Snapshot label." })),
});

export type SpecGateToolInput = Static<typeof SpecGateParams>;

export interface WorkingSpec {
  objective: string;
  scope: string[];
  acceptanceCriteria: string[];
  testStrategy: string[];
  risks: string[];
  updatedAt: string;
}

export interface SpecDelta {
  description: string;
  handling: DeltaHandling;
  rationale?: string;
  proposedChanges: Partial<Pick<WorkingSpec, "scope" | "acceptanceCriteria" | "testStrategy" | "risks">>;
  createdAt: string;
}

export interface SpecSnapshot {
  label: string;
  spec: WorkingSpec;
  deltaCount: number;
  createdAt: string;
}

export interface DynamicSddTurnState {
  workingSpec?: WorkingSpec;
  deltas: SpecDelta[];
  snapshots: SpecSnapshot[];
}

export interface DynamicSddState {
  current?: DynamicSddTurnState;
  turns: Record<string, DynamicSddTurnState>;
}

export interface SpecGateResult {
  ok: boolean;
  text: string;
  reason?: string;
  state: DynamicSddTurnState;
}

export function createDynamicSddState(): DynamicSddState {
  return { turns: {} };
}

function dynamicSddSessionKey(sessionId: string | undefined): string {
  return normalizeSessionId(sessionId || FALLBACK_SESSION_ID);
}

function emptyTurn(): DynamicSddTurnState {
  return { deltas: [], snapshots: [] };
}

export function startDynamicSddTurn(state: DynamicSddState, sessionId = FALLBACK_SESSION_ID): void {
  const turn = emptyTurn();
  state.turns[dynamicSddSessionKey(sessionId)] = turn;
  state.current = turn;
}

function ensureTurn(state: DynamicSddState, sessionId = FALLBACK_SESSION_ID): DynamicSddTurnState {
  const key = dynamicSddSessionKey(sessionId);
  if (!state.turns[key]) startDynamicSddTurn(state, sessionId);
  state.current = state.turns[key];
  return state.current!;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeItems(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(
    values
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean),
  ));
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cloneSpec(spec: WorkingSpec): WorkingSpec {
  return {
    objective: spec.objective,
    scope: [...spec.scope],
    acceptanceCriteria: [...spec.acceptanceCriteria],
    testStrategy: [...spec.testStrategy],
    risks: [...spec.risks],
    updatedAt: spec.updatedAt,
  };
}

function mergeItems(existing: string[], incoming: string[]): string[] {
  return Array.from(new Set([...existing, ...incoming]));
}

function missingStartFields(input: Record<string, unknown>): string[] {
  const missing: string[] = [];
  if (!normalizeText(input.objective)) missing.push("objective");
  if (normalizeItems(input.scope).length === 0) missing.push("scope");
  if (normalizeItems(input.acceptanceCriteria).length === 0) missing.push("acceptanceCriteria");
  if (normalizeItems(input.testStrategy).length === 0) missing.push("testStrategy");
  return missing;
}

function proposedChanges(input: Record<string, unknown>): SpecDelta["proposedChanges"] {
  const scope = normalizeItems(input.scope);
  const acceptanceCriteria = normalizeItems(input.acceptanceCriteria);
  const testStrategy = normalizeItems(input.testStrategy);
  const risks = normalizeItems(input.risks);
  return {
    ...(scope.length > 0 ? { scope } : {}),
    ...(acceptanceCriteria.length > 0 ? { acceptanceCriteria } : {}),
    ...(testStrategy.length > 0 ? { testStrategy } : {}),
    ...(risks.length > 0 ? { risks } : {}),
  };
}

function formatList(title: string, items: string[]): string[] {
  if (items.length === 0) return [`${title}: none`];
  return [`${title}:`, ...items.map((item) => `- ${item}`)];
}

export function formatWorkingSpec(spec: WorkingSpec): string {
  return [
    `Objective: ${spec.objective}`,
    ...formatList("Scope", spec.scope),
    ...formatList("Acceptance Criteria", spec.acceptanceCriteria),
    ...formatList("Test Strategy", spec.testStrategy),
    ...formatList("Risks", spec.risks),
    `Updated: ${spec.updatedAt}`,
  ].join("\n");
}

function formatDelta(delta: SpecDelta, index: number): string {
  const proposed = [
    ...(delta.proposedChanges.scope ? formatList("Proposed Scope", delta.proposedChanges.scope) : []),
    ...(delta.proposedChanges.acceptanceCriteria ? formatList("Proposed Acceptance Criteria", delta.proposedChanges.acceptanceCriteria) : []),
    ...(delta.proposedChanges.testStrategy ? formatList("Proposed Test Strategy", delta.proposedChanges.testStrategy) : []),
    ...(delta.proposedChanges.risks ? formatList("Proposed Risks", delta.proposedChanges.risks) : []),
  ];
  return [
    `Delta ${index + 1}: ${delta.description}`,
    `Handling: ${delta.handling}`,
    delta.rationale ? `Rationale: ${delta.rationale}` : undefined,
    ...proposed,
    `Created: ${delta.createdAt}`,
  ].filter((line): line is string => Boolean(line)).join("\n");
}

export function formatSpecGateState(turn: DynamicSddTurnState): string {
  const spec = turn.workingSpec ? formatWorkingSpec(turn.workingSpec) : "No active Working Spec.";
  const deltas = turn.deltas.length === 0 ? "Spec Deltas: none" : ["Spec Deltas:", ...turn.deltas.map(formatDelta)].join("\n");
  const snapshots = turn.snapshots.length === 0
    ? "Spec Snapshots: none"
    : ["Spec Snapshots:", ...turn.snapshots.map((snapshot, index) => `- ${index + 1}. ${snapshot.label} (${snapshot.deltaCount} delta(s), ${snapshot.createdAt})`)].join("\n");
  return ["Working Spec", spec, "", deltas, "", snapshots].join("\n");
}

function failure(turn: DynamicSddTurnState, reason: string): SpecGateResult {
  return { ok: false, reason, text: `Spec gate failed: ${reason}`, state: turn };
}

function success(turn: DynamicSddTurnState, text: string): SpecGateResult {
  return { ok: true, text, state: turn };
}

function isSpecGateAction(value: unknown): value is SpecGateAction {
  return typeof value === "string" && (SPEC_GATE_ACTIONS as readonly string[]).includes(value);
}

function isDeltaHandling(value: unknown): value is DeltaHandling {
  return typeof value === "string" && (DELTA_HANDLINGS as readonly string[]).includes(value);
}

function startSpec(turn: DynamicSddTurnState, input: Record<string, unknown>): SpecGateResult {
  const missing = missingStartFields(input);
  if (missing.length > 0) return failure(turn, `missing required Working Spec fields: ${missing.join(", ")}`);

  turn.workingSpec = {
    objective: normalizeText(input.objective),
    scope: normalizeItems(input.scope),
    acceptanceCriteria: normalizeItems(input.acceptanceCriteria),
    testStrategy: normalizeItems(input.testStrategy),
    risks: normalizeItems(input.risks),
    updatedAt: nowIso(),
  };
  turn.deltas = [];
  turn.snapshots = [];

  return success(turn, `Working Spec started.\n${formatWorkingSpec(turn.workingSpec)}`);
}

function recordDelta(turn: DynamicSddTurnState, input: Record<string, unknown>): SpecGateResult {
  if (!turn.workingSpec) return failure(turn, "start a Working Spec before recording Spec Deltas");

  const description = normalizeText(input.delta);
  if (!description) return failure(turn, "delta is required");
  if (!isDeltaHandling(input.deltaHandling)) return failure(turn, "deltaHandling is required");

  const changes = proposedChanges(input);
  const delta: SpecDelta = {
    description,
    handling: input.deltaHandling,
    rationale: normalizeText(input.rationale) || undefined,
    proposedChanges: changes,
    createdAt: nowIso(),
  };
  turn.deltas.push(delta);

  if (delta.handling === "in-scope") {
    turn.workingSpec = {
      ...turn.workingSpec,
      scope: mergeItems(turn.workingSpec.scope, changes.scope ?? []),
      acceptanceCriteria: mergeItems(turn.workingSpec.acceptanceCriteria, changes.acceptanceCriteria ?? []),
      testStrategy: mergeItems(turn.workingSpec.testStrategy, changes.testStrategy ?? []),
      risks: mergeItems(turn.workingSpec.risks, changes.risks ?? []),
      updatedAt: nowIso(),
    };
  }

  return success(turn, `Spec Delta recorded (${delta.handling}).\n${formatSpecGateState(turn)}`);
}

function snapshotSpec(turn: DynamicSddTurnState, input: Record<string, unknown>): SpecGateResult {
  if (!turn.workingSpec) return failure(turn, "start a Working Spec before taking a snapshot");

  const label = normalizeText(input.label) || `snapshot ${turn.snapshots.length + 1}`;
  const snapshot: SpecSnapshot = {
    label,
    spec: cloneSpec(turn.workingSpec),
    deltaCount: turn.deltas.length,
    createdAt: nowIso(),
  };
  turn.snapshots.push(snapshot);

  return success(turn, `Spec Snapshot recorded: ${label}\n${formatWorkingSpec(snapshot.spec)}`);
}

export function recordSpecGateAction(state: DynamicSddState, params: SpecGateToolInput, sessionId = FALLBACK_SESSION_ID): SpecGateResult {
  const turn = ensureTurn(state, sessionId);
  const input = params as Record<string, unknown>;
  if (!isSpecGateAction(input.action)) return failure(turn, "valid action is required");

  if (input.action === "start") return startSpec(turn, input);
  if (input.action === "delta") return recordDelta(turn, input);
  if (input.action === "snapshot") return snapshotSpec(turn, input);
  if (input.action === "clear") {
    startDynamicSddTurn(state, sessionId);
    return success(ensureTurn(state, sessionId), "Working Spec cleared.");
  }

  return success(turn, formatSpecGateState(turn));
}

export function createSpecGateTool(state: DynamicSddState): ToolDefinition<typeof SpecGateParams, { ok: boolean; reason?: string; state: DynamicSddTurnState }, unknown> {
  return {
    name: SPEC_GATE_TOOL_NAME,
    label: "Spec gate",
    description: "Record a dynamic SDD Working Spec, Spec Deltas, and snapshots for the current choco-pi turn.",
    promptSnippet: "spec_gate: start/list/snapshot a Working Spec and record Spec Deltas before or during non-trivial implementation work.",
    promptGuidelines: [
      "Use spec_gate start before non-trivial implementation to capture objective, scope, acceptanceCriteria, testStrategy, and risks.",
      "Use spec_gate delta when new facts or constraints appear; choose in-scope, deferred, new-steering, new-loop, or approval-boundary handling explicitly.",
      "Do not mutate the Working Spec just to make a failing test pass; SDD defines scope and TDD proves behavior.",
    ],
    parameters: SpecGateParams,
    renderShell: "self",
    async execute(_toolCallId: string, params: SpecGateToolInput, _signal: AbortSignal | undefined, _onUpdate: undefined, ctx: ExtensionContext) {
      const result = recordSpecGateAction(state, params, sessionIdFromContext(ctx));
      return {
        content: [{ type: "text", text: result.text }],
        details: { ok: result.ok, reason: result.reason, state: result.state },
      };
    },
    renderCall() {
      return new Container();
    },
    renderResult() {
      return new Container();
    },
  };
}

export function installDynamicSdd(pi: Pick<ExtensionAPI, "on" | "registerTool">): void {
  const state = createDynamicSddState();
  pi.registerTool(createSpecGateTool(state));
  pi.on("before_agent_start", (_event, ctx) => {
    startDynamicSddTurn(state, sessionIdFromContext(ctx));
  });
}
