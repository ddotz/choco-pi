const SECTION_BOUNDARY_PATTERN = /^(?:#{1,6}\s+\S|[A-Za-z][A-Za-z -]{1,40}:\s*)/;

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function markdownHeadingLabel(line: string): string | undefined {
  const match = line.trim().match(/^#{1,6}\s*(.+?)\s*$/);
  return match?.[1];
}

function colonLabel(line: string): { label: string; content: string } | undefined {
  const match = line.trim().match(/^([^:]{1,80}):\s*(.*)$/);
  if (!match) return undefined;
  return { label: match[1], content: match[2] };
}

function isSectionBoundary(line: string): boolean {
  return SECTION_BOUNDARY_PATTERN.test(line.trim());
}

function collectFollowingLines(lines: string[], start: number): string[] {
  const collected: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    if (isSectionBoundary(lines[index])) break;
    collected.push(lines[index]);
  }
  return collected;
}

export function sectionContent(text: string, label: string): string {
  const target = normalizeLabel(label);
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const colon = colonLabel(line);
    if (colon && normalizeLabel(colon.label) === target) {
      return [colon.content, ...collectFollowingLines(lines, index + 1)].join("\n").trim();
    }

    const heading = markdownHeadingLabel(line);
    if (heading && normalizeLabel(heading) === target) {
      return collectFollowingLines(lines, index + 1).join("\n").trim();
    }
  }

  return "";
}

export function sectionHas(text: string, label: string, pattern: RegExp): boolean {
  return pattern.test(sectionContent(text, label));
}
