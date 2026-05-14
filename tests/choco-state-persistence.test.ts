import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function autopilotIndexSource(): string {
  return readFileSync(join(process.cwd(), "extensions/choco-autopilot/index.ts"), "utf8");
}

describe("choco-pi state persistence", () => {
  it("serializes and atomically renames choco state writes", () => {
    const source = autopilotIndexSource();
    const saveStateMatch = source.match(/async function saveState[\s\S]*?\n}\n/);

    expect(saveStateMatch?.[0] ?? "").toContain("withStateLock");
    expect(source).toContain("rename(");
    expect(source).toContain(".tmp");
  });
});
