import { readFile as fsReadFile } from "node:fs/promises";
import { basename, extname, isAbsolute, resolve } from "node:path";
import type { Pool } from "pg";
import { getPool } from "../db/pool";
import { cleanWikipediaHtml } from "./clean";
import { htmlToPlainText, looksLikeWikipediaHtml } from "./htmlText";
import { extractPdfText } from "./pdfText";
import { isHttpUrl, parseSitemapUrls } from "./sitemap";
import { isWikipediaUrl, slugFromFilename, slugFromUrl, slugify } from "./slug";
import { upsertTextDocument, type TextDocument } from "./store";

export type FetchedResource = {
  url: string;
  status: number;
  contentType: string;
  bodyText: string;
  bytes?: Buffer;
};

export type FetchResource = (url: string) => Promise<FetchedResource>;

export type ReadLocalFile = (path: string) => Promise<{
  path: string;
  bytes: Buffer;
}>;

export type CorpusError = { source: string; error: string };

export type CorpusIngestResult = {
  documents: TextDocument[];
  errors: CorpusError[];
};

async function defaultFetch(url: string): Promise<FetchedResource> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "synthkit/0.1 (local ingest)" },
  });
  const contentType = response.headers.get("content-type") ?? "";
  const bytes = Buffer.from(await response.arrayBuffer());
  const bodyText = bytes.toString("utf8");
  return {
    url: response.url || url,
    status: response.status,
    contentType,
    bodyText,
    bytes,
  };
}

async function defaultReadFile(path: string) {
  const abs = isAbsolute(path) ? path : resolve(path);
  const bytes = await fsReadFile(abs);
  return { path: abs, bytes };
}

function firstHeading(text: string): string | undefined {
  const md = text.match(/^#\s+(.+)$/m);
  if (md?.[1]) return md[1].trim();
  const first = text.split(/\n/)[0]?.trim();
  if (first && first.length > 0 && first.length <= 120) return first;
  return undefined;
}

export async function ingestPaste(
  input: {
    title: string;
    body: string;
    slug?: string;
    site?: string;
  },
  pool: Pool = getPool(),
): Promise<TextDocument> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new Error("Paste title is required");
  if (!body) throw new Error("Paste body is required");
  const slug = slugify(input.slug?.trim() || title);
  return upsertTextDocument(
    {
      slug,
      title,
      canonicalUrl: `paste://local/${slug}`,
      fullText: body,
      site: input.site?.trim() || "paste",
      httpStatus: 200,
      meta: { source: "paste" },
    },
    pool,
  );
}

export async function ingestLocalFile(
  filePath: string,
  options: { readFile?: ReadLocalFile; pool?: Pool } = {},
): Promise<TextDocument> {
  const readFile = options.readFile ?? defaultReadFile;
  const pool = options.pool ?? getPool();
  const { path: abs, bytes } = await readFile(filePath);
  const ext = extname(abs).toLowerCase();
  const filename = basename(abs);
  const slug = slugFromFilename(filename);

  let title = slug;
  let fullText = "";
  let kind = "file";

  if (ext === ".pdf") {
    fullText = extractPdfText(bytes);
    title = firstHeading(fullText) || slug;
    kind = "pdf";
  } else if (ext === ".html" || ext === ".htm") {
    const html = bytes.toString("utf8");
    if (looksLikeWikipediaHtml(html)) {
      const cleaned = cleanWikipediaHtml(html);
      title = cleaned.title || slug;
      fullText = cleaned.fullText;
      kind = "html-wikipedia";
    } else {
      const cleaned = htmlToPlainText(html);
      title = cleaned.title || slug;
      fullText = cleaned.fullText;
      kind = "html";
    }
  } else if (ext === ".md" || ext === ".txt" || ext === ".markdown") {
    fullText = bytes.toString("utf8").trim();
    title = firstHeading(fullText) || slug;
    kind = ext === ".txt" ? "txt" : "markdown";
  } else {
    throw new Error(
      `Unsupported file type "${ext || filename}". Use .md, .txt, .html, or .pdf`,
    );
  }

  if (!fullText.trim()) {
    throw new Error(`File "${filename}" produced empty text`);
  }

  return upsertTextDocument(
    {
      slug,
      title,
      canonicalUrl: `file://${abs}`,
      fullText,
      site: "local-file",
      httpStatus: 200,
      meta: { source: "file", kind, filename },
    },
    pool,
  );
}

