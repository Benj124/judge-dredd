export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "doc";
}

export function slugFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    return slugify(decodeURIComponent(last) || parsed.hostname);
  } catch {
    return slugify(url);
  }
}

export function slugFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  return slugify(base);
}

export function isWikipediaUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "wikipedia.org" || host.endsWith(".wikipedia.org");
  } catch {
    return false;
  }
}
