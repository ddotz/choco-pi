import { describe, expect, it } from "vitest";
import {
  createExternalSource,
  createSourceRegistry,
  markSourceAdopted,
  markSourceWatching,
  shouldTrackSourceFromAnalysis,
  sourcesDueForWeeklyCheck,
  summarizeDueSources,
  updateSourceCheckResult,
} from "../extensions/choco-autopilot/source-registry";

describe("external source registry", () => {
  it("does not track links for simple analysis unless their ideas were applied", () => {
    expect(shouldTrackSourceFromAnalysis({ appliedToChocoPi: false, explicitTrackRequest: false })).toBe(false);
    expect(shouldTrackSourceFromAnalysis({ appliedToChocoPi: true, explicitTrackRequest: false })).toBe(true);
    expect(shouldTrackSourceFromAnalysis({ appliedToChocoPi: false, explicitTrackRequest: true })).toBe(true);
  });

  it("tracks adopted external repos/links and their adopted items", () => {
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
    expect(registry.sources[0].rejectedItems).toEqual([]);
  });

  it("records adoption depth, reviewed ref, and scoped adoption decisions", () => {
    let registry = createSourceRegistry();
    const source = createExternalSource("https://github.com/example/upstream-utility", {
      now: new Date("2026-05-01T00:00:00Z"),
    });
    registry = { ...registry, sources: [{ ...source, changedSinceLastCheck: true, lastKnownRef: "abc123" }] };

    registry = markSourceAdopted(registry, source.id, "Partially port the guard pattern, reject vendoring.", {
      adoptionDepth: "partial-port",
      adoptedItems: ["mode-scoped quality guard"],
      rejectedItems: ["vendor whole runtime"],
      reviewedRef: "abc123",
      reviewedAt: new Date("2026-05-11T00:00:00Z"),
      scopeRationale: "Use the idea, not the package boundary.",
      clearChangedFlag: true,
    });

    expect(registry.sources[0]).toMatchObject({
      status: "adopted",
      adoptionDepth: "partial-port",
      adoptedItems: ["mode-scoped quality guard"],
      rejectedItems: ["vendor whole runtime"],
      lastReviewedRef: "abc123",
      lastReviewedAt: "2026-05-11T00:00:00.000Z",
      scopeRationale: "Use the idea, not the package boundary.",
      changedSinceLastCheck: false,
    });
  });

  it("marks sources as watching when adoption-analysis chooses watch depth", () => {
    let registry = createSourceRegistry();
    const source = createExternalSource("https://github.com/example/upstream-utility", {
      now: new Date("2026-05-01T00:00:00Z"),
    });
    registry = { ...registry, sources: [{ ...source, changedSinceLastCheck: true, lastKnownRef: "abc123" }] };

    registry = markSourceWatching(registry, source.id, "Watch upstream until license stabilizes.", {
      adoptionDepth: "idea-only",
      reviewedRef: "abc123",
      reviewedAt: new Date("2026-05-11T00:00:00Z"),
      scopeRationale: "Watch only; do not adopt code yet.",
      clearChangedFlag: true,
    });

    expect(registry.sources[0]).toMatchObject({
      status: "watching",
      adoptionDepth: "idea-only",
      lastAdoptionReview: "Watch upstream until license stabilizes.",
      lastReviewedRef: "abc123",
      lastReviewedAt: "2026-05-11T00:00:00.000Z",
      scopeRationale: "Watch only; do not adopt code yet.",
      changedSinceLastCheck: false,
    });
  });

  it("marks sources due once per week and summarizes them for autonomous analysis", () => {
    let registry = createSourceRegistry();
    const source = createExternalSource("https://github.com/example/upstream-utility", {
      label: "upstream-utility",
      now: new Date("2026-05-01T00:00:00Z"),
    });

    registry = { ...registry, sources: [source] };
    expect(sourcesDueForWeeklyCheck(registry, new Date("2026-05-06T23:59:00Z"))).toHaveLength(0);
    expect(sourcesDueForWeeklyCheck(registry, new Date("2026-05-08T00:00:01Z"))).toHaveLength(1);

    const summary = summarizeDueSources(registry, new Date("2026-05-08T00:00:01Z"));
    expect(summary).toContain("upstream-utility");
    expect(summary).toContain("weekly update check");
  });

  it("treats the first successful upstream ref check as a baseline instead of a change", () => {
    let registry = createSourceRegistry();
    const source = createExternalSource("https://github.com/example/upstream-utility", {
      now: new Date("2026-05-01T00:00:00Z"),
    });
    registry = { ...registry, sources: [source] };

    registry = updateSourceCheckResult(registry, source.id, {
      checkedAt: new Date("2026-05-08T00:00:00Z"),
      upstreamRef: "abc123",
      ok: true,
    });
    expect(registry.sources[0].changedSinceLastCheck).toBe(false);

    registry = updateSourceCheckResult(registry, source.id, {
      checkedAt: new Date("2026-05-15T00:00:00Z"),
      upstreamRef: "def456",
      ok: true,
    });
    expect(registry.sources[0].changedSinceLastCheck).toBe(true);
  });
});
