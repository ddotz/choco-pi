import { describe, expect, it } from "vitest";
import type { FileItem, GrepMatch, GrepResult, SearchResult } from "@ff-labs/fff-node";

function grepMatch(overrides: Partial<GrepMatch>): GrepMatch {
  return {
    relativePath: "src/app.ts",
    fileName: "app.ts",
    gitStatus: "clean",
    size: 100,
    modified: 0,
    isBinary: false,
    totalFrecencyScore: 0,
    accessFrecencyScore: 0,
    modificationFrecencyScore: 0,
    lineNumber: 10,
    col: 0,
    byteOffset: 0,
    lineContent: "const answer = 42;",
    matchRanges: [[6, 12]],
    ...overrides,
  };
}

function grepResult(items: GrepMatch[]): GrepResult {
  return {
    items,
    totalMatched: items.length,
    totalFilesSearched: 1,
    totalFiles: 1,
    filteredFileCount: 1,
    nextCursor: null,
  };
}

function fileItem(relativePath: string): FileItem {
  const fileName = relativePath.split("/").pop() ?? relativePath;
  return {
    relativePath,
    fileName,
    size: 100,
    modified: 0,
    accessFrecencyScore: 0,
    modificationFrecencyScore: 0,
    totalFrecencyScore: 0,
    gitStatus: "clean",
  };
}

function searchResult(paths: string[]): SearchResult {
  return {
    items: paths.map(fileItem),
    scores: [],
    totalMatched: paths.length,
    totalFiles: paths.length,
  };
}

describe("fff search formatting", () => {
  it("exposes pure formatting helpers outside the runtime extension", async () => {
    const formatting = await import("../extensions/fff-search/formatting").catch(() => undefined);

    expect(formatting?.formatGrepOutput).toBeTypeOf("function");
    expect(formatting?.formatFindOutput).toBeTypeOf("function");
    expect(formatting?.truncateLine).toBeTypeOf("function");
  });

  it("formats grep matches with context and file grouping", async () => {
    const { formatGrepOutput } = await import("../extensions/fff-search/formatting");

    expect(
      formatGrepOutput(
        grepResult([
          grepMatch({ contextBefore: ["before"], lineContent: "match", contextAfter: ["after"] }),
          grepMatch({ relativePath: "src/other.ts", fileName: "other.ts", lineNumber: 3, lineContent: "other match" }),
        ]),
        10,
      ),
    ).toBe("src/app.ts-9- before\nsrc/app.ts:10: match\nsrc/app.ts-11- after\n\nsrc/other.ts:3: other match");
  });

  it("formats empty and limited find results", async () => {
    const { formatFindOutput } = await import("../extensions/fff-search/formatting");

    expect(formatFindOutput(searchResult([]), 10)).toBe("No files found matching pattern");
    expect(formatFindOutput(searchResult(["src/a.ts", "src/b.ts", "src/c.ts"]), 2)).toBe("src/a.ts\nsrc/b.ts");
  });
});
