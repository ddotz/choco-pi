export type VerificationStatus = "pending" | "passed" | "failed" | "blocked";

export interface LedgerVerification {
  command: string;
  status: VerificationStatus;
  evidence?: string;
}

export interface ContextLedger {
  objective: string;
  assumptions: string[];
  decisions: string[];
  changedFiles: string[];
  verifications: LedgerVerification[];
  blockers: string[];
  risks: string[];
  nextActions: string[];
  updatedAt: string;
}

export interface LedgerSummaryOptions {
  maxItemsPerSection?: number;
}

function timestamp(): string {
  return new Date().toISOString();
}

function uniqueAppend(values: string[], value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return values;
  if (values.includes(trimmed)) return values;
  return [...values, trimmed];
}

function touch(ledger: ContextLedger): ContextLedger {
  return { ...ledger, updatedAt: timestamp() };
}

export function createEmptyLedger(objective: string): ContextLedger {
  return {
    objective: objective.trim() || "Autonomous choco-pi work",
    assumptions: [],
    decisions: [],
    changedFiles: [],
    verifications: [],
    blockers: [],
    risks: [],
    nextActions: [],
    updatedAt: timestamp(),
  };
}

export function recordAssumption(ledger: ContextLedger, assumption: string): ContextLedger {
  return touch({ ...ledger, assumptions: uniqueAppend(ledger.assumptions, assumption) });
}

export function recordDecision(ledger: ContextLedger, decision: string): ContextLedger {
  return touch({ ...ledger, decisions: uniqueAppend(ledger.decisions, decision) });
}

export function recordChangedFile(ledger: ContextLedger, path: string): ContextLedger {
  return touch({ ...ledger, changedFiles: uniqueAppend(ledger.changedFiles, path) });
}

export function recordVerification(
  ledger: ContextLedger,
  command: string,
  status: VerificationStatus,
  evidence?: string,
): ContextLedger {
  const trimmed = command.trim();
  if (!trimmed) return ledger;
  const existing = ledger.verifications.filter((item) => item.command !== trimmed);
  return touch({
    ...ledger,
    verifications: [...existing, { command: trimmed, status, evidence: evidence?.trim() || undefined }],
  });
}

export function recordBlocker(ledger: ContextLedger, blocker: string): ContextLedger {
  return touch({ ...ledger, blockers: uniqueAppend(ledger.blockers, blocker) });
}

export function recordRisk(ledger: ContextLedger, risk: string): ContextLedger {
  return touch({ ...ledger, risks: uniqueAppend(ledger.risks, risk) });
}

export function recordNextAction(ledger: ContextLedger, action: string): ContextLedger {
  return touch({ ...ledger, nextActions: uniqueAppend(ledger.nextActions, action) });
}

function section(title: string, items: string[], maxItems: number): string[] {
  if (items.length === 0) return [`${title}: none`];
  const visible = items.slice(-maxItems).map((item) => `- ${item}`);
  const hidden = items.length > maxItems ? [`- … ${items.length - maxItems} earlier item(s) omitted`] : [];
  return [`${title}:`, ...hidden, ...visible];
}

export function summarizeLedger(ledger: ContextLedger, options: LedgerSummaryOptions = {}): string {
  const maxItems = options.maxItemsPerSection ?? 6;
  const verificationItems = ledger.verifications.map((item) => {
    const evidence = item.evidence ? ` — ${item.evidence}` : "";
    return `${item.status}: ${item.command}${evidence}`;
  });

  return [
    `Objective: ${ledger.objective}`,
    `Updated: ${ledger.updatedAt}`,
    ...section("Assumptions", ledger.assumptions, maxItems),
    ...section("Decisions", ledger.decisions, maxItems),
    ...section("Changed files", ledger.changedFiles, maxItems),
    ...section("Verification", verificationItems, maxItems),
    ...section("Blockers", ledger.blockers, maxItems),
    ...section("Risks", ledger.risks, maxItems),
    ...section("Next actions", ledger.nextActions, maxItems),
  ].join("\n");
}
