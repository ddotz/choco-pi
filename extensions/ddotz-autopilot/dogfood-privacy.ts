import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";

export function dogfoodHash(value: string, salt: string): string {
  return createHash("sha256").update(salt).update("\0").update(value).digest("hex");
}

export function safeProjectLabel(cwd: string): string {
  const resolved = resolve(cwd || process.cwd());
  const name = basename(resolved);
  return name || "root";
}

export function isoWeekId(date = new Date()): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function classifyPromptForDogfood(prompt: string): { taskType: string; summary: string } {
  const text = prompt.toLowerCase();
  if (/구현|수정|고쳐|버그|테스트|build|fix|code|lint|typecheck/.test(text)) return { taskType: "coding", summary: "coding task" };
  if (/리서치|검색|외부|자료|분석|research|web|source|url|https?:\/\//.test(text)) return { taskType: "research", summary: "research task" };
  if (/문서|보고서|정리|작성|글|스펙|design|spec|report|write/.test(text)) return { taskType: "writing", summary: "writing task" };
  if (/검토|리뷰|review|audit/.test(text)) return { taskType: "review", summary: "review task" };
  return { taskType: "general", summary: "general task" };
}
