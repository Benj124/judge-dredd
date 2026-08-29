/**
 * Parse a urlset (or sitemapindex) XML document into loc URLs.
 * Pure: no network.
 */
export function parseSitemapUrls(xml: string): string[] {
  const text = xml.trim();
  if (!text) {
    throw new Error("Sitemap XML is empty");
  }
  const locs = [...text.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) =>
    match[1].trim(),
  );
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const loc of locs) {
    if (!loc || seen.has(loc)) continue;
    seen.add(loc);
    unique.push(loc);
  }
  if (unique.length === 0) {
    throw new Error("Sitemap XML contained no <loc> URLs");
  }
  return unique;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