export async function ingestWikipediaHtml(
  input: {
    url: string;
    html: string;
    httpStatus?: number | null;
  },
  pool: Pool = getPool(),
): Promise<TextDocument> {
  const cleaned = cleanWikipediaHtml(input.html);
  if (!cleaned.fullText.trim()) {
    throw new Error("Wikipedia cleaner returned empty full text");
  }
  const slug = slugFromUrl(input.url);
  return upsertTextDocument(
    {
      slug,
      title: cleaned.title || slug,
      canonicalUrl: input.url,
      fullText: cleaned.fullText,
      site: "en.wikipedia.org",
      httpStatus: input.httpStatus ?? 200,
      meta: { source: "wikipedia-adapter" },
    },
    pool,
  );
}

function resourceToDocumentInput(
  fetched: FetchedResource,
  requestedUrl: string,
): {
  slug: string;
  title: string;
  canonicalUrl: string;
  fullText: string;
  site: string;
  httpStatus: number;
  meta: Record<string, unknown>;
} {
  const canonicalUrl = fetched.url || requestedUrl;
  const slug = slugFromUrl(canonicalUrl);
  const type = fetched.contentType.toLowerCase();
  const bytes = fetched.bytes ?? Buffer.from(fetched.bodyText, "utf8");

  if (isWikipediaUrl(canonicalUrl) || looksLikeWikipediaHtml(fetched.bodyText)) {
    const cleaned = cleanWikipediaHtml(fetched.bodyText);
    if (!cleaned.fullText.trim()) {
      throw new Error("Wikipedia cleaner returned empty full text");
    }
    return {
      slug,
      title: cleaned.title || slug,
      canonicalUrl,
      fullText: cleaned.fullText,
      site: "en.wikipedia.org",
      httpStatus: fetched.status,
      meta: { source: "wikipedia-adapter", contentType: fetched.contentType },
    };
  }

  if (type.includes("pdf") || canonicalUrl.toLowerCase().endsWith(".pdf")) {
    const fullText = extractPdfText(bytes);
    return {
      slug,
      title: firstHeading(fullText) || slug,
      canonicalUrl,
      fullText,
      site: new URL(canonicalUrl).hostname,
      httpStatus: fetched.status,
      meta: { source: "url", kind: "pdf" },
    };
  }

  if (
    type.includes("html") ||
    fetched.bodyText.trim().startsWith("<") ||
    /\.html?$/i.test(canonicalUrl)
  ) {
    const cleaned = htmlToPlainText(fetched.bodyText);
    if (!cleaned.fullText.trim()) {
      throw new Error("HTML produced empty text");
    }
    return {
      slug,
      title: cleaned.title || slug,
      canonicalUrl,
      fullText: cleaned.fullText,
      site: new URL(canonicalUrl).hostname,
      httpStatus: fetched.status,
      meta: { source: "url", kind: "html" },
    };
  }

  const fullText = fetched.bodyText.trim();
  if (!fullText) throw new Error("Fetched URL had empty body");
  return {
    slug,
    title: firstHeading(fullText) || slug,
    canonicalUrl,
    fullText,
    site: new URL(canonicalUrl).hostname,
    httpStatus: fetched.status,
    meta: { source: "url", kind: "text" },
  };
}

export async function ingestUrl(
  url: string,
  options: { fetch?: FetchResource; pool?: Pool } = {},
): Promise<TextDocument> {
  if (!isHttpUrl(url)) {
    throw new Error(`Not an HTTP(S) URL: ${url}`);
  }
  const fetchResource = options.fetch ?? defaultFetch;
  const pool = options.pool ?? getPool();
  const fetched = await fetchResource(url);
  if (fetched.status >= 400) {
    throw new Error(`HTTP ${fetched.status} for ${url}`);
  }
  const input = resourceToDocumentInput(fetched, url);
  return upsertTextDocument(input, pool);
}

export async function ingestSitemapXml(
  xml: string,
  options: { fetch?: FetchResource; pool?: Pool } = {},
): Promise<CorpusIngestResult> {
  const urls = parseSitemapUrls(xml);
  const documents: TextDocument[] = [];
  const errors: CorpusError[] = [];
  for (const loc of urls) {
    try {
      documents.push(await ingestUrl(loc, options));
    } catch (error) {
      errors.push({
        source: loc,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { documents, errors };
}

export async function ingestSitemap(
  xmlOrPathOrUrl: string,
  options: {
    fetch?: FetchResource;
    readFile?: ReadLocalFile;
    pool?: Pool;
  } = {},
): Promise<CorpusIngestResult> {
  const raw = xmlOrPathOrUrl.trim();
  let xml = raw;
  if (isHttpUrl(raw)) {
    const fetchResource = options.fetch ?? defaultFetch;
    const fetched = await fetchResource(raw);
    xml = fetched.bodyText;
  } else if (!raw.includes("<loc")) {
    const readFile = options.readFile ?? defaultReadFile;
    const file = await readFile(raw);
    xml = file.bytes.toString("utf8");
  }
  return ingestSitemapXml(xml, options);
}
