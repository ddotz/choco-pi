import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createReadToolDefinition, getLanguageFromPath } from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { getPathArg, getReadStartLine, getTextContent, isTruncated } from "../../node_modules/ddotz-pi-utilities/extensions/pi-code-previews/src/data.ts";
import { metadata, previewFooter, showingFooter } from "../../node_modules/ddotz-pi-utilities/extensions/pi-code-previews/src/format.ts";
import { resolvePreviewLanguage } from "../../node_modules/ddotz-pi-utilities/extensions/pi-code-previews/src/language.ts";
import { renderDisplayPath } from "../../node_modules/ddotz-pi-utilities/extensions/pi-code-previews/src/paths.ts";
import { normalizeShikiLanguage, shouldSkipHighlight } from "../../node_modules/ddotz-pi-utilities/extensions/pi-code-previews/src/shiki.ts";
import { escapeControlChars } from "../../node_modules/ddotz-pi-utilities/extensions/pi-code-previews/src/terminal-text.ts";
import { renderHighlightedPreviewText, withSecretWarning } from "../../node_modules/ddotz-pi-utilities/extensions/pi-code-previews/src/tool-renderers/common.ts";

export default function focusRendering(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    const cwd = ctx.cwd;
    const originalRead = createReadToolDefinition(cwd);

    pi.registerTool({
      ...originalRead,
      renderCall(args, theme) {
        const path = getPathArg(args);
        const lang = resolvePreviewLanguage({ path, piLanguage: getLanguageFromPath(path) });
        let text = `${theme.fg("toolTitle", theme.bold("read"))} ${renderDisplayPath(path, cwd, theme)}`;
        if (typeof args.offset === "number" || typeof args.limit === "number") {
          const start = typeof args.offset === "number" ? args.offset : 1;
          const end = typeof args.limit === "number" ? start + args.limit - 1 : undefined;
          text += theme.fg("warning", `:${start}${end ? `-${end}` : ""}`);
        }
        text += metadata(theme, [lang ? normalizeShikiLanguage(lang) : undefined]);
        return new Text(text, 0, 0);
      },
      renderResult(result, { expanded, isPartial }, theme, context) {
        if (isPartial) return new Text(theme.fg("warning", "Reading…"), 0, 0);
        const firstText = getTextContent(result.content);
        if (context.isError) {
          return new Text(theme.fg("error", escapeControlChars(firstText.split("\n")[0] || "Read failed")), 0, 0);
        }

        if (!expanded) return new Container();

        const path = getPathArg(context.args);
        if (result.content?.some((part) => part.type === "image")) {
          return new Text(theme.fg("dim", escapeControlChars(firstText.replace(/^Read image file/i, "image"))), 0, 0);
        }

        const lang = resolvePreviewLanguage({ path, content: firstText, piLanguage: getLanguageFromPath(path) });
        const firstLine = getReadStartLine(context.args);
        const skipHighlight = shouldSkipHighlight(firstText);
        const preview = renderHighlightedPreviewText(firstText, 0, skipHighlight ? undefined : lang, theme, context.invalidate, { firstLine });

        let text = preview.lines.length ? withSecretWarning(firstText, theme, preview.lines.join("\n")) : theme.fg("muted", "Empty file");
        if (preview.hidden > 0) text += showingFooter(theme, preview.shown, preview.total, "lines");
        if (skipHighlight) text += previewFooter(theme, "Syntax highlighting skipped for large file");
        if (isTruncated(result.details)) text += previewFooter(theme, "Output truncated by read");
        return new Text(text, 0, 0);
      },
    });
  });
}
