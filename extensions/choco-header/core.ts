import type { Theme } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { formatModelLabel, type MinimalModel } from "../choco-footer/core.ts";

export type { MinimalModel };

export interface StartupHeaderInput {
  version: string;
  model?: MinimalModel | null;
  thinkingLevel: string;
  cwd: string;
}

export interface StartupHeaderStyle {
  choco: (text: string) => string;
  pi: (text: string) => string;
  accent: (text: string) => string;
  muted: (text: string) => string;
}

interface LogoLineSegments {
  choco: string;
  pi: string;
}

type FourRowGlyph = readonly [string, string, string, string];

const FILLED_LOGO_MODULE = "███";
const EMPTY_LOGO_MODULE = "   ";
const CHOCO_LETTER_SPACING = " ";
const CHOCO_PI_SEPARATOR = ["         ", "         ", "   ███   ", "         "] as const satisfies FourRowGlyph;
const LOGO_ROW_INDICES = [0, 1, 2, 3] as const;
const CHOCO_GLYPHS = {
  C: ["111", "100", "100", "111"],
  H: ["101", "101", "111", "101"],
  O: ["111", "101", "101", "111"],
} as const satisfies Record<string, FourRowGlyph>;
const CHOCO_WORD = ["C", "H", "O", "C", "O"] as const;

// Derived from the provided 800×800 SVG path grid:
// row 1: M165.29..H517.36            => 1110
// row 2: outer cells with inner hole   => 1010
// row 3: lower step + detached block   => 1101
// row 4: left leg + detached block     => 1001
const SVG_PI_GLYPH = ["1110", "1010", "1101", "1001"] as const satisfies FourRowGlyph;

function renderLogoCellRow(row: string): string {
  return Array.from(row, (cell) => (cell === "1" ? FILLED_LOGO_MODULE : EMPTY_LOGO_MODULE)).join("");
}

function renderChocoRow(rowIndex: (typeof LOGO_ROW_INDICES)[number]): string {
  return `${CHOCO_WORD.map((letter) => renderLogoCellRow(CHOCO_GLYPHS[letter][rowIndex])).join(CHOCO_LETTER_SPACING)}${CHOCO_PI_SEPARATOR[rowIndex]}`;
}

const LOGO_SEGMENTS: LogoLineSegments[] = LOGO_ROW_INDICES.map((rowIndex) => ({
  choco: renderChocoRow(rowIndex),
  pi: renderLogoCellRow(SVG_PI_GLYPH[rowIndex]),
}));

function ansiRgb(r: number, g: number, b: number, text: string): string {
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

export function createStartupHeaderStyle(theme: Theme): StartupHeaderStyle {
  return {
    choco: (text) => theme.bold(ansiRgb(255, 222, 173, text)),
    pi: (text) => theme.bold(ansiRgb(140, 211, 164, text)),
    accent: (text) => theme.fg("accent", theme.bold(text)),
    muted: (text) => theme.fg("muted", text),
  };
}

export function plainChocoPiLogoLines(): string[] {
  return LOGO_SEGMENTS.map((line) => `${line.choco}${line.pi}`.trimEnd());
}

function styledLogoLines(style: StartupHeaderStyle): string[] {
  return LOGO_SEGMENTS.map((line) => `${style.choco(line.choco)}${style.pi(line.pi)}`.trimEnd());
}

function padAnsiRight(value: string, width: number): string {
  const padding = Math.max(0, width - visibleWidth(value));
  return padding > 0 ? `${value}${" ".repeat(padding)}` : value;
}

function borderLine(left: string, fill: string, right: string, width: number, style: StartupHeaderStyle): string {
  const inner = Math.max(0, width - 2);
  return style.accent(`${left}${fill.repeat(inner)}${right}`);
}

function boxedLine(content: string, innerWidth: number, style: StartupHeaderStyle): string {
  const clipped = truncateToWidth(content, innerWidth);
  return `${style.accent("│")} ${padAnsiRight(clipped, innerWidth)} ${style.accent("│")}`;
}

function truncateLines(lines: string[], width: number): string[] {
  return lines.map((line) => truncateToWidth(line, width));
}

export function formatStartupModelLine(model: MinimalModel | undefined | null, thinkingLevel: string): string {
  return `${formatModelLabel(model)} with ${thinkingLevel} effort`;
}

function infoBoxLines(input: StartupHeaderInput, width: number, style: StartupHeaderStyle): string[] {
  const title = style.accent(`>_ Choco-Pi (v${input.version})`);
  const model = `${style.muted("model:")}     ${style.muted(formatStartupModelLine(input.model, input.thinkingLevel))}`;
  const commands = `${style.accent("/model:")} ${style.muted("change model")} ${style.muted("·")} ${style.accent("/effort:")} ${style.muted("change thinking effort")}`;
  const directory = `${style.muted("directory:")} ${style.muted(input.cwd)}`;
  const naturalWidth = Math.max(visibleWidth(title), visibleWidth(model), visibleWidth(commands), visibleWidth(directory)) + 4;
  const boxWidth = Math.max(2, Math.min(Math.max(2, width), Math.max(42, Math.min(96, naturalWidth))));
  const innerWidth = Math.max(1, boxWidth - 4);

  return [
    borderLine("╭", "─", "╮", boxWidth, style),
    boxedLine(title, innerWidth, style),
    boxedLine("", innerWidth, style),
    boxedLine(model, innerWidth, style),
    boxedLine(commands, innerWidth, style),
    boxedLine(directory, innerWidth, style),
    borderLine("╰", "─", "╯", boxWidth, style),
  ];
}

export function buildStartupHeaderLines(input: StartupHeaderInput, width: number, style: StartupHeaderStyle): string[] {
  const safeWidth = Math.max(1, width);
  const logo = styledLogoLines(style);
  return truncateLines([...logo, "", ...infoBoxLines(input, safeWidth, style)], safeWidth);
}
