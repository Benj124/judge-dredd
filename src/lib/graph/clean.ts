import { createHash } from "node:crypto";
import * as cheerio from "cheerio";

const STRIP_SELECTORS = [
  "script",
  "style",
  "noscript",
  "link",
  "meta",
  "sup.reference",
  "span.mw-editsection",
  "div.navbox",
  "table.navbox",
  "div.sistersitebox",
  "table.metadata",
  "div.metadata",
  "div#toc",
  "div.toc",
  "table.infobox",
  "div.infobox",
  "div.thumb",
  "figure",
  "div.mw-references-wrap",
  "ol.references",
  "div.reflist",
  "div.refbegin",
  "table.ambox",
  "div.ambox",
  "div.hatnote",
  "div.shortdescription",
  "span.mw-cite-backlink",
  "span.reference-text",
  "div.printfooter",
  "div.catlinks",
  "div#catlinks",
  "div.mw-authority-control",
  "table.sidebar",
  "div.sidebar",
  "div.noprint",
  "span.noprint",
  "div.navigation-not-searchable",
].join(", ");

/** Collapse HTML source wrapping into single spaces; keep intentional blank lines elsewhere. */
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
 * Convert Wikipedia (or Wikipedia-like) HTML into clean article full text.
 * Pure function — works on Playwright page content or offline fixtures.
 */
export function cleanWikipediaHtml(html: string): {
  title: string;
  fullText: string;
} {
  const $ = cheerio.load(html);

  const title =
    $("h1#firstHeading").first().text().trim() ||
    $("h1").first().text().trim() ||
    $("title").first().text().replace(/\s*-\s*Wikipedia\s*$/i, "").trim() ||
    "";

  const root =
    $("#mw-content-text .mw-parser-output").first().length > 0
      ? $("#mw-content-text .mw-parser-output").first()
      : $("#mw-content-text").first().length > 0
        ? $("#mw-content-text").first()
        : $("body").first();

  root.find(STRIP_SELECTORS).remove();

  // Drop sections that are not article prose (from heading to next same-level heading).
  const dropHeadingPrefixes = [
    "references",
    "external links",
    "see also",
    "further reading",
    "notes",
    "bibliography",
    "sources",
    "citations",
  ];

  root.find("h2, h3").each((_, el) => {
    const heading = $(el);
    const label = heading
      .text()
      .replace(/\[edit\]/gi, "")
      .trim()
      .toLowerCase();
    if (!dropHeadingPrefixes.some((prefix) => label.startsWith(prefix))) {
      return;
    }
    let cursor = heading.next();
    heading.remove();
    while (cursor.length > 0) {
      const tag = (cursor[0] as { tagName?: string }).tagName?.toLowerCase() ?? "";
      if (tag === "h2" || tag === "h3") break;
      const next = cursor.next();
      cursor.remove();
      cursor = next;
    }
  });

  const blocks: string[] = [];
  root.children().each((_, el) => {
    const node = $(el);
    const tag = ((el as { tagName?: string }).tagName ?? "").toLowerCase();
    if (tag === "table" || tag === "style" || tag === "script") return;
    const text = collapseInline(node.text());
    if (!text) return;
    if (tag.match(/^h[1-6]$/)) {
      blocks.push(text.replace(/\[edit\]/gi, "").trim());
      return;
    }
    blocks.push(text);
  });

  let fullText = normalizeDocument(blocks.join("\n\n"));
  if (!fullText) {
    fullText = collapseInline(root.text());
  }

  return { title, fullText };
}

export function contentHash(fullText: string): string {
  return createHash("sha256").update(fullText, "utf8").digest("hex");
}
