import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { migrate } from "../db/migrate";
import { closePool, getPool } from "../db/pool";
import { cleanWikipediaHtml } from "./clean";
import {
  ingestLocalFile,
  ingestPaste,
  ingestSitemapXml,
  ingestUrl,
  ingestWikipediaHtml,
  type FetchedResource,
} from "./corpus";
import { encodeSimplePdf, extractPdfText } from "./pdfText";
import { parseSitemapUrls } from "./sitemap";

after(async () => {
  await closePool();
});

const FIXTURES = join(process.cwd(), "src/lib/graph/fixtures");

async function cleanupSlugs(slugs: string[]) {
  const pool = getPool();
  await pool.query(`DELETE FROM text_documents WHERE slug = ANY($1::text[])`, [
    slugs,
  ]);
}

test("ingestPaste upserts a document from title+body without whale seeds", async () => {
  await migrate();
  const slug = `paste-corpus-${Date.now()}`;
  try {
    const doc = await ingestPaste({
      title: "Pasted briefing",
      body: "The pasted zinnium notes exist only in this paste ingest test.",
      slug,
    });
    assert.equal(doc.slug, slug);
    assert.equal(doc.site, "paste");
    assert.match(doc.canonicalUrl, /^paste:\/\//);
    assert.match(doc.fullText, /pasted zinnium notes/i);
    assert.doesNotMatch(doc.slug, /blue-whale|orca/);
  } finally {
    await cleanupSlugs([slug]);
  }
});

test("local .md .txt .html files from fixtures upsert documents", async () => {
  await migrate();
  const slugs = ["corpus-note", "corpus-plain", "corpus-page"];
  try {
    const md = await ingestLocalFile(join(FIXTURES, "corpus-note.md"));
    assert.equal(md.slug, "corpus-note");
    assert.equal(md.site, "local-file");
    assert.match(md.title, /Zinnium briefing/i);
    assert.match(md.fullText, /zinnium crystal glows at midnight/i);

    const txt = await ingestLocalFile(join(FIXTURES, "corpus-plain.txt"));
    assert.equal(txt.slug, "corpus-plain");
    assert.match(txt.fullText, /quorblax megafauna/i);

    const html = await ingestLocalFile(join(FIXTURES, "corpus-page.html"));
    assert.equal(html.slug, "corpus-page");
    assert.match(html.title, /Local HTML corpus/i);
    assert.match(html.fullText, /hydrax protocol/i);
    assert.doesNotMatch(html.fullText, /should be stripped/);
  } finally {
    await cleanupSlugs(slugs);
  }
});

test("fixture PDF upserts extracted text", async () => {
  await migrate();
  const dir = mkdtempSync(join(tmpdir(), "corpus-pdf-"));
  const pdfPath = join(dir, "zinnium-brief.pdf");
  const phrase = "The zinnium briefing is a local PDF corpus.";
  writeFileSync(pdfPath, encodeSimplePdf(phrase));
  assert.match(extractPdfText(readFileSync(pdfPath)), /zinnium briefing/i);

  try {
    const doc = await ingestLocalFile(pdfPath);
    assert.equal(doc.slug, "zinnium-brief");
    assert.match(doc.fullText, /zinnium briefing is a local PDF corpus/i);
    assert.equal(doc.site, "local-file");
    assert.match(doc.canonicalUrl, /^file:\/\//);
  } finally {
    await cleanupSlugs(["zinnium-brief"]);
  }
});

test("sitemap XML fixture lists URLs; injected fetch stores those documents", async () => {
  await migrate();
  const xml = readFileSync(join(FIXTURES, "corpus-sitemap.xml"), "utf8");
  const urls = parseSitemapUrls(xml);
  assert.deepEqual(urls, [
    "https://example.test/zinnium",
    "https://example.test/hydrax",
  ]);

  const pages: Record<string, string> = {
    "https://example.test/zinnium":
      "<html><head><title>Zinnium page</title></head><body><p>Sitemap zinnium article body.</p></body></html>",
    "https://example.test/hydrax":
      "<html><head><title>Hydrax page</title></head><body><p>Sitemap hydrax article body.</p></body></html>",
  };

  const fetchResource = async (url: string): Promise<FetchedResource> => {
    const bodyText = pages[url];
    if (!bodyText) throw new Error(`unexpected fetch ${url}`);
    return {
      url,
      status: 200,
      contentType: "text/html; charset=utf-8",
      bodyText,
    };
  };

  try {
    const result = await ingestSitemapXml(xml, { fetch: fetchResource });
    assert.equal(result.errors.length, 0, result.errors.map((e) => e.error).join("; "));
    assert.equal(result.documents.length, 2);
    const zinnium = result.documents.find((doc) => doc.slug === "zinnium");
    const hydrax = result.documents.find((doc) => doc.slug === "hydrax");
    assert.ok(zinnium);
    assert.ok(hydrax);
    assert.match(zinnium.fullText, /Sitemap zinnium article body/);
    assert.match(hydrax.fullText, /Sitemap hydrax article body/);
    assert.equal(zinnium.site, "example.test");
  } finally {
    await cleanupSlugs(["zinnium", "hydrax"]);
  }
});

test("Wikipedia adapter strips nav/refs on the whale HTML fixture and stores cleaned prose", async () => {
  await migrate();
  const html = readFileSync(
    join(FIXTURES, "blue-whale.fragment.html"),
    "utf8",
  );
  const cleaned = cleanWikipediaHtml(html);
  assert.match(cleaned.fullText, /largest animal known ever to have existed/i);
  assert.doesNotMatch(cleaned.fullText, /Example ref/i);
  assert.doesNotMatch(cleaned.fullText, /External links/i);

  try {
    const doc = await ingestWikipediaHtml({
      url: "https://en.wikipedia.org/wiki/Corpus_fixture_whale",
      html,
    });
    assert.equal(doc.slug, "corpus-fixture-whale");
    assert.match(doc.fullText, /largest animal known ever to have existed/i);
    assert.match(doc.fullText, /long tapering body/i);
    assert.doesNotMatch(doc.fullText, /Example ref/i);
    assert.doesNotMatch(doc.fullText, /\[edit\]/i);
    assert.equal(doc.site, "en.wikipedia.org");
  } finally {
    await cleanupSlugs(["corpus-fixture-whale"]);
  }
});

test("ingestUrl uses injected HTML and Wikipedia adapter for wikipedia.org", async () => {
  await migrate();
  const html = readFileSync(
    join(FIXTURES, "blue-whale.fragment.html"),
    "utf8",
  );
  try {
    const doc = await ingestUrl("https://en.wikipedia.org/wiki/Adapter_whale", {
      fetch: async (url) => ({
        url,
        status: 200,
        contentType: "text/html",
        bodyText: html,
      }),
    });
    assert.equal(doc.slug, "adapter-whale");
    assert.doesNotMatch(doc.fullText, /Example ref/i);
    assert.match(doc.fullText, /largest animal/i);
  } finally {
    await cleanupSlugs(["adapter-whale"]);
  }
});
