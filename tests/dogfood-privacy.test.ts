import { describe, expect, it } from "vitest";
import { classifyPromptForDogfood, dogfoodHash, isoWeekId, safeProjectLabel } from "../extensions/ddotz-autopilot/dogfood-privacy";

const SALT = "0123456789abcdef0123456789abcdef";

describe("dogfood privacy helpers", () => {
  it("hashes prompts without returning raw prompt text", () => {
    const prompt = "내 비밀 토큰 sk-test-123을 쓰는 배포 스크립트 고쳐줘";
    const hash = dogfoodHash(prompt, SALT);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("sk-test-123");
    expect(hash).not.toContain(prompt);
    expect(dogfoodHash(prompt, SALT)).toBe(hash);
    expect(dogfoodHash(prompt, `${SALT}-other`)).not.toBe(hash);
  });

  it("creates stable ISO week ids", () => {
    expect(isoWeekId(new Date("2026-01-01T12:00:00Z"))).toBe("2026-W01");
    expect(isoWeekId(new Date("2026-05-11T00:00:00Z"))).toBe("2026-W20");
  });

  it("uses safe project labels instead of full paths", () => {
    expect(safeProjectLabel("/Users/hyuns/Code/ddotz-pi")).toBe("ddotz-pi");
    expect(safeProjectLabel("/")).toBe("root");
  });

  it("classifies task type without preserving prompt content", () => {
    expect(classifyPromptForDogfood("테스트 고치고 구현해줘")).toMatchObject({ taskType: "coding", summary: "coding task" });
    expect(classifyPromptForDogfood("외부 자료 리서치해서 분석해줘")).toMatchObject({ taskType: "research", summary: "research task" });
    expect(classifyPromptForDogfood("설계 문서 작성해줘")).toMatchObject({ taskType: "writing", summary: "writing task" });
  });
});
