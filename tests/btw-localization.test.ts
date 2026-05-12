import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("local choco-pi BTW integration", () => {
  it("ships BTW as a local choco-pi extension instead of a separate package", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      pi: { extensions: string[] };
      dependencies?: Record<string, string>;
    };

    expect(packageJson.pi.extensions).toContain("extensions/btw.ts");
    expect(JSON.stringify(packageJson)).not.toContain("pi-btw");
  });

  it("localizes BTW side-session prompts to Korean respectful style", () => {
    const content = readFileSync(join(process.cwd(), "extensions/btw.ts"), "utf8");

    expect(content).toContain("별도 사이드 대화");
    expect(content).toContain("한국어 존댓말");
    expect(content).toContain("원래 사용자 요청 언어와 출력 형식을 유지");
    expect(content).not.toContain("You are having an aside conversation with the user");
    expect(content).not.toContain("Understood, continuing our side conversation.");
  });

  it("keeps BTW side sessions read-only so guardrail enforcement stays in the main session", () => {
    const content = readFileSync(join(process.cwd(), "extensions/btw.ts"), "utf8");

    expect(content).toContain("export const BTW_SIDE_SESSION_TOOLS = [\"read\"] as const");
    expect(content).toContain("읽기 전용");
    expect(content).not.toContain("tools: [\"read\", \"bash\", \"edit\", \"write\"]");
  });

  it("keeps the adopted MIT notice for the absorbed BTW source", () => {
    const notice = readFileSync(join(process.cwd(), "THIRD_PARTY_NOTICES.md"), "utf8");

    expect(notice).toContain("pi-btw");
    expect(notice).toContain("MIT License");
    expect(notice).toContain("Copyright (c) 2026 Dan Bachelder");
  });
});
