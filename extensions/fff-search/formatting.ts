import type { GrepResult, SearchResult } from "@ff-labs/fff-node";

export const GREP_MAX_LINE_LENGTH = 500;

export function truncateLine(line: string, max = GREP_MAX_LINE_LENGTH): string {
  const trimmed = line.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

export function formatGrepOutput(result: GrepResult, limit: number): string {
  const items = result.items.slice(0, limit);
  if (items.length === 0) return "No matches found";

  const lines: string[] = [];
  let currentFile = "";

  for (const match of items) {
    if (match.relativePath !== currentFile) {
      currentFile = match.relativePath;
      if (lines.length > 0) lines.push("");
    }

    if (match.contextBefore && match.contextBefore.length > 0) {
      const startLine = match.lineNumber - match.contextBefore.length;
      for (let i = 0; i < match.contextBefore.length; i++) {
        lines.push(`${match.relativePath}-${startLine + i}- ${truncateLine(match.contextBefore[i])}`);
      }
    }

    lines.push(`${match.relativePath}:${match.lineNumber}: ${truncateLine(match.lineContent)}`);

    if (match.contextAfter && match.contextAfter.length > 0) {
      const startLine = match.lineNumber + 1;
      for (let i = 0; i < match.contextAfter.length; i++) {
        lines.push(`${match.relativePath}-${startLine + i}- ${truncateLine(match.contextAfter[i])}`);
      }
    }
  }

  return lines.join("\n");
}

export function formatFindOutput(result: SearchResult, limit: number): string {
  const items = result.items.slice(0, limit);
  if (items.length === 0) return "No files found matching pattern";
  return items.map((item) => item.relativePath).join("\n");
}
