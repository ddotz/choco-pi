import {
  recordAssumption,
  recordBlocker,
  recordDecision,
  recordNextAction,
  recordRisk,
  type ContextLedger,
} from "./context-ledger";

export const LEDGER_ADD_USAGE = "Usage: /ledger add <assumption|decision|blocker|risk|next-action> <text>";

export type LedgerAddKind = "assumption" | "decision" | "blocker" | "risk" | "next-action";

export interface LedgerAddResult {
  readonly ledger: ContextLedger;
  readonly label: string;
}

export function normalizeLedgerAddKind(value: string | undefined): LedgerAddKind | undefined {
  if (!value) return undefined;
  switch (value.trim().toLowerCase()) {
    case "assumption":
    case "assumptions":
      return "assumption";
    case "decision":
    case "decisions":
      return "decision";
    case "blocker":
    case "blockers":
    case "blocked":
      return "blocker";
    case "risk":
    case "risks":
      return "risk";
    case "next-action":
    case "next-actions":
    case "next_action":
    case "next_actions":
    case "next":
    case "action":
      return "next-action";
    default:
      return undefined;
  }
}

export function recordLedgerAdd(ledger: ContextLedger, kindInput: string | undefined, text: string): LedgerAddResult | undefined {
  if (!kindInput || !text.trim()) return undefined;
  const kind = normalizeLedgerAddKind(kindInput);
  if (!kind) return undefined;

  switch (kind) {
    case "assumption":
      return { ledger: recordAssumption(ledger, text), label: "assumption" };
    case "decision":
      return { ledger: recordDecision(ledger, text), label: "decision" };
    case "blocker":
      return { ledger: recordBlocker(ledger, text), label: "blocker" };
    case "risk":
      return { ledger: recordRisk(ledger, text), label: "risk" };
    case "next-action":
      return { ledger: recordNextAction(ledger, text), label: "next action" };
  }
}
