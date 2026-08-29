import * as cheerio from "cheerio";

function collapseInline(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeDocument(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Generic HTML → title + prose. Not the Wikipedia adapter (no infobox/ref strip).
 */
export function htmlToPlainText(html: string): { title: string; fullText: string } {
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe").remove();

  const title =
    $("title").first().text().trim() ||
    $("h1").first().text().trim() ||
    "";

  const root = $("article").first().length
    ? $("article").first()
    : $("main").first().length
      ? $("main").first()
      : $("body").first().length
        ? $("body").first()
        : $.root();

  const blocks: string[] = [];
  root.children().each((_, el) => {
    const node = $(el);
    const tag = ((el as { tagName?: string }).tagName ?? "").toLowerCase();
    if (tag === "script" || tag === "style") return;
    const text = collapseInline(node.text());
    if (text) blocks.push(text);
  });

  let fullText = normalizeDocument(blocks.join("\n\n"));
  if (!fullText) {
    fullText = collapseInline(root.text());
  }
  return { title, fullText };
}

export function looksLikeWikipediaHtml(html: string): boolean {
  return /id=["']mw-content-text["']|id=["']firstHeading["']|mw-parser-output/i.test(
    html,
  );
}
