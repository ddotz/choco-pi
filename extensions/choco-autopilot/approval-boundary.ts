export type ApprovalBoundaryKind =
  | "deployment"
  | "payment"
  | "secret-or-account"
  | "large-delete"
  | "external-data-transfer"
  | "irreversible";

export interface ApprovalBoundaryDecision {
  kind: ApprovalBoundaryKind;
  reason: string;
}

const DEPLOYMENT_PATTERNS = [
  /\b(vercel|netlify|firebase)\s+deploy\b/i,
  /\bnpm\s+publish\b/i,
  /\bpnpm\s+publish\b/i,
  /\byarn\s+npm\s+publish\b/i,
  /\bgh\s+release\s+(create|upload)\b/i,
  /\bgh\s+workflow\s+run\b/i,
  /\bgh\s+run\s+(rerun|cancel|watch)\b/i,
  /\bgh\s+api\b[^;&|]*(?:actions\/workflows|\/dispatches|\/runs)\b/i,
];

const PAYMENT_PATTERNS = [
  /\bstripe\s+(charges?|payment_intents?|refunds?)\b/i,
  /\bpaypal\b.*\b(capture|refund|payout)\b/i,
];

const SECRET_OR_ACCOUNT_PATH_PATTERNS = [
  /^\.env(?:\.|$)/,
  /(^|\/)\.env(?:\.|$)/,
  /(^|\/)(secrets?|credentials?|tokens?|auth)\b/i,
  /(^|\/).*(\.pem|\.key|\.p12|\.pfx)$/i,
  /(^|\/)id_rsa(?:\.pub)?$/,
  /(^|\/)id_ed25519(?:\.pub)?$/,
];

const SECRET_OR_ACCOUNT_COMMAND_PATTERNS = [
  /\b(gh|npm|pnpm|vercel|netlify|firebase|aws|gcloud|az)\s+(auth|login|logout|configure)\b/i,
  /\b(pass|op)\s+(insert|edit|item\s+edit)\b/i,
  />\s*\.?env(?:\.|\s|$)/i,
];

const LARGE_DELETE_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-rf|-fr)\s+(?:~|\/|\$HOME|\/Users\/|\/Volumes\/|\.\.)\S*/i,
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-rf|-fr)\s+[^;&|]*\*[^;&|]*/i,
];

const EXTERNAL_TRANSFER_PATTERNS = [
  /\bcurl\b[^;&|]*(?:-T|--upload-file|--form|-F)\b[^;&|]*https?:\/\//i,
  /\bscp\b\s+[^;&|]+\s+[^\s@]+@[^\s:]+:/i,
  /\brsync\b\s+[^;&|]+\s+[^\s@]+@[^\s:]+:/i,
  /\baws\s+s3\s+(cp|sync)\b/i,
  /\bgsutil\s+(cp|rsync)\b/i,
];

const IRREVERSIBLE_PATTERNS = [
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-[a-zA-Z]*[xdf][a-zA-Z]*\b/i,
  /\bgit\s+branch\s+(?:-[a-zA-Z]*D[a-zA-Z]*|--delete\s+--force|--force\s+--delete)\b/i,
  /\bgit\s+push\b[^;&|]*\s--force(?:-with-lease)?\b/i,
  /\bgit\s+push\b[^;&|]*\s--delete\s+\S+/i,
  /\bgit\s+push\b[^;&|]*\s:\S+/i,
  /\bdd\s+if=.*\bof=\/dev\//i,
  /\bterraform\s+(apply\b.*--?auto-approve\b|destroy\b)/i,
  /\bkubectl\s+(delete|apply|replace)\b/i,
  /\b(?:pnpm\s+|npm\s+|yarn\s+)?(?:prisma|drizzle|sequelize|knex|typeorm)\s+migrate\s+(deploy|up|latest|run)\b/i,
  /\b(?:chmod|chown)\s+-[a-zA-Z]*R[a-zA-Z]*\b.*\s+\S*\/(?:Users|Volumes|var|etc|opt|usr|home)\b/i,
];

function normalizedCommand(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const command = (input as { command?: unknown }).command;
  return typeof command === "string" ? command.trim() : undefined;
}

function normalizedPath(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const path = (input as { path?: unknown }).path;
  return typeof path === "string" ? path.trim().replace(/^@/, "").replace(/^\.\//, "") : undefined;
}

function matchAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function decision(kind: ApprovalBoundaryKind, reason: string): ApprovalBoundaryDecision {
  return { kind, reason };
}

export function classifyApprovalBoundaryCommand(command: string): ApprovalBoundaryDecision | undefined {
  const normalized = command.trim();
  if (!normalized) return undefined;
  if (matchAny(normalized, DEPLOYMENT_PATTERNS)) return decision("deployment", "Production deployment or package publishing requires explicit user approval.");
  if (matchAny(normalized, PAYMENT_PATTERNS)) return decision("payment", "Payment or billing actions require explicit user approval.");
  if (matchAny(normalized, SECRET_OR_ACCOUNT_COMMAND_PATTERNS)) return decision("secret-or-account", "Secret or account changes require explicit user approval.");
  if (matchAny(normalized, LARGE_DELETE_PATTERNS)) return decision("large-delete", "Large or destructive deletion requires explicit user approval.");
  if (matchAny(normalized, EXTERNAL_TRANSFER_PATTERNS)) return decision("external-data-transfer", "External private-data transfer requires explicit user approval.");
  if (matchAny(normalized, IRREVERSIBLE_PATTERNS)) return decision("irreversible", "Irreversible local operation requires explicit user approval.");
  return undefined;
}

export function classifyApprovalBoundaryToolCall(toolName: string, input: unknown): ApprovalBoundaryDecision | undefined {
  const command = normalizedCommand(input);
  if ((toolName === "bash" || toolName === "ulw_harness") && command) return classifyApprovalBoundaryCommand(command);

  if (toolName === "write" || toolName === "edit") {
    const path = normalizedPath(input);
    if (path && matchAny(path, SECRET_OR_ACCOUNT_PATH_PATTERNS)) {
      return decision("secret-or-account", "Secret, credential, token, or account configuration file mutation requires explicit user approval.");
    }
  }

  return undefined;
}

export function formatApprovalBoundaryBlock(decision: ApprovalBoundaryDecision): string {
  return `Approval boundary blocked (${decision.kind}): ${decision.reason}`;
}
