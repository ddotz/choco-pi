import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { safeJoinWithin } from "./safe-identifiers";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export interface ModeScaffoldParams {
  modeId: string;
  description: string;
  kind?: "planned" | "implementation-stub";
  includeQualityGuard?: boolean;
  dryRun?: boolean;
}

export interface ModeScaffoldResult {
  ok: boolean;
  files: string[];
  blockers: string[];
}

interface ModeScaffoldContext {
  repoRoot?: string;
}

const ModeScaffoldParamsSchema = Type.Object({
  modeId: Type.String(),
  description: Type.String(),
  kind: Type.Optional(Type.Union([Type.Literal("planned"), Type.Literal("implementation-stub")])),
  includeQualityGuard: Type.Optional(Type.Boolean()),
  dryRun: Type.Optional(Type.Boolean()),
});

function validModeId(modeId: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(modeId);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function writeScaffoldFile(repoRoot: string, relativePath: string, content: string): Promise<void> {
  const absolute = safeJoinWithin(repoRoot, relativePath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
}

export async function runModeScaffold(params: ModeScaffoldParams, context: ModeScaffoldContext = {}): Promise<ModeScaffoldResult> {
  const repoRoot = context.repoRoot || process.cwd();
  const modeId = params.modeId.trim();
  const blockers: string[] = [];
  if (!validModeId(modeId)) blockers.push("modeId must be lowercase kebab-case starting with a letter.");
  if (!params.description.trim()) blockers.push("description is required.");

  const kind = params.kind ?? "planned";
  const files = [`modes/${modeId}/MODE.md`];
  if (kind === "implementation-stub") {
    files.push(`extensions/choco-autopilot/${modeId}-policy.ts`);
    if (params.includeQualityGuard) {
      files.push(`extensions/choco-autopilot/${modeId}-quality.ts`);
      files.push(`tests/${modeId}-quality.test.ts`);
    }
  }

  for (const file of files) if (await exists(join(repoRoot, file))) blockers.push(`file already exists: ${file}`);
  if (blockers.length > 0) return { ok: false, files, blockers };
  if (params.dryRun) return { ok: true, files, blockers: [] };

  await writeScaffoldFile(repoRoot, files[0], [`# ${modeId} Mode`, "", "Status: planned.", "", params.description.trim(), ""].join("\n"));
  if (kind === "implementation-stub") {
    await writeScaffoldFile(repoRoot, `extensions/choco-autopilot/${modeId}-policy.ts`, [
      `export function build${modeId.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join("")}Policy(): string {`,
      `  return ${JSON.stringify(params.description.trim())};`,
      "}",
      "",
    ].join("\n"));
    if (params.includeQualityGuard) {
      await writeScaffoldFile(repoRoot, `extensions/choco-autopilot/${modeId}-quality.ts`, "export function guardQuality(): { ok: boolean } {\n  return { ok: true };\n}\n");
      await writeScaffoldFile(repoRoot, `tests/${modeId}-quality.test.ts`, "import { describe, expect, it } from \"vitest\";\nimport { guardQuality } from \"../extensions/choco-autopilot/" + modeId + "-quality\";\n\ndescribe(\"" + modeId + " quality\", () => {\n  it(\"starts with a passing stub\", () => {\n    expect(guardQuality()).toEqual({ ok: true });\n  });\n});\n");
    }
  }
  return { ok: true, files, blockers: [] };
}

export function registerModeScaffoldTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "mode_scaffold",
    label: "Mode scaffold",
    description: "Create isolated work-mode implementation scaffolds.",
    promptSnippet: "mode_scaffold: create planned or implementation-stub files for isolated custom work modes.",
    promptGuidelines: [
      "Use mode_scaffold to reduce custom mode boilerplate while preserving mode isolation.",
      "Do not activate arbitrary custom modes unless implementation-stub scope explicitly includes safe runtime registration.",
    ],
    parameters: ModeScaffoldParamsSchema,
    async execute(_toolCallId, input, _signal, _onUpdate, ctx?: { cwd?: string }) {
      const result = await runModeScaffold(input as ModeScaffoldParams, { repoRoot: ctx?.cwd });
      return {
        content: [{ type: "text", text: result.ok ? `mode_scaffold ok\n${result.files.join("\n")}` : `mode_scaffold blocked\n${result.blockers.join("\n")}` }],
        details: { result },
      };
    },
  });
}
