import { describe, expect, it } from "vitest";
import {
  createExternalSource,
  createSourceRegistry,
  markSourceAdopted,
  sourcesDueForWeeklyCheck,
  summarizeDueSources,
  updateSourceCheckResult,
} from "../extensions/ddotz-autopilot/source-registry";

describe("external source registry", () => {
  it("tracks analyzed external repos/links as candidates and adopted sources", () => {
    let registry = createSourceRegistry();
    const source = createExternalSource("https://github.com/can1357/oh-my-pi", {
      label: "oh-my-pi",
      rationale: "Ideas for autonomous PM/development team runtime",
      now: new Date("2026-05-01T00:00:00Z"),
    });

    registry = { ...registry, sources: [source] };
    registry = markSourceAdopted(registry, source.id, "Borrow source-tracking idea, do not switch runtime", ["source-registry"]);

    expect(registry.sources[0].status).toBe("adopted");
    expect(registry.sources[0].adoptedItems).toEqual(["source-registry"]);
  });

  it("marks sources due once per week and summarizes them for autonomous analysis", () => {
    let registry = createSourceRegistry();
    const source = createExternalSource("https://github.com/tmdgusya/roach-pi", {
      label: "roach-pi",
      now: new Date("2026-05-01T00:00:00Z"),
    });

    registry = { ...registry, sources: [source] };
    expect(sourcesDueForWeeklyCheck(registry, new Date("2026-05-06T23:59:00Z"))).toHaveLength(0);
    expect(sourcesDueForWeeklyCheck(registry, new Date("2026-05-08T00:00:01Z"))).toHaveLength(1);

    const summary = summarizeDueSources(registry, new Date("2026-05-08T00:00:01Z"));
    expect(summary).toContain("roach-pi");
    expect(summary).toContain("weekly update check");
  });

  it("records upstream refs and flags changed sources for follow-up analysis", () => {
    let registry = createSourceRegistry();
    const source = createExternalSource("https://github.com/tmdgusya/roach-pi", {
      now: new Date("2026-05-01T00:00:00Z"),
    });
    registry = { ...registry, sources: [source] };

    registry = updateSourceCheckResult(registry, source.id, {
      checkedAt: new Date("2026-05-08T00:00:00Z"),
      upstreamRef: "abc123",
      ok: true,
    });
    expect(registry.sources[0].changedSinceLastCheck).toBe(true);

    registry = updateSourceCheckResult(registry, source.id, {
      checkedAt: new Date("2026-05-15T00:00:00Z"),
      upstreamRef: "abc123",
      ok: true,
    });
    expect(registry.sources[0].changedSinceLastCheck).toBe(false);
  });
});
