import { visibleWidth } from "@mariozechner/pi-tui";
import { describe, expect, it } from "vitest";
import { buildStartupHeaderLines, formatStartupModelLine, plainChocoPiLogoLines, type StartupHeaderStyle } from "../extensions/choco-header/core";

const identityStyle: StartupHeaderStyle = {
  choco: (text) => text,
  pi: (text) => text,
  accent: (text) => text,
  muted: (text) => text,
};
const CHOCO_SEGMENT_WIDTH = 58;
const SVG_MODULE_WIDTH = 3;
const EXPECTED_CHOCO_SEGMENT_LINES = [
  "█████████ ███   ███ █████████ █████████ █████████         ",
  "███       ███   ███ ███   ███ ███       ███   ███         ",
  "███       █████████ ███   ███ ███       ███   ███   ███   ",
  "█████████ ███   ███ █████████ █████████ █████████         ",
];
const EXPECTED_SVG_PI_SEGMENT_LINES = ["█████████", "███   ███", "██████   ███", "███      ███"];

describe("choco startup header core", () => {
  it("renders a lower compact text logo with boxed Choco-Pi metadata", () => {
    const lines = buildStartupHeaderLines(
      {
        version: "9.9.9",
        model: { id: "gpt-5.5", name: "GPT-5.5", provider: "openai-codex" },
        thinkingLevel: "xhigh",
        cwd: "/Users/hyuns",
      },
      160,
      identityStyle,
    );
    const rendered = lines.join("\n");

    const logoLines = plainChocoPiLogoLines();
    const logo = logoLines.join("\n");
    const chocoLogoLines = logoLines.map((line) => line.slice(0, CHOCO_SEGMENT_WIDTH));
    const piLogoLines = logoLines.map((line) => line.slice(CHOCO_SEGMENT_WIDTH).trimEnd());
    const piLogo = piLogoLines.join("\n");

    expect(logoLines).toHaveLength(4);
    expect(chocoLogoLines).toEqual(EXPECTED_CHOCO_SEGMENT_LINES);
    expect(piLogoLines).toEqual(EXPECTED_SVG_PI_SEGMENT_LINES);
    expect(piLogoLines.every((line) => visibleWidth(line) <= SVG_MODULE_WIDTH * 4)).toBe(true);
    expect(lines[0]).toContain("█████████");
    expect(logo).toContain("███   ███   ███   ██████   ███");
    expect(logo).not.toContain("━━━");
    expect(piLogo).toContain("███   ███");
    expect(logo).not.toContain("_ __  _");
    expect(logo).not.toContain("| '_");
    expect(logo).not.toContain("| .__");
    expect(rendered).toContain("╭");
    expect(rendered).toContain("╮");
    expect(rendered).toContain("╰");
    expect(rendered).toContain("│ >_ Choco-Pi (v9.9.9)");
    expect(rendered).toContain("model:");
    expect(rendered).toContain("GPT-5.5 Codex with xhigh effort");
    expect(rendered).toContain("/model: change model");
    expect(rendered).toContain("/effort: change thinking effort");
    expect(rendered).toContain("directory:");
    expect(rendered).toContain("/Users/hyuns");
  });

  it("keeps metadata visible on narrow terminals by stacking it below the logo", () => {
    const lines = buildStartupHeaderLines(
      {
        version: "9.9.9",
        model: { id: "claude-opus-4-7", name: "Opus 4.7 (1M context)", provider: "anthropic" },
        thinkingLevel: "high",
        cwd: "/Users/hyuns/code/choco-pi",
      },
      58,
      identityStyle,
    );

    const rendered = lines.join("\n");

    expect(lines.every((line) => visibleWidth(line) <= 58)).toBe(true);
    expect(rendered).toContain("╭");
    expect(rendered).toContain("│ >_ Choco-Pi (v9.9.9)");
    expect(rendered).toContain("model:");
    expect(rendered).toContain("Opus 4.7 (1M context) with high effort");
    expect(rendered).toContain("/model: change model");
    expect(rendered).toContain("/effort: change thinking effort");
    expect(rendered).toContain("directory:");
    expect(rendered).toContain("/Users/hyuns/code/choco-pi");
  });

  it("formats model and effort in the requested Claude-style wording", () => {
    expect(formatStartupModelLine({ id: "gpt-5.5", name: "GPT-5.5", provider: "openai-codex" }, "xhigh")).toBe("GPT-5.5 Codex with xhigh effort");
    expect(formatStartupModelLine(undefined, "medium")).toBe("no model with medium effort");
  });

  it("exposes the provided SVG-derived block pi mark with matching choco modules", () => {
    const lines = plainChocoPiLogoLines();
    const logo = lines.join("\n");
    const chocoLogoLines = lines.map((line) => line.slice(0, CHOCO_SEGMENT_WIDTH));
    const piLogoLines = lines.map((line) => line.slice(CHOCO_SEGMENT_WIDTH).trimEnd());
    const piLogo = piLogoLines.join("\n");

    expect(lines).toHaveLength(4);
    expect(chocoLogoLines).toEqual(EXPECTED_CHOCO_SEGMENT_LINES);
    expect(piLogoLines).toEqual(EXPECTED_SVG_PI_SEGMENT_LINES);
    expect(piLogoLines.every((line) => visibleWidth(line) <= SVG_MODULE_WIDTH * 4)).toBe(true);
    expect(logo).toContain("█████████");
    expect(logo).toContain("███   ███   ███   ██████   ███");
    expect(logo).not.toContain("━━━");
    expect(piLogo).toContain("███   ███");
    expect(logo).not.toContain("_ __  _");
    expect(logo).not.toContain("| '_");
    expect(logo).not.toContain("| .__");
  });
});
