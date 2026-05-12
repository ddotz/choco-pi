import { describe, expect, it } from "vitest";
import {
  addCustomWorkMode,
  createWorkModeRegistry,
  listWorkModes,
  removeCustomWorkMode,
} from "../extensions/ddotz-autopilot/work-mode-registry";

describe("work mode registry", () => {
  it("starts with every built-in mode implemented", () => {
    const registry = createWorkModeRegistry();
    const defaultMode = registry.modes.find((mode) => mode.id === "default");
    expect(defaultMode?.status).toBe("implemented");
    expect(defaultMode?.folder).toBe("modes/default");
    expect(defaultMode?.description).toContain("Root all-purpose generalist mode");
    expect(defaultMode?.description).toContain("best preserves ddotz-pi philosophy");
    expect(defaultMode?.description).not.toContain("without weakening guardrails");
    expect(registry.modes.find((mode) => mode.id === "web-analysis")?.status).toBe("implemented");
    expect(registry.modes.find((mode) => mode.id === "web-analysis")?.instructionFile).toBe("modes/web-analysis/MODE.md");
    expect(registry.modes.find((mode) => mode.id === "adoption-analysis")?.status).toBe("implemented");
    expect(registry.modes.find((mode) => mode.id === "adoption-analysis")?.instructionFile).toBe("modes/adoption-analysis/MODE.md");
    expect(registry.modes.find((mode) => mode.id === "report")?.status).toBe("implemented");
    expect(registry.modes.find((mode) => mode.id === "report")?.instructionFile).toBe("modes/report/MODE.md");
    expect(registry.modes.find((mode) => mode.id === "coding")?.status).toBe("implemented");
    expect(registry.modes.find((mode) => mode.id === "coding")?.instructionFile).toBe("modes/coding/MODE.md");
    expect(registry.modes.find((mode) => mode.id === "design")?.status).toBe("implemented");
    expect(registry.modes.find((mode) => mode.id === "design")?.instructionFile).toBe("modes/design/MODE.md");
    expect(registry.modes.find((mode) => mode.id === "design")?.description).toContain("product/UI design");
  });

  it("allows adding custom planned modes", () => {
    let registry = createWorkModeRegistry();
    registry = addCustomWorkMode(registry, {
      id: "design-review",
      description: "Review UI and UX artifacts with autonomous PM discipline.",
    });

    const mode = registry.modes.find((item) => item.id === "design-review");
    expect(mode?.status).toBe("planned");
    expect(mode?.custom).toBe(true);
    expect(mode?.folder).toBe("modes/design-review");
    expect(mode?.instructionFile).toBe("modes/design-review/MODE.md");
  });

  it("allows removing custom modes but protects built-ins", () => {
    let registry = createWorkModeRegistry();
    registry = addCustomWorkMode(registry, { id: "design-review", description: "Review UI." });
    registry = removeCustomWorkMode(registry, "design-review");
    expect(registry.modes.some((mode) => mode.id === "design-review")).toBe(false);

    expect(() => removeCustomWorkMode(registry, "default")).toThrow(/built-in/);
  });

  it("lists modes in a concise user-facing form", () => {
    const list = listWorkModes(createWorkModeRegistry());
    expect(list).toContain("default");
    expect(list).toContain("implemented");
    expect(list).toContain("coding");
    expect(list.length).toBeLessThan(1000);
  });
});
