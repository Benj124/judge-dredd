import assert from "node:assert/strict";
import { after, test } from "node:test";
import { migrate } from "../db/migrate";
import { closePool, getPool } from "../db/pool";
import { cleanWikipediaHtml } from "./clean";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestWhaleWikipediaArticles } from "./ingestWhales";
import { WHALE_WIKIPEDIA_SEEDS } from "./seeds";
import {
  getTextDocumentBySlug,
  listTextDocumentSummaries,
  upsertTextDocument,
} from "./store";

after(async () => {
  await closePool();
});

test("listTextDocumentSummaries returns store identity without full text", async () => {
  await migrate();
  const marker = `summary-list-${Date.now()}`;
  await upsertTextDocument({
    slug: marker,
    title: "Summary list fixture whale",
    canonicalUrl: `https://en.wikipedia.org/wiki/Test_${marker}`,
    fullText:
      "The summary list fixture whale is a store-backed document used to prove listTextDocumentSummaries.",
    meta: { corpus: "test" },
  });

  const summaries = await listTextDocumentSummaries();
  const row = summaries.find((doc) => doc.slug === marker);
  assert.ok(row, "expected summary row from text_documents store");
  assert.equal(row.title, "Summary list fixture whale");
  assert.equal(row.canonicalUrl, `https://en.wikipedia.org/wiki/Test_${marker}`);
  assert.ok(row.charCount > 20);
  assert.ok(row.id);
  assert.ok(row.contentHash);
  assert.equal(
    Object.prototype.hasOwnProperty.call(row, "fullText"),
    false,
    "summaries must not include fullText",
  );

  await getPool().query(`DELETE FROM text_documents WHERE slug = $1`, [marker]);
});

test("upsertTextDocument stores and updates whale full text by slug", async () => {
  await migrate();
  const testUrl = "https://en.wikipedia.org/wiki/Blue_whale#judge-dredd-store-test";
  const first = await upsertTextDocument({
    slug: "test-blue-whale",
    title: "Blue whale",
    canonicalUrl: testUrl,
    fullText: "The blue whale is the largest animal known ever to have existed.",
    meta: { corpus: "test" },
  });
  assert.ok(first.id);
  assert.equal(first.slug, "test-blue-whale");
  assert.match(first.fullText, /largest animal/i);
  assert.equal(first.contentHash.length, 64);

  const second = await upsertTextDocument({
    slug: "test-blue-whale",
    title: "Blue whale",
    canonicalUrl: testUrl,
    fullText:
      "The blue whale is the largest animal known ever to have existed. Updated.",
    meta: { corpus: "test" },
  });
  assert.equal(second.id, first.id);
  assert.notEqual(second.contentHash, first.contentHash);
  assert.match(second.fullText, /Updated/);

  const loaded = await getTextDocumentBySlug("test-blue-whale");
  assert.ok(loaded);
  assert.equal(loaded?.contentHash, second.contentHash);

  await getPool().query(`DELETE FROM text_documents WHERE slug = $1`, [
    "test-blue-whale",
  ]);
});

test("offline whale ingest upserts all five seeds into text_documents", async () => {
  await migrate();
  const html = readFileSync(
    join(process.cwd(), "src/lib/graph/fixtures/blue-whale.fragment.html"),
    "utf8",
  );
  const cleaned = cleanWikipediaHtml(html);
  // Use test-only slugs/URLs so we never clobber the live Wikipedia corpus rows.
  const testSeeds = WHALE_WIKIPEDIA_SEEDS.map((seed) => ({
    ...seed,
    slug: `test-${seed.slug}`,
    url: `${seed.url}#judge-dredd-offline-test`,
  }));
  const offlineTexts = Object.fromEntries(
    testSeeds.map((seed) => [
      seed.slug,
      {
        title: seed.label,
        fullText: `${cleaned.fullText}\n\nFixture article for ${seed.label}.`,
      },
    ]),
  );

  const result = await ingestWhaleWikipediaArticles({
    seeds: testSeeds,
    offlineTexts,
  });
  assert.equal(result.errors.length, 0);
  assert.equal(result.items.length, 5);

  for (const seed of testSeeds) {
    const row = await getTextDocumentBySlug(seed.slug);
    assert.ok(row, `expected document for ${seed.slug}`);
    assert.ok(row.fullText.includes(seed.label) || row.title === seed.label);
    assert.ok(row.fullText.length > 50);
  }

  await getPool().query(
    `DELETE FROM text_documents WHERE slug = ANY($1::text[])`,
    [testSeeds.map((seed) => seed.slug)],
  );
});
