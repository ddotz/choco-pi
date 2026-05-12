export interface MajorTaskSignals {
  changedFiles?: string[];
  reloadRequired?: boolean;
  persistenceChanged?: boolean;
  packageAdoptedOrVendored?: boolean;
  uiWorkflowChanged?: boolean;
  extensionOrModeChanged?: boolean;
  docsOnly?: boolean;
}

function uniqueRuntimeFiles(files: string[]): string[] {
  return [...new Set(files.filter((file) => /^(extensions|prompts|skills|modes|scripts)\//.test(file)))];
}

export function isMajorTask(signals: MajorTaskSignals): boolean {
  if (signals.docsOnly && !signals.reloadRequired && !signals.persistenceChanged && !signals.packageAdoptedOrVendored) return false;
  if (signals.reloadRequired || signals.persistenceChanged || signals.packageAdoptedOrVendored || signals.uiWorkflowChanged || signals.extensionOrModeChanged) return true;
  return uniqueRuntimeFiles(signals.changedFiles ?? []).length >= 2;
}

export function buildTechnicalDebtCleanupGuidance(): string {
  return [
    "### Technical debt cleanup",
    "- You decide whether a task is major; do not ask the user for routine classification.",
    "- Treat these as major by default: multi-file runtime changes, new extension/tool/mode behavior, persistence or state migration, package adoption/vendoring, UI workflow changes, or changes requiring reload_runtime.",
    "- After verification passes on a major task, run a small in-scope technical-debt cleanup pass before final reporting.",
    "- Cleanup scope: remove dead helpers, simplify duplicated logic, tighten tests/docs, review naming, load order, state boundaries, and mode/session isolation.",
    "- Do not turn cleanup into new features, broad rewrites, risky migrations, private-data transfer, publishing, or any approval boundary work.",
    "- re-run verification after cleanup and report that evidence separately from the initial verification.",
  ].join("\n");
}
